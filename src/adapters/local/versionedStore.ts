// Safe localStorage access: one value per key, versioned and validated.
//
// Everything this app keeps in the browser goes through here. Keys carry a version prefix
// (`deepcuts:v1:`) so a future data shape can live beside the old one and be migrated. Stored
// data is untrusted (another tab, an old version or the person could have edited it), so every
// read is checked with a Zod schema; anything corrupt or unknown is deleted and the fallback
// returned, instead of crashing the app.
import type { z } from 'zod'

/** Prefix for every key this app writes, e.g. `deepcuts:v1:tags`. */
export const STORAGE_PREFIX = 'deepcuts:v1:'

interface Options<T> {
  /** The key without the prefix, e.g. `'tags'`. */
  key: string
  /** The shape a stored value must have to be used. */
  schema: z.ZodType<T>
  /** What to return when nothing (valid) is stored. */
  fallback: T
  /** Upgrades older payloads to the current shape. Empty until a v2 exists. */
  migrate?: (raw: unknown) => unknown
  /** Defaults to the browser's localStorage; tests pass their own. */
  storage?: Storage
}

/** A tiny typed store for one key: `load()`, `save(value)` and `remove()`. */
export function versionedStore<T>({
  key,
  schema,
  fallback,
  migrate,
  storage = localStorage,
}: Options<T>) {
  const fullKey = STORAGE_PREFIX + key
  return {
    /** The stored value if it's valid; otherwise the fallback (and bad data is removed). */
    load(): T {
      const raw = storage.getItem(fullKey)
      if (raw === null) return fallback
      try {
        const parsed: unknown = JSON.parse(raw)
        const result = schema.safeParse(migrate ? migrate(parsed) : parsed)
        if (result.success) return result.data
      } catch {
        // Not valid JSON: fall through to the reset below.
      }
      // Invalid or unreadable: remove it so the same error doesn't repeat on every read.
      storage.removeItem(fullKey)
      return fallback
    },
    save(value: T) {
      storage.setItem(fullKey, JSON.stringify(value))
    },
    remove() {
      storage.removeItem(fullKey)
    },
  }
}
