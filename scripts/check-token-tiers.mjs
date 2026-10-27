// Token tiers (ADR-0023, ADR-0027, ADR-0056, after Brad Frost's three-tier model).
// 1. In the token files, each tier may only reference the tiers below it:
//    primitive → primitive · palette, brand → nothing · semantic/themes → primitive, palette,
//    semantic, themes · component → semantic, themes. Every theme defines the same roles.
// 2. In the code, components use Tailwind utilities generated from tiers 2–3. Raw `--dc-*`
//    variables may appear only in src/index.css (the page accent, display type, textures) and brand variables only in
//    the logo files (Logo.tsx and the holiday logos' stylesheets). Corners use radius roles
//    (`rounded-button`, `rounded-container`; ADR-0056) and shadows use role or component tokens (`shadow-popover`, `shadow-box`), not the raw scale
//    (`rounded-lg`, `shadow-sm`). Motion uses the motion roles (ADR-0053): no raw durations or
//    easings (`duration-300`, `ease-out`, `transition: color 0.2s`) outside src/index.css, except
//    endless loops (`infinite`), which keep their own pace.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

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

// ---- 1. References between tiers -------------------------------------------------------------
// Each theme (a folder in tokens/themes/, ADR-0056) is checked with the shared tiers, the way the
// build sees it. A theme's palette.json is its own tier 1: raw values that reference nothing.
const MAY_REFERENCE = {
  primitive: ['primitive'],
  palette: [],
  brand: [],
  semantic: ['primitive', 'semantic', 'themes'],
  themes: ['primitive', 'palette', 'semantic', 'themes'],
  component: ['semantic', 'themes'],
}
const tierOf = (file) =>
  file.endsWith('/palette.json') ? 'palette' : relative('tokens', file).split('/')[0]
/** Every token in these files: path → { tier, file, value }. */
const read = (files) => {
  const tokens = new Map()
  for (const file of files) {
    const visit = (node, path) => {
      if (node && typeof node === 'object' && '$value' in node) {
        tokens.set(path.join('.'), { tier: tierOf(file), file, value: node.$value })
        return
      }
      for (const [k, v] of Object.entries(node ?? {}))
        if (!k.startsWith('$')) visit(v, [...path, k])
    }
    visit(JSON.parse(readFileSync(file, 'utf8')), [])
  }
  return tokens
}
const refsIn = (value) => [...JSON.stringify(value).matchAll(/\{([^{}"]+)\}/g)].map((m) => m[1])

const THEMES = 'tokens/themes'
const shared = walk('tokens', /\.json$/).filter((f) => !f.startsWith(THEMES))
const themes = readdirSync(THEMES).map((id) => {
  const files = walk(join(THEMES, id), /\.json$/).filter((f) => !f.endsWith('/meta.json'))
  const meta = JSON.parse(readFileSync(join(THEMES, id, 'meta.json'), 'utf8'))
  return { id, files, meta }
})
let count = 0
for (const theme of themes) {
  const tokens = read([...shared, ...theme.files])
  count = Math.max(count, tokens.size)
  for (const [path, { tier, file, value }] of tokens) {
    if (!(tier in MAY_REFERENCE)) fail(`${file}: unknown tier folder "${tier}"`)
    for (const ref of refsIn(value)) {
      const target = tokens.get(ref)
      if (!target) fail(`${file}: ${path} references missing token {${ref}}`)
      else if (!MAY_REFERENCE[tier]?.includes(target.tier))
        fail(`${file}: ${path} (${tier}) may not reference {${ref}} (${target.tier})`)
    }
  }
}

// ---- 1b. Every theme has the same roles (ADR-0056) -------------------------------------------
// Copying a theme folder is only safe if components can count on every role being there. So each
// theme must define exactly the default theme's role names (its palette is free-form).
const roleNames = (theme) =>
  new Set(read(theme.files.filter((f) => !f.endsWith('/palette.json'))).keys())
const defaults = themes.filter((t) => t.meta.default)
if (defaults.length !== 1)
  fail(`${THEMES}: exactly one theme must have "default": true in meta.json`)
else {
  const expected = roleNames(defaults[0])
  for (const theme of themes) {
    const actual = roleNames(theme)
    for (const name of expected)
      if (!actual.has(name)) fail(`${THEMES}/${theme.id}: missing role ${name}`)
    for (const name of actual)
      if (!expected.has(name))
        fail(
          `${THEMES}/${theme.id}: ${name} is not a role of ${defaults[0].id}; add it there first`,
        )
  }
}

// ---- 2. Code ---------------------------------------------------------------------------------
const ALLOWED = {
  // The page accent, and the theme values Tailwind has no utility for (display type, textures).
  'src/index.css': /--dc-(?:color|font-display|texture|text-shadow)-/,
  'src/components/layout/Logo.tsx': /--dc-brand-/,
  'src/components/layout/HalloweenLogo.css': /--dc-brand-/,
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
      for (const [, name] of line.matchAll(/(--dc-[\w-]+)/g)) {
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

if (!problems) console.log(`✓ token tiers respected (${count} tokens, ${themes.length} themes)`)
process.exit(problems ? 1 : 0)
