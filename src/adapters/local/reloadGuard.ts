// Remembers, per browser tab, when the app last reloaded itself to pick up a new deploy (GitHub
// issue #17). src/reloadOnStaleChunk.ts asks before every reload, so a chunk that is still missing
// after a reload shows the error page instead of reloading forever.
//
// sessionStorage, not localStorage: the guard belongs to one tab, and should not stop another tab
// from recovering. It lives here because every browser storage access does (ADR-0013).
import { STORAGE_PREFIX } from './versionedStore'

const KEY = `${STORAGE_PREFIX}chunk-reload-at`

/**
 * How long after one reload another is refused. A reload that worked has loaded the page well
 * within this; a later deploy, minutes or hours on, gets its own reload.
 */
export const RELOAD_WINDOW_MS = 10_000

/**
 * True when the tab may reload now, and records that it did; false if it already reloaded within
 * the last {@link RELOAD_WINDOW_MS}. Also false when storage can't be used (a privacy mode can
 * block it), since a reload that can't be recorded could loop.
 */
export function claimReload(now = Date.now(), storage: Storage = sessionStorage): boolean {
  try {
    const last = Number(storage.getItem(KEY))
    // A stored time in the future (a changed clock, an edited value) doesn't block for ever.
    if (last && now - last >= 0 && now - last < RELOAD_WINDOW_MS) return false
    storage.setItem(KEY, String(now))
    return true
  } catch {
    return false
  }
}
