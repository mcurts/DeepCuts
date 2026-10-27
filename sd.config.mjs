// Builds design tokens (DTCG 2025.10, tokens/**/*.json) into every output (ADR-0006, ADR-0023,
// ADR-0027, ADR-0056):
// - CSS variables: tokens.css (the shared tiers) and one file per theme in styles/themes/ (each
//   brand's palette and roles, under `[data-theme='<id>']`; the default theme also under `:root`)
// - theme.css: the Tailwind theme, GENERATED from the tokens so class names always match token
//   names (`color.fg.muted` → `text-fg-muted`, `elevation.box` → `shadow-box`)
// - themes.ts (the list the theme chooser reads), theme-fonts.css (the default theme's fonts) and
//   public/theme-boot.js (applies a saved theme before the first paint)
// - a flat JSON per theme (checks), a typed ES module (SVG/canvas, React Native) and DTCG JSON for
//   Figma, both from the default theme
//
// A theme is a folder in tokens/themes/ (ADR-0056). Every theme defines the same role names, so
// one Style Dictionary build runs per theme: the shared tiers plus that theme's folder.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import StyleDictionary from 'style-dictionary'
import { THEME_KEY } from './src/adapters/local/themeKey.ts'
import { STORAGE_PREFIX } from './src/adapters/local/versionedStore.ts'

/** Where the app saves the chosen theme (LocalThemePreference), read by the boot script. */
const THEME_STORAGE_KEY = STORAGE_PREFIX + THEME_KEY

/**
 * Tiers by source folder (ADR-0027). A theme folder's palette.json is its own tier 1 ('palette'):
 * raw values, never exposed as Tailwind classes.
 */
const tierOf = (token) =>
  token.filePath.endsWith('/palette.json') ? 'palette' : token.filePath.split('/')[1]
const isTheme = (token) => token.filePath.split('/')[1] === 'themes'

// ---- Values: DTCG objects → CSS strings ------------------------------------------------------
const withUnit = (v) => (typeof v === 'object' && v !== null ? `${v.value}${v.unit}` : `${v}`)
const toHex = (c) =>
  '#' +
  c.components
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
const cssColor = (c) => {
  if (typeof c === 'string') return c
  if (c.alpha === undefined || c.alpha === 1) return c.hex ?? toHex(c)
  return `rgb(${c.components.map((x) => Math.round(x * 255)).join(' ')} / ${c.alpha})`
}
const quoteFamily = (f) => (/\s/.test(f) ? `'${f}'` : f)
const cssValue = (type, v) => {
  switch (type) {
    case 'dimension':
    case 'duration':
      return withUnit(v)
    case 'color':
      return cssColor(v)
    case 'fontFamily':
      // A string with commas is a stack that was already written out (aliases resolve twice).
      return Array.isArray(v) ? v.map(quoteFamily).join(', ') : v.includes(',') ? v : quoteFamily(v)
    case 'cubicBezier':
      return `cubic-bezier(${v.join(', ')})`
    case 'shadow':
      return (Array.isArray(v) ? v : [v])
        .map(
          (s) =>
            [s.offsetX, s.offsetY, s.blur, s.spread].map(withUnit).join(' ') +
            ` ${cssColor(s.color)}`,
        )
        .join(', ')
    default:
      return v
  }
}

StyleDictionary.registerTransform({
  name: 'dc/value/css',
  type: 'value',
  transitive: true,
  filter: (token) => typeof token.$value !== 'string' || token.$type === 'fontFamily',
  transform: (token) => cssValue(token.$type, token.$value),
})

// ---- Tailwind theme (generated) ---------------------------------------------------------------
/** Tailwind key for a token: its path joined with dashes, minus a leading namespace and a
 *  trailing `default` (`color.surface.default` → `surface`). */
const twName = (path) => (path.at(-1) === 'default' ? path.slice(0, -1) : path).join('-')

// Which tokens become which Tailwind namespaces. What a theme can change (colors, fonts, corners,
// shadows) goes through CSS variables, so switching `data-theme` (and the page accent, ADR-0020)
// changes it at runtime; everything else is written as its value.
const NAMESPACES = [
  // [Tailwind prefix, token path prefix, tiers exposed]
  ['color', ['color'], ['themes', 'component']],
  ['font', ['font', 'family'], ['themes']],
  ['text', ['font', 'size'], ['primitive']],
  ['font-weight', ['font', 'weight'], ['primitive']],
  ['tracking', ['font', 'tracking'], ['primitive']],
  ['leading', ['font', 'leading'], ['primitive']],
  ['radius', ['radius'], ['themes', 'component']],
  ['shadow', ['shadow'], ['component']],
  ['shadow', ['elevation'], ['themes']],
  ['blur', ['blur'], ['primitive']],
  ['breakpoint', ['size', 'breakpoint'], ['primitive']],
  ['container', ['size', 'container'], ['primitive']],
  ['ease', ['easing'], ['primitive']],
]
const startsWith = (path, prefix) => prefix.every((p, i) => path[i] === p)
/** Namespaces written as variables, so a theme can change them (ADR-0056). */
const THEMED = new Set(['color', 'font', 'radius', 'shadow'])

StyleDictionary.registerFormat({
  name: 'tailwind/theme',
  format: ({ dictionary }) => {
    const byPath = new Map(dictionary.allTokens.map((t) => [t.path.join('.'), t]))
    const value = (path) => byPath.get(path).$value
    const lines = []
    const varLines = []
    for (const [tw, prefix, tiers] of NAMESPACES) {
      const themed = THEMED.has(tw)
      const out = themed ? varLines : lines
      const tokens = dictionary.allTokens.filter(
        (t) => startsWith(t.path, prefix) && tiers.includes(tierOf(t)),
      )
      if (!tokens.length) continue
      out.push('', `  /* ${prefix.join('.')} (${tiers.join(', ')}) */`)
      for (const t of tokens) {
        const name = `--${tw}-${twName(t.path.slice(prefix.length))}`
        out.push(`  ${name}: ${themed ? `var(--${t.name})` : t.$value};`)
        if (tw === 'text') {
          // Written as Tailwind does (a unitless ratio) so line boxes round identically.
          const size = t.original.$value.value
          const lineHeight = byPath.get(`font.line-height.${t.path.at(-1)}`).original.$value.value
          const ratio = lineHeight === size ? '1' : `calc(${lineHeight} / ${size})`
          lines.push(`  ${name}--line-height: ${ratio};`)
        }
      }
    }
    return [
      '/* GENERATED by sd.config.mjs from tokens/**. Do not edit; change the tokens instead. */',
      '/* Tailwind’s defaults are replaced by the token values (which are those defaults, ADR-0027). */',
      // `static`: every themed variable is emitted, even ones only referenced at runtime
      // (tagColor(), genreTone() build `var(--color-tag-…)` in code, which Tailwind can't see).
      '@theme static inline {',
      '  --color-*: initial;',
      '  --font-*: initial;',
      '  --radius-*: initial;',
      '  --shadow-*: initial;',
      ...varLines,
      '}',
      '',
      '@theme inline {',
      '  --text-*: initial;',
      '  --font-weight-*: initial;',
      '  --tracking-*: initial;',
      '  --leading-*: initial;',
      '  --blur-*: initial;',
      '  --breakpoint-*: initial;',
      '  --container-*: initial;',
      '  --ease-*: initial;',
      `  --spacing: ${value('space.unit')};`,
      '  --default-font-family: var(--dc-font-family-body);',
      `  --default-transition-duration: ${value('motion.transition.duration')};`,
      `  --default-transition-timing-function: ${value('motion.transition.easing')};`,
      `  --animate-enter: enter ${value('motion.enter.duration')} ${value('motion.enter.easing')} both;`,
      `  --animate-fade-in: fade-in ${value('motion.enter.duration')} ${value('motion.enter.easing')} both;`,
      // Overlays and controls that appear or leave in answer to a press (popovers, Undo, Save) fade
      // on the default transition, so they keep pace with the press that summoned them.
      `  --animate-pop-in: fade-in ${value('motion.transition.duration')} ${value('motion.transition.easing')} both;`,
      `  --animate-pop-out: fade-out ${value('motion.transition.duration')} ${value('motion.transition.easing')} both;`,
      // Motion roles for motion outside the default transition (VhsBox.css, the ticker, the
      // Halloween logo), read with --theme() or as a variable. Tailwind has no namespace for
      // durations, so they're named for the role.
      `  --motion-enter-duration: ${value('motion.enter.duration')};`,
      `  --motion-enter-easing: ${value('motion.enter.easing')};`,
      `  --motion-turn-duration: ${value('motion.turn.duration')};`,
      `  --motion-turn-easing: ${value('motion.turn.easing')};`,
      `  --motion-glow-duration: ${value('motion.glow.duration')};`,
      `  --motion-glow-easing: ${value('motion.glow.easing')};`,
      ...lines,
      '}',
      '',
    ].join('\n')
  },
})

// ---- Figma: DTCG 2025.10 ---------------------------------------------------------------------
// Colors become objects (2025.10 requires them); aliases are kept so Figma variables reference
// each other the same way the source tokens do. Other values are already DTCG in the source.
const toDtcgColor = (hex) => ({
  colorSpace: 'srgb',
  components: [1, 3, 5].map((i) => +(parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4)),
  hex,
})

StyleDictionary.registerFormat({
  name: 'dtcg/2025.10',
  format: ({ dictionary }) => {
    const root = {}
    for (const token of dictionary.allTokens) {
      let node = root
      for (const key of token.path.slice(0, -1)) node = node[key] ??= {}
      const raw = token.original.$value
      const isAlias = typeof raw === 'string' && raw.startsWith('{')
      node[token.path.at(-1)] = {
        $type: token.$type,
        $value:
          isAlias || token.$type !== 'color' || typeof raw !== 'string' ? raw : toDtcgColor(raw),
        ...(token.$description && { $description: token.$description }),
      }
    }
    return JSON.stringify(root, null, 2) + '\n'
  },
})

// ---- Theme layer: one CSS file per theme --------------------------------------------------------
// The theme's palette and roles as variables under its selector, plus its color scheme (so form
// controls and scrollbars match a light or dark theme).
StyleDictionary.registerFormat({
  name: 'dc/theme-css',
  format: async ({ dictionary, options }) => {
    const { formattedVariables } = await import('style-dictionary/utils')
    const vars = formattedVariables({
      format: 'css',
      dictionary,
      outputReferences: true,
      usesDtcg: true,
    })
    return [
      '/* GENERATED by sd.config.mjs from tokens/themes/. Do not edit; change the tokens instead. */',
      `${options.selector} {`,
      `  color-scheme: ${options.colorScheme};`,
      vars,
      '}',
      '',
    ].join('\n')
  },
})

// ---- Themes ------------------------------------------------------------------------------------
const THEMES_DIR = 'tokens/themes'
const themes = readdirSync(THEMES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => {
    const dir = `${THEMES_DIR}/${d.name}`
    const meta = JSON.parse(readFileSync(`${dir}/meta.json`, 'utf8'))
    // Every .json in the folder except meta.json (which describes the theme, it holds no tokens).
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'meta.json')
      .map((f) => `${dir}/${f}`)
    return { id: d.name, dir, meta, files }
  })
const defaults = themes.filter((t) => t.meta.default)
if (defaults.length !== 1)
  throw new Error(`exactly one theme must be the default (${defaults.length})`)
const defaultTheme = defaults[0]
// Default first, then by label, so the chooser lists the house look first.
themes.sort(
  (a, b) =>
    (b.meta.default ? 1 : 0) - (a.meta.default ? 1 : 0) || a.meta.label.localeCompare(b.meta.label),
)

const SHARED = ['primitive', 'semantic', 'component', 'brand'].map((t) => `tokens/${t}/**/*.json`)
const css = ['name/kebab', 'dc/value/css']

// ---- Shared outputs: built against the default theme -------------------------------------------
// Shared tokens that point at theme roles (components) are written as var() references, so they
// follow whichever theme is on.
const sd = new StyleDictionary({
  source: [...SHARED, ...defaultTheme.files],
  log: { verbosity: 'silent' },
  platforms: {
    css: {
      transforms: css,
      prefix: 'dc',
      buildPath: 'src/styles/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
          filter: (t) => !isTheme(t),
          options: { outputReferences: true },
        },
      ],
    },
    tailwind: {
      transforms: css,
      prefix: 'dc',
      buildPath: 'src/styles/',
      files: [{ destination: 'theme.css', format: 'tailwind/theme' }],
    },
    js: {
      transforms: ['name/pascal', 'dc/value/css'],
      buildPath: 'build/tokens/js/',
      files: [
        { destination: 'tokens.js', format: 'javascript/es6' },
        { destination: 'tokens.d.ts', format: 'typescript/es6-declarations' },
      ],
    },
    figma: {
      transforms: ['name/kebab'],
      buildPath: 'build/figma/',
      files: [{ destination: 'deep-cuts.tokens.json', format: 'dtcg/2025.10' }],
    },
  },
})
await sd.buildAllPlatforms()

// ---- Per theme: its CSS layer and a flat JSON for the checks -----------------------------------
const flat = {}
for (const theme of themes) {
  const selector = `${theme.meta.default ? ':root, ' : ''}[data-theme='${theme.id}']`
  const themeSd = new StyleDictionary({
    source: [...SHARED, ...theme.files],
    log: { verbosity: 'silent' },
    platforms: {
      css: {
        transforms: css,
        prefix: 'dc',
        buildPath: 'src/styles/themes/',
        files: [
          {
            destination: `${theme.id}.css`,
            format: 'dc/theme-css',
            filter: isTheme,
            options: { selector, colorScheme: theme.meta.colorScheme },
          },
        ],
      },
      json: {
        transforms: css,
        buildPath: `build/tokens/${theme.id}/`,
        files: [{ destination: 'tokens.json', format: 'json/flat' }],
      },
    },
  })
  await themeSd.buildAllPlatforms()
  flat[theme.id] = JSON.parse(readFileSync(`build/tokens/${theme.id}/tokens.json`, 'utf8'))
}
// The default theme's flat JSON also at the old path, for the icon generator.
writeFileSync('build/tokens/tokens.json', JSON.stringify(flat[defaultTheme.id], null, 2) + '\n')

// ---- Generated app files -----------------------------------------------------------------------
const GENERATED =
  'GENERATED by sd.config.mjs from tokens/themes/. Do not edit; change the tokens instead.'

// Every theme's CSS, imported by index.css. All of them load with the app (about 2 kB each), so a
// saved theme is ready at the first paint; only their fonts wait until a theme is chosen.
writeFileSync(
  'src/styles/themes.css',
  [`/* ${GENERATED} */`, ...themes.map((t) => `@import './themes/${t.id}.css';`), ''].join('\n'),
)

// The default theme's fonts load with the app.
writeFileSync(
  'src/styles/theme-fonts.css',
  [`/* ${GENERATED} */`, ...defaultTheme.meta.fonts.map((f) => `@import '${f}';`), ''].join('\n'),
)

// The list the theme chooser reads. Other themes' fonts are dynamic imports, so Vite splits them
// out of the first load.
const entry = (t) => {
  const fonts = t.meta.default ? [] : t.meta.fonts
  return [
    '  {',
    `    id: '${t.id}',`,
    `    label: '${t.meta.label}',`,
    `    colorScheme: '${t.meta.colorScheme}',`,
    `    themeColor: '${flat[t.id]['color-surface-default']}',`,
    `    loadFonts: ${fonts.length ? `() => Promise.all([${fonts.map((f) => `import('${f}')`).join(', ')}])` : 'undefined'},`,
    '  },',
  ].join('\n')
}
writeFileSync(
  'src/styles/themes.ts',
  [
    `// ${GENERATED}`,
    '',
    '/** One theme (brand look) the app can switch to (ADR-0056). */',
    'export interface ThemeInfo {',
    '  /** The folder name in tokens/themes/, and the value of <html data-theme>. */',
    '  id: string',
    '  /** The name the chooser shows. */',
    '  label: string',
    "  colorScheme: 'light' | 'dark'",
    "  /** The page color, for the browser's theme-color. */",
    '  themeColor: string',
    "  /** Loads the theme's fonts; undefined for the default theme, whose fonts load with the app. */",
    '  loadFonts: (() => Promise<unknown>) | undefined',
    '}',
    '',
    '/** Every theme, the default first. */',
    'export const THEMES: readonly ThemeInfo[] = [',
    ...themes.map(entry),
    ']',
    '',
    '/** The theme used when none is chosen. */',
    `export const DEFAULT_THEME_ID = '${defaultTheme.id}'`,
    '',
  ].join('\n'),
)

// The boot script: a classic script in <head> (index.html) that runs before the first paint and
// applies a `?theme=` link or the saved choice, so a returning visitor never sees the default flash
// first. External, so the CSP keeps `script-src 'self'` (ADR-0008, ADR-0056).
const colors = Object.fromEntries(themes.map((t) => [t.id, flat[t.id]['color-surface-default']]))
mkdirSync('public', { recursive: true })
writeFileSync(
  'public/theme-boot.js',
  `/* ${GENERATED} */
(function () {
  var themes = ${JSON.stringify(colors)};
  var id = new URLSearchParams(location.search).get('theme');
  try {
    if (!themes[id]) id = JSON.parse(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}));
  } catch (e) {}
  if (!themes[id] || id === ${JSON.stringify(defaultTheme.id)}) return;
  document.documentElement.setAttribute('data-theme', id);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', themes[id]);
})();
`,
)
