// Tests for switching themes: the theme on the page comes from <html data-theme>, a switch saves
// the choice, sets the browser bar color and loads the theme's fonts first, cross-fades only when
// the browser can and motion is welcome, and a `?theme=` link is remembered at startup.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearThemePreference, loadThemePreference } from './adapters/local/LocalThemePreference'
import { DEFAULT_THEME_ID, THEMES, type ThemeInfo } from './styles/themes'
import { currentTheme, findTheme, initTheme, switchTheme } from './theme'

// Any theme other than the default (the build has at least two).
const other = THEMES.find((t) => t.id !== DEFAULT_THEME_ID) as ThemeInfo

beforeEach(() => {
  clearThemePreference()
  delete document.documentElement.dataset.theme
  document.head.innerHTML = '<meta name="theme-color" content="" />'
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  // jsdom has no view transitions (or matchMedia); tests that add one remove it.
  delete (document as Partial<Document>).startViewTransition
})

describe('findTheme and currentTheme', () => {
  it('finds a theme by id, and nothing for an unknown one', () => {
    expect(findTheme(other.id)).toBe(other)
    expect(findTheme('no-such-theme')).toBeUndefined()
    expect(findTheme(null)).toBeUndefined()
  })

  it('is the default when <html> names no theme or an unknown one', () => {
    expect(currentTheme().id).toBe(DEFAULT_THEME_ID)
    document.documentElement.dataset.theme = 'no-such-theme'
    expect(currentTheme().id).toBe(DEFAULT_THEME_ID)
  })

  it('is the theme <html> names', () => {
    document.documentElement.dataset.theme = other.id
    expect(currentTheme()).toBe(other)
  })
})

describe('switchTheme', () => {
  it('puts the theme on the page, saves it, sets the bar color and loads its fonts first', async () => {
    const loadFonts = vi.fn(() => {
      // The fonts load before the theme goes on.
      expect(document.documentElement.dataset.theme).toBeUndefined()
      return Promise.resolve()
    })
    vi.spyOn(other, 'loadFonts', 'get').mockReturnValue(loadFonts)
    await switchTheme(other.id)
    expect(loadFonts).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.theme).toBe(other.id)
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      other.themeColor,
    )
    expect(loadThemePreference()).toBe(other.id)
  })

  it('ignores an unknown theme', async () => {
    await switchTheme('no-such-theme')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(loadThemePreference()).toBeNull()
  })

  it('cross-fades with a view transition when the browser has one', async () => {
    const startViewTransition = vi.fn((update: () => void) => {
      update()
      return { finished: Promise.resolve() }
    })
    Object.assign(document, { startViewTransition })
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    await switchTheme(other.id)
    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.theme).toBe(other.id)
  })

  it('switches at once under reduced motion', async () => {
    const startViewTransition = vi.fn()
    Object.assign(document, { startViewTransition })
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    await switchTheme(other.id)
    expect(startViewTransition).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.theme).toBe(other.id)
  })
})

describe('initTheme', () => {
  it('remembers a theme picked by a ?theme= link, and loads the fonts of the theme on', () => {
    const loadFonts = vi.fn(() => Promise.resolve())
    vi.spyOn(other, 'loadFonts', 'get').mockReturnValue(loadFonts)
    window.history.replaceState(null, '', `/?theme=${other.id}`)
    // The boot script has already put it on the page.
    document.documentElement.dataset.theme = other.id
    initTheme()
    expect(loadThemePreference()).toBe(other.id)
    expect(loadFonts).toHaveBeenCalledOnce()
  })

  it('ignores a link to an unknown theme', () => {
    window.history.replaceState(null, '', '/?theme=no-such-theme')
    initTheme()
    expect(loadThemePreference()).toBeNull()
  })
})
