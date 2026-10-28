// Build plugin: asks the browser to fetch the app's scripts after the stylesheet and fonts
// (ADR-0057). index.html carries the landing page as HTML, so the first paint needs only the CSS
// and the fonts; the scripts (about 260 kB) would otherwise share the connection with them at the
// same High priority and hold that paint back on a slow phone. `fetchpriority="low"` on the entry
// script and its `modulepreload` links leaves them downloading in parallel, just behind.
// The two tiny boot scripts (theme-boot.js, shell-boot.js) must run before the first paint, so
// they keep their normal priority. Build only: the dev server's HTML is different.
import type { Plugin } from 'vite'

const ENTRY = '<script type="module" crossorigin'

/**
 * Adds `fetchpriority="low"` to the built entry script and every `modulepreload` link.
 * @throws When there is no entry script tag in the expected form (Vite changed how it writes
 *   them): the build fails so this is checked, rather than quietly doing nothing.
 */
export function lowerScriptPriority(html: string): string {
  if (!html.includes(ENTRY)) throw new Error('lowPriorityScripts: no module entry script found')
  return html
    .replaceAll(ENTRY, '<script type="module" fetchpriority="low" crossorigin')
    .replaceAll(
      '<link rel="modulepreload" crossorigin',
      '<link rel="modulepreload" fetchpriority="low" crossorigin',
    )
}

/** The plugin for vite.config.ts. */
export function lowPriorityScripts(): Plugin {
  return {
    name: 'deep-cuts:low-priority-scripts',
    apply: 'build',
    // After Vite has added the bundle's script and modulepreload tags.
    transformIndexHtml: { order: 'post', handler: lowerScriptPriority },
  }
}
