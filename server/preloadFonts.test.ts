// Tests for the font preload build plugin: it preloads the default theme's Latin font files only,
// with the attributes a font preload needs, and fails the build when one of them is missing.
import { describe, expect, it } from 'vitest'
import { defaultThemeFaces, fontPreloadTags } from './preloadFonts.ts'

const LATIN = [
  'assets/anton-latin-400-normal-Byf51wtH.woff2',
  'assets/courier-prime-latin-400-normal-BbyBr73r.woff2',
  'assets/courier-prime-latin-700-normal-D1YCjmaD.woff2',
  'assets/special-elite-latin-400-normal-YjDd9tmf.woff2',
]

const FACES = [
  'anton-latin-400-normal',
  'courier-prime-latin-400-normal',
  'courier-prime-latin-700-normal',
  'special-elite-latin-400-normal',
]

describe('defaultThemeFaces', () => {
  it("reads the default theme's fonts from its meta.json", () => {
    expect(defaultThemeFaces().sort()).toEqual(FACES)
  })
})

describe('fontPreloadTags', () => {
  it("preloads the default theme's Latin fonts only, as CORS font requests", () => {
    const tags = fontPreloadTags(
      [
        'index.html',
        'assets/index-1_nwiA3b.css',
        'assets/anton-latin-ext-400-normal-SyiqE2Jt.woff2',
        'assets/anton-vietnamese-400-normal-CkBxLiRJ.woff2',
        // Another theme's font: it loads only when that theme is picked.
        'assets/inter-latin-400-normal-C38fXH4l.woff2',
        ...LATIN,
      ],
      FACES,
    )
    expect(tags.map((t) => t.attrs?.href)).toEqual(LATIN.map((f) => `/${f}`))
    expect(tags[0]).toEqual({
      tag: 'link',
      attrs: {
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        href: `/${LATIN[0]}`,
        crossorigin: '',
      },
      injectTo: 'head',
    })
  })

  it('fails the build when a font file is missing', () => {
    expect(() => fontPreloadTags(LATIN.slice(1), FACES)).toThrow(
      /no font file for anton-latin-400-normal/,
    )
  })
})
