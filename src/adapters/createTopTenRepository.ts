// The shared implementation of TopTenRepository over a simple synchronous store.
//
// The browser adapter (LocalTopTenRepository.ts) and the test fake of the accounts API both use
// this, so they behave identically; the shared contract tests (topTenRepository.contract.ts) prove
// that the server adapter matches them too.
import { addToTopTen, removeFromTopTen, reorderTopTen, type TopTenList } from '../domain/topTen'
import type { TopTenRepository } from './TopTenRepository'

/** Where the list lives: load it, or replace it. Adapters provide this. */
export interface TopTenStore {
  load(): TopTenList
  save(list: TopTenList): void
}

/** Builds a TopTenRepository on top of a store. The rules come from `domain/topTen.ts`. */
export function createTopTenRepository(store: TopTenStore): TopTenRepository {
  // Applies one change and saves it only when something actually changed.
  function write(change: (list: TopTenList) => TopTenList): TopTenList {
    const before = store.load()
    const after = change(before)
    if (after !== before) store.save(after)
    return after
  }

  return {
    async list() {
      return store.load()
    },
    // `addToTopTen` throws TopTenFullError for a full list, which rejects this promise.
    async add(tmdbId) {
      return write((list) => addToTopTen(list, tmdbId))
    },
    async remove(tmdbId) {
      return write((list) => removeFromTopTen(list, tmdbId))
    },
    // `reorderTopTen` throws TopTenChangedError unless `order` holds exactly the stored films.
    async reorder(order) {
      return write((list) => reorderTopTen(list, order))
    },
  }
}
