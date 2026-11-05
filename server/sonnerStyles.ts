// Build plugin: stops Sonner (the toast library, src/notify.ts) from adding its stylesheet as an
// inline <style> tag. The CSP allows styles from this app only (style-src 'self'), so
// the browser blocks that tag and logs two CSP errors on every page that loads toasts. The app
// imports the same stylesheet as a normal CSS file instead (src/components/layout/SonnerToaster.tsx).
//
// Build only: the dev server sends no CSP, and pre-bundles libraries without running plugins.
import type { Plugin } from 'vite'

// Sonner's built files, where `__insertCSS` is defined.
const SONNER_FILE = /node_modules[\\/]sonner[\\/]dist[\\/]index\.m?js$/
const INSERT_CSS = 'function __insertCSS(code) {'

/**
 * Removes the body of the inline-style injection from Sonner. Turning it into an early `return`
 * keeps the function (and every call to it) valid.
 * @returns The changed code, or null when `code` isn't Sonner's.
 * @throws When a Sonner file no longer contains the injection, e.g. after an upgrade changed it:
 *   the build fails rather than quietly bringing back the CSP errors.
 */
export function stripSonnerInlineStyles(code: string, id: string): string | null {
  if (!SONNER_FILE.test(id)) return null
  if (!code.includes(INSERT_CSS)) {
    throw new Error(`sonnerStyles: "${INSERT_CSS}" not found in ${id}; check the Sonner upgrade.`)
  }
  return code.replace(INSERT_CSS, `${INSERT_CSS} return;`)
}

/** The plugin for vite.config.ts. */
export function sonnerStyles(): Plugin {
  return {
    name: 'deep-cuts:sonner-styles',
    apply: 'build',
    transform: (code, id) => stripSonnerInlineStyles(code, id),
  }
}
