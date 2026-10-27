// Recovers a tab that was opened before a deploy (GitHub issue #17). Every page is a lazy chunk
// with a hashed name (router.tsx); a deploy replaces them, so an old tab asks for files that no
// longer exist and the page would show "Something went wrong". Vite announces a failed chunk load
// with a `vite:preloadError` event on window; reloading fetches the new index.html and its chunks.
// main.tsx installs this once.
import { claimReload } from './adapters/local/reloadGuard'

/**
 * Reloads the page once when a lazy chunk fails to load. If the tab already reloaded moments ago
 * (adapters/local/reloadGuard.ts), the error is left alone and the route's error page shows, so a
 * chunk that is really broken can't cause a reload loop. Tests pass their own window and reload.
 */
export function reloadOnStaleChunk(
  target: Window = window,
  reload: () => void = () => target.location.reload(),
) {
  // The event is not cancelled: cancelling only makes Vite's helper return nothing, which the
  // route loader would trip over anyway. The error page may show for a moment until the reload.
  target.addEventListener('vite:preloadError', () => {
    if (claimReload()) reload()
  })
}
