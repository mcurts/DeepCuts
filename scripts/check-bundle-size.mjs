// First-load budget (runs after `npm run build`, part of `npm run verify` and CI).
//
// The limits are a published baseline, not our own guess: Alex Russell's "The Performance
// Inequality Gap, 2026" budget for a page that is interactive within 3 seconds for the 75th
// percentile user (a Galaxy A24-class phone on a 9 Mbps, 100 ms RTT network, two connections).
// We take its JavaScript-light row, the stricter one: at most 0.3 MiB of JavaScript inside
// 2.0 MiB of critical-path resources. JavaScript is held to the tighter limit because, byte for
// byte, it costs far more than anything else to download, parse and run.
//
// Every route can be someone's first visit (a shared link to a film opens Detail cold), so the
// check runs once for the app shell, then once for the shell plus each lazily loaded script
// (a page, or a part a page loads on demand) with everything that script imports.
// Sizes are what crosses the network: text files gzipped (Cloudflare serves Brotli, which is
// smaller, so this errs safe) and fonts as stored (WOFF2 is already compressed). To see what's
// inside a file, run `npm run analyze` and open build/bundle-report.html.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const MIB = 1024 * 1024
/** The 3-second, JavaScript-light budget from the source above, in bytes. */
const BUDGET = { js: 0.3 * MIB, total: 2.0 * MIB }

const read = (file) => readFileSync(`dist/${file}`)
const gz = (file) => gzipSync(read(file)).length
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`

// The shell: index.html plus every script, preload and stylesheet it links.
const html = readFileSync('dist/index.html', 'utf8')
const shell = new Set(
  [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]),
)

// Fonts the shell's CSS points at. Each family is split by unicode-range and a browser fetches
// only the subsets its text uses; the app's text is English, so only the `latin` files count.
const fonts = new Set()
for (const css of [...shell].filter((f) => f.endsWith('.css'))) {
  for (const [, file] of read(css)
    .toString()
    .matchAll(/url\(\/(assets\/[^)]+\.woff2)\)/g)) {
    if (/-latin-\d/.test(file)) fonts.add(file)
  }
}

/** A script plus everything it statically imports, and the stylesheet Vite pairs with it. */
function withImports(file, into = new Set()) {
  if (into.has(file)) return into
  into.add(file)
  const css = file.replace(/-[\w-]+\.js$/, '')
  for (const f of readdirSync('dist/assets')) {
    if (f.endsWith('.css') && `assets/${f}`.replace(/-[\w-]+\.css$/, '') === css) {
      into.add(`assets/${f}`)
    }
  }
  const code = read(file).toString()
  for (const [, dep] of code.matchAll(/(?:from|import)\s*"\.\/([\w.-]+\.js)"/g)) {
    if (existsSync(`dist/assets/${dep}`)) withImports(`assets/${dep}`, into)
  }
  return into
}

// The lazily loaded scripts: every one the shell doesn't already load.
const lazy = readdirSync('dist/assets')
  .map((f) => `assets/${f}`)
  .filter((f) => f.endsWith('.js') && !shell.has(f))

/** Sums one entry point: the page itself, its scripts and styles, and the shell's fonts. */
function measure(name, files) {
  let js = 0
  let total = gz('index.html')
  for (const f of files) {
    const size = gz(f)
    total += size
    if (f.endsWith('.js')) js += size
  }
  for (const f of fonts) total += statSync(`dist/${f}`).size
  return { name, js, total, ok: js <= BUDGET.js && total <= BUDGET.total }
}

const shellResult = measure('first visit (app shell)', shell)
const routes = lazy
  .map((file) => measure(`first visit via ${file}`, new Set([...shell, ...withImports(file)])))
  .sort((a, b) => b.js - a.js)

const line = (r) =>
  `${r.ok ? '✓' : '✗'} ${r.name}: JS ${kib(r.js)} of ${kib(BUDGET.js)}, ` +
  `total ${kib(r.total)} of ${kib(BUDGET.total)}`
// The shell, then the five heaviest entry points, then any other that fails.
console.log(line(shellResult))
routes.slice(0, 5).forEach((r) => console.log(line(r)))
routes
  .slice(5)
  .filter((r) => !r.ok)
  .forEach((r) => console.log(line(r)))
process.exit([shellResult, ...routes].every((r) => r.ok) ? 0 : 1)
