// A Top Ten saved in this browser, for the demo and practice accounts.
//
// Same pattern as LocalTagRepository.ts: each account gets its own key (`account-<id>-top-ten`),
// so signing out and in as someone else never mixes lists. Passkey accounts keep their Top Ten on
// the server instead (CloudflareTopTenRepository.ts).
import { createTopTenRepository } from '../createTopTenRepository'
import { topTenSchema, type TopTenRepository } from '../TopTenRepository'
import { versionedStore } from './versionedStore'

/**
 * A TopTenRepository backed by localStorage.
 * @param key - Which account's list to use, e.g. `'account-demo-top-ten'`.
 * @param storage - Defaults to the browser's localStorage; tests pass their own.
 */
export function createLocalTopTenRepository(key: string, storage?: Storage): TopTenRepository {
  const store = versionedStore<readonly number[]>({
    key,
    // Anything invalid (too long, duplicates, not ids) is discarded and the list starts empty.
    schema: topTenSchema,
    fallback: [],
    // Only pass `storage` when given, so versionedStore's own default (localStorage) applies.
    ...(storage && { storage }),
  })
  return createTopTenRepository(store)
}
