// How code reads design tokens. The token build (tokens/engine/) already checks the tokens
// themselves (tiers, names, every theme defining the same roles, contrast); this checks the code:
// - token variables (--theme-*) are read through Tailwind utilities, except in the few files
//   listed in ALLOWED, where Tailwind has no utility for them;
// - corners and shadows use role utilities (rounded-button, shadow-box), not Tailwind's raw scale;
// - motion uses motion roles, not raw durations or easings (except endless loops).
// See docs/design-tokens.md.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir, ext) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p, ext) : ext.test(p) ? [p] : []
  })

let problems = 0
const fail = (msg) => {
  console.error(msg)
  problems++
}

// Token variables read directly, not through a Tailwind utility, only where Tailwind has no
// utility for them: the page accent and the display type, textures and headline shadow
// (index.css), and the logo colors (the two logo files).
const ALLOWED = {
  'src/index.css': /--theme-(?:signal|font-display|texture|size-headline)-/,
  'src/components/layout/Logo.tsx': /--theme-logo-/,
  'src/components/layout/HalloweenLogo.css': /--theme-logo-/,
}
const IGNORE = /^src\/styles\//
const RAW_SCALE =
  /(?<![\w-])(?:[\w-]+:)*(rounded(?:-[trblse]{1,2})?-(?:xs|sm|md|lg|xl|[234]xl)|rounded|shadow-(?:2xs|xs|sm|md|lg|xl|2xl))(?![\w-])/g
// Tailwind's raw duration and easing classes; `duration-(--motion-…)` reads a role and passes.
const RAW_MOTION_CLASS =
  /(?<![\w-])(?:[\w-]+:)*(duration-\d+|ease-(?:in|out|in-out|linear))(?![\w-])/g
// A literal time in a CSS transition or animation declaration.
const RAW_MOTION_CSS = /^\s*(?:transition|animation)(?:-duration)?\s*:.*\d(?:ms|s)\b/
for (const file of walk('src', /\.(tsx?|css)$/)) {
  if (IGNORE.test(file)) continue
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [, name] of line.matchAll(/(--theme-[\w-]+)/g)) {
        if (!ALLOWED[file]?.test(name))
          fail(`${file}:${i + 1} ${name}: use a Tailwind utility instead`)
      }
      if (/\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file)) {
        for (const [, cls] of line.matchAll(RAW_SCALE)) {
          fail(
            `${file}:${i + 1} ${cls}: use a radius role (rounded-button, rounded-container…) or a shadow role (shadow-box, shadow-popover…)`,
          )
        }
        for (const [, cls] of line.matchAll(RAW_MOTION_CLASS)) {
          fail(`${file}:${i + 1} ${cls}: use a motion role (transition, animate-*, --motion-*)`)
        }
      }
      if (file.endsWith('.css') && file !== 'src/index.css') {
        if (RAW_MOTION_CSS.test(line) && !/infinite/.test(line))
          fail(
            `${file}:${i + 1}: use a motion role (--theme(--default-transition-duration), --motion-*)`,
          )
      }
    })
}

if (!problems) console.log('✓ code reads tokens through Tailwind utilities and token roles')
process.exit(problems ? 1 : 0)
