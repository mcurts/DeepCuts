// Tests for the stale-chunk recovery (GitHub issue #17): a failed chunk load reloads the page once,
// and a second failure right after leaves the error to the route's error page.
import { expect, it, vi } from 'vitest'
import { reloadOnStaleChunk } from './reloadOnStaleChunk'

// Each test file gets a fresh jsdom, so the reload guard's storage starts empty.
it('reloads once on a failed chunk load, not again straight after', () => {
  const target = new EventTarget() as Window
  const reload = vi.fn()
  reloadOnStaleChunk(target, reload)

  target.dispatchEvent(new Event('vite:preloadError'))
  expect(reload).toHaveBeenCalledTimes(1)

  // Still failing after the reload: no second reload.
  target.dispatchEvent(new Event('vite:preloadError'))
  expect(reload).toHaveBeenCalledTimes(1)
})
