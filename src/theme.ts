// The theme (brand look) on the page (ADR-0056): which one is on, switching to another with a
// cross-fade, and loading a theme's fonts.
//
// A theme is a set of CSS variables under `<html data-theme="<id>">` (src/styles/themes/, built
// from tokens/themes/). public/theme-boot.js sets the attribute before the first paint from a
// `?theme=` link or the saved choice; from then on this module owns it.
import { saveThemePreference } from './adapters/local/LocalThemePreference'
import { DEFAULT_THEME_ID, THEMES, type ThemeInfo } from './styles/themes'

/** The theme with this id, if there is one. */
export function findTheme(id: string | null | undefined): ThemeInfo | undefined {
  return THEMES.find((t) => t.id === id)
}

/** The default theme (generated, so it always exists). */
const defaultTheme = () => findTheme(DEFAULT_THEME_ID) as ThemeInfo

/** The theme on the page now. No `data-theme` (or an unknown one) means the default. */
export function currentTheme(): ThemeInfo {
  return findTheme(document.documentElement.dataset.theme) ?? defaultTheme()
}

/** Puts a theme on the page: its variables (through `data-theme`) and the browser's bar color. */
function apply(theme: ThemeInfo) {
  document.documentElement.dataset.theme = theme.id
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.themeColor)
}

/**
 * Switches to a theme and remembers it on this device. Its fonts are loaded first, so the change
 * lands on the new type rather than a fallback that swaps a moment later. The page cross-fades
 * over the `enter` motion role (index.css) where the browser supports view transitions; otherwise,
 * and under reduced motion, it changes at once.
 */
export async function switchTheme(id: string) {
  const theme = findTheme(id)
  if (!theme) return
  saveThemePreference(theme.id)
  await theme.loadFonts?.()
  const instant =
    typeof document.startViewTransition !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (instant) {
    apply(theme)
    return
  }
  await document.startViewTransition(() => apply(theme)).finished
}

/**
 * Runs once at startup: saves a theme picked by a `?theme=` link (the boot script has already put
 * it on the page), and loads the fonts of whichever theme is on.
 */
export function initTheme() {
  const linked = findTheme(new URLSearchParams(window.location.search).get('theme'))
  if (linked) saveThemePreference(linked.id)
  void currentTheme().loadFonts?.()
}
