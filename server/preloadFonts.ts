// Build plugin: preloads the default theme's web fonts from index.html (ADR-0040, ADR-0056). Without it the browser only
// discovers a font once text using it is on screen, so the first paint uses the fallback fonts and
// every heading reflows when Anton arrives (a visible jump, ADR-0040's display face). Preloading
// starts the downloads with the stylesheet, so the fonts are usually ready for the first paint.
// No extra bytes: every page already loads these files. Other themes' fonts are left alone: they
// load only when someone picks that theme.
//
// Only the Latin files: the other subsets (Latin Extended, Vietnamese) load on demand, only for
// text that needs them (their CSS `unicode-range`). Build only: in dev the fonts aren't bundled.
import { readdirSync, readFileSync } from 'node:fs'
import type { HtmlTagDescriptor, Plugin } from 'vite'

/**
 * The Latin file names (without the hash) of the default theme's fonts, from its meta.json:
 * `@fontsource/anton/400.css` → `anton-latin-400-normal`, as Vite names the file it bundles.
 */
export function defaultThemeFaces(themesDir = 'tokens/themes'): string[] {
  for (const id of readdirSync(themesDir)) {
    const meta = JSON.parse(readFileSync(`${themesDir}/${id}/meta.json`, 'utf8')) as {
      default?: boolean
      fonts: string[]
    }
    if (!meta.default) continue
    return meta.fonts.map((css) => {
      const [, family, weight] = /^@fontsource\/([\w-]+)\/(\d{3})\.css$/.exec(css) ?? []
      if (!family) throw new Error(`preloadFonts: can't read the font ${css}`)
      return `${family}-latin-${weight}-normal`
    })
  }
  throw new Error('preloadFonts: no default theme')
}

/**
 * The `<link rel="preload">` tags for the given faces' Latin files among the build's output files.
 * @param faces - Latin file names without the hash (`anton-latin-400-normal`).
 * @throws When a face has no file (a font was renamed or not bundled): the build fails so this is
 *   checked, rather than quietly preloading too little.
 */
export function fontPreloadTags(
  files: readonly string[],
  faces: readonly string[],
): HtmlTagDescriptor[] {
  const fonts = faces
    .map((face) => {
      const file = files.find((f) => f.startsWith(`assets/${face}-`) && f.endsWith('.woff2'))
      if (!file) throw new Error(`preloadFonts: no font file for ${face}`)
      return file
    })
    .sort()
  return fonts.map((href) => ({
    tag: 'link',
    // Fonts are always fetched in CORS mode, so the preload needs `crossorigin` to be reused.
    attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${href}`, crossorigin: '' },
    injectTo: 'head',
  }))
}

/** The plugin for vite.config.ts. */
export function preloadFonts(): Plugin {
  return {
    name: 'deep-cuts:preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      // After the bundle is written, so the hashed font file names are known.
      order: 'post',
      handler: (_html, { bundle }) =>
        fontPreloadTags(Object.keys(bundle ?? {}), defaultThemeFaces()),
    },
  }
}
