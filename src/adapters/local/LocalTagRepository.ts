// Tags saved in this browser, for the demo and practice accounts.
//
// Each account gets its own key (`account-<id>-tags`), so signing out and in again never mixes
// lists. Passkey accounts keep their lists on the server instead. The
// watchlist's saved order sits beside the tags, under `account-<id>-watchlist-order`.
import { createTagRepository, oneTagPerFilm } from '../createTagRepository'
import { savedOrderSchema, storedRecordsSchema, type TagRepository } from '../TagRepository'
import { versionedStore } from './versionedStore'

/**
 * A TagRepository backed by localStorage.
 * @param storage - Defaults to the browser's localStorage; tests pass their own.
 * @param now - The clock for timestamps; tests pass a fake one.
 * @param key - Which account's list of tags to use, e.g. `'account-demo-tags'`.
 */
export function createLocalTagRepository(
  storage: Storage | undefined,
  now: (() => string) | undefined,
  key: string,
): TagRepository {
  const store = versionedStore({
    key,
    // Lists saved by older versions lose their "Seen it" records and keep one tag per film; the
    // rest loads as before. The cleaned list is saved back on the next change.
    schema: storedRecordsSchema.transform(oneTagPerFilm),
    fallback: [],
    // Only pass `storage` when given, so versionedStore's own default (localStorage) applies.
    ...(storage && { storage }),
  })
  const order = versionedStore<readonly number[]>({
    key: key.endsWith('-tags') ? key.replace(/-tags$/, '-watchlist-order') : `${key}-order`,
    // An invalid saved order is dropped: the watchlist is then simply newest first.
    schema: savedOrderSchema,
    fallback: [],
    ...(storage && { storage }),
  })
  return createTagRepository(store, now, order)
}
