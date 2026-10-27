// Remembers which theme (brand look) this device chose (ADR-0056). Per device, not per account:
// it's a display preference, and signed-out visitors can pick one too.
//
// Two readers share this key: the app (useTheme, through these functions) and the tiny boot
// script that applies the choice before the first paint (public/theme-boot.js), which the token
// build writes with the same key (themeKey.ts).
import { z } from 'zod'
import { THEME_KEY } from './themeKey'
import { versionedStore } from './versionedStore'

/** The store for the theme id. A function, so a blocked localStorage throws inside the callers' try. */
const store = (storage: Storage) =>
  versionedStore({ key: THEME_KEY, schema: z.string().nullable(), fallback: null, storage })

/**
 * The saved theme id, or null when none is saved. Any string passes here; the caller checks it
 * against the themes that exist, since an old save may name a theme that was since removed.
 */
export function loadThemePreference(storage?: Storage): string | null {
  try {
    return store(storage ?? localStorage).load()
  } catch {
    // Storage blocked (a privacy mode): behave as if nothing was saved.
    return null
  }
}

/** Saves the chosen theme id. Fails silently when storage is blocked; the choice still applies. */
export function saveThemePreference(id: string, storage?: Storage) {
  try {
    store(storage ?? localStorage).save(id)
  } catch {
    // Blocked storage: the theme still changes for this visit.
  }
}

/** Forgets the saved theme, so the next visit opens in the default. */
export function clearThemePreference(storage?: Storage) {
  try {
    store(storage ?? localStorage).remove()
  } catch {
    // Blocked storage holds nothing to forget.
  }
}
