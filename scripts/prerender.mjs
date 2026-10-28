// Writes the pre-rendered landing page into dist/index.html (ADR-0057). Runs as part of
// `npm run build`, after the app's build: bundles src/prerender.tsx for Node into
// build/prerender/ with the app's own Vite config, renders it, and fills #root with the result.
// Fails the build if #root isn't where it's expected, rather than quietly shipping an empty page.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

const outDir = 'build/prerender'
await build({
  logLevel: 'warn',
  // Not public/: the app's build already copied it to dist/, and Node needs only the script.
  build: { ssr: 'src/prerender.tsx', outDir, emptyOutDir: true, copyPublicDir: false },
})
const { renderLanding } = await import(pathToFileURL(`${outDir}/prerender.js`).href)

const file = 'dist/index.html'
const html = readFileSync(file, 'utf8')
const empty = '<div id="root"></div>'
if (!html.includes(empty)) throw new Error(`prerender: no empty ${empty} in ${file}`)
writeFileSync(file, html.replace(empty, `<div id="root">${renderLanding()}</div>`))
console.log('pre-rendered the landing page into dist/index.html')
