// The shared implementation of TagRepository, over a simple synchronous record store.
//
// Both local adapters (in-memory for guests, localStorage for profiles and accounts) use this
// same logic; they only decide where the list of records lives. That keeps the tag behavior
// identical everywhere, and the shared contract tests (tagRepository.contract.ts) prove it.
import { applySavedOrder, ListChangedError, reorderList } from '../domain/ranking'
import { applyTag, isInFeeds, isOnList, type SystemTag, type TagSet } from '../domain/tagRules'
import type { TagRecord, TagRepository } from './TagRepository'

/** Where records live: load them all, or replace them all. Adapters provide this. */
export interface RecordStore {
  load(): TagRecord[]
  save(records: TagRecord[]): void
}

/**
 * The films on one list, newest first, from a store's records (oldest first). A disliked film is
 * only on the Disliked list; for equal times, the record stored later wins. Shared by
 * every tag store and the server, so lists come out the same everywhere.
 */
export function listOf(records: readonly TagRecord[], tag: SystemTag): number[] {
  const films = new Map<number, Set<SystemTag>>()
  for (const r of records) films.set(r.tmdbId, (films.get(r.tmdbId) ?? new Set()).add(r.tag))
  return records
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.tag === tag && isOnList(films.get(r.tmdbId) ?? new Set(), tag))
    .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt) || b.i - a.i)
    .map(({ r }) => r.tmdbId)
}

/**
 * Records with at most one tag per film. Data saved by older versions could hold two
 * (Like and Want to see); the one added most recently is kept (for equal times, the record stored
 * later), as if each had been picked again in order under today's rule. Already-valid records
 * come back unchanged and in their order.
 */
export function oneTagPerFilm(records: readonly TagRecord[]): TagRecord[] {
  // Each film's newest record: its index in `records`.
  const newest = new Map<number, number>()
  records.forEach((r, i) => {
    const kept = newest.get(r.tmdbId)
    const current = kept === undefined ? undefined : records[kept]
    if (!current || r.createdAt >= current.createdAt) newest.set(r.tmdbId, i)
  })
  return records.filter((r, i) => newest.get(r.tmdbId) === i)
}

/** Where the watchlist's saved order lives: film ids, first first. */
export interface OrderStore {
  load(): readonly number[]
  save(ids: readonly number[]): void
}

/** An order store that only lives in memory (for test fakes). */
export function memoryOrderStore(): OrderStore {
  let ids: readonly number[] = []
  return { load: () => ids, save: (next) => void (ids = next) }
}

/**
 * Builds a TagRepository on top of a record store.
 * @param now - The clock for new records' timestamps; tests pass a fake one.
 * @param order - Where the watchlist's saved order lives; in memory unless given.
 */
export function createTagRepository(
  store: RecordStore,
  now: () => string = () => new Date().toISOString(),
  order: OrderStore = memoryOrderStore(),
): TagRepository {
  // The tags one film has, collected from its records.
  const tagsOf = (records: readonly TagRecord[], tmdbId: number): TagSet =>
    new Set(records.filter((r) => r.tmdbId === tmdbId).map((r) => r.tag))

  // Groups every record by film: film id → its set of tags.
  const byMovie = (records: readonly TagRecord[]) => {
    const movies = new Map<number, Set<SystemTag>>()
    for (const r of records) movies.set(r.tmdbId, (movies.get(r.tmdbId) ?? new Set()).add(r.tag))
    return movies
  }

  // Applies one tag change for one film and saves the result. Returns the film's new tags.
  function write(tmdbId: number, tag: SystemTag, on: boolean, createdAt: string): TagSet {
    const records = store.load()
    // The tag rules decide the film's full new set of tags (e.g. Dislike removes Like).
    const next = applyTag(tagsOf(records, tmdbId), tag, on)
    // Untouched tags keep their original timestamp, so list order reflects when each was added.
    const kept = records.filter((r) => r.tmdbId !== tmdbId || next.has(r.tag))
    // Only tags the film didn't already have get a new record.
    const added = [...next]
      .filter((t) => !kept.some((r) => r.tmdbId === tmdbId && r.tag === t))
      .map((t) => ({ tmdbId, tag: t, createdAt }))
    store.save([...kept, ...added])
    return next
  }

  // A list's films, newest first.
  const newestFirst = (tag: SystemTag) => listOf(store.load(), tag)

  // The watchlist in the saved order.
  const watchlist = () => applySavedOrder(newestFirst('watchlist'), order.load())

  // Drops films that have left the watchlist from its saved order, so a film added again later
  // comes back at the top (as new films do) rather than at its old place.
  function pruneOrder() {
    const saved = order.load()
    if (saved.length === 0) return
    const onList = new Set(newestFirst('watchlist'))
    const kept = saved.filter((id) => onList.has(id))
    if (kept.length !== saved.length) order.save(kept)
  }

  return {
    async getTags(tmdbId) {
      return tagsOf(store.load(), tmdbId)
    },
    async setTag(tmdbId, tag, on) {
      const next = write(tmdbId, tag, on, now())
      pruneOrder()
      return next
    },
    async list(tag) {
      return tag === 'watchlist' ? [...watchlist()] : newestFirst(tag)
    },
    async reorder(_tag, ids) {
      // `reorderList` throws unless `ids` is exactly the films on the watchlist.
      const before = watchlist()
      const after = reorderList(
        before,
        ids,
        () => new ListChangedError('Your watchlist changed somewhere else.'),
      )
      if (after !== before) order.save(after)
      return [...after]
    },
    async feedExclusions() {
      // Every film whose tags keep it out of feeds (today: disliked films).
      const excluded = new Set<number>()
      for (const [id, tags] of byMovie(store.load())) if (!isInFeeds(tags)) excluded.add(id)
      return excluded
    },
    async exportAll() {
      return store.load()
    },
    async importAll(records) {
      // Oldest first, through the same rules as a person tagging by hand, so the result is
      // what they would have got by tagging in this store all along.
      const ordered = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      for (const r of ordered) write(r.tmdbId, r.tag, true, r.createdAt)
      pruneOrder()
    },
    async clear() {
      store.save([])
      order.save([])
    },
  }
}
