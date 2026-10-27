// The tag store for passkey accounts (ADR-0031, Stage 6 A4): the account's lists on the server,
// through `/api/tags`. It implements the same TagRepository contract as the local stores, so no
// screen changes; tagRepository.contract.ts proves the behaviors match.
//
// The server applies the tag rules itself (the same `applyTag`), so this adapter only sends what
// the person did. To keep within the API rate limit (120 requests a minute), the account's records
// are fetched once and reused for 30 seconds, and refreshed after every change. The same answer
// carries the watchlist's saved order (ADR-0041), which `list('watchlist')` applies.
import { z } from 'zod'
import { applySavedOrder, ListChangedError } from '../../domain/ranking'
import { listOf } from '../createTagRepository'
import { isInFeeds, SYSTEM_TAGS, type SystemTag, type TagSet } from '../../domain/tagRules'
import {
  savedOrderSchema,
  storedRecordsSchema,
  type TagRecord,
  type TagRepository,
} from '../TagRepository'
import { reportStatus } from './sessionEnded'

/** A failed tags API call. */
export class TagApiError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`Tags API failed (${status})`)
    this.status = status
  }
}

const recordsSchema = z.object({
  // Skips any "Seen it" row the server still holds (ADR-0050), rather than failing the lists.
  records: storedRecordsSchema,
  // Optional, so a server from before ADR-0041 still reads as "no saved order".
  watchlistOrder: savedOrderSchema.default([]),
})
const orderSchema = z.object({ ids: savedOrderSchema })
const tagsSchema = z.object({ tags: z.array(z.enum(SYSTEM_TAGS)) })
/** How long fetched records are reused before asking again. */
const FRESH_MS = 30_000
/** The server accepts at most this many records per import. */
const IMPORT_BATCH = 5000

/** Calls the tags API and validates the answer; any error status or odd body throws. */
async function call<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  })
  if (!res.ok) {
    // A 401 means the session ended on the server (issue #18): the app signs out.
    reportStatus(res.status)
    // A reorder for a watchlist that changed elsewhere is expected, not a failure (ADR-0041).
    const body: unknown = await res.json().catch(() => undefined)
    if (
      res.status === 409 &&
      z.object({ error: z.literal('list_changed') }).safeParse(body).success
    )
      throw new ListChangedError('Your watchlist changed somewhere else.')
    throw new TagApiError(res.status)
  }
  const parsed = schema.safeParse(await res.json().catch(() => undefined))
  if (!parsed.success) throw new TagApiError(502)
  return parsed.data
}

/**
 * Builds the account's tag store.
 * @param clock - For the 30-second reuse window; tests pass their own.
 */
export function createCloudflareTagRepository(clock: () => number = Date.now): TagRepository {
  type Loaded = z.infer<typeof recordsSchema>
  let cached: { at: number; data: Promise<Loaded> } | null = null

  // The account's records, oldest first (as the server sends them), and the saved watchlist
  // order. Reused while fresh.
  function fetchAll(): Promise<Loaded> {
    if (!cached || clock() - cached.at > FRESH_MS) {
      const data = call('GET', '/api/tags', recordsSchema)
      cached = { at: clock(), data }
      // A failed fetch isn't kept, so the next call tries again.
      data.catch(() => (cached = null))
    }
    return cached.data
  }
  const load = async (): Promise<TagRecord[]> => (await fetchAll()).records
  const invalidate = () => void (cached = null)

  // Groups records by film: film id → its set of tags.
  const byFilm = (records: readonly TagRecord[]) => {
    const films = new Map<number, Set<SystemTag>>()
    for (const r of records) films.set(r.tmdbId, (films.get(r.tmdbId) ?? new Set()).add(r.tag))
    return films
  }

  return {
    async getTags(tmdbId) {
      return new Set((await load()).filter((r) => r.tmdbId === tmdbId).map((r) => r.tag))
    },
    async setTag(tmdbId, tag, on): Promise<TagSet> {
      invalidate()
      const { tags } = await call(on ? 'PUT' : 'DELETE', '/api/tags', tagsSchema, { tmdbId, tag })
      return new Set(tags)
    },
    async list(tag) {
      const { records, watchlistOrder } = await fetchAll()
      const newestFirst = listOf(records, tag)
      // The watchlist follows the saved order, with films added since then on top (ADR-0041).
      return tag === 'watchlist' ? [...applySavedOrder(newestFirst, watchlistOrder)] : newestFirst
    },
    async reorder(tag, order) {
      invalidate()
      return (await call('PATCH', '/api/tags/order', orderSchema, { tag, ids: order })).ids
    },
    async feedExclusions() {
      const excluded = new Set<number>()
      for (const [id, tags] of byFilm(await load())) if (!isInFeeds(tags)) excluded.add(id)
      return excluded
    },
    async exportAll() {
      return load()
    },
    async importAll(records) {
      invalidate()
      for (let i = 0; i < records.length; i += IMPORT_BATCH)
        await call('POST', '/api/tags/import', z.unknown(), {
          records: records.slice(i, i + IMPORT_BATCH),
        })
    },
    async clear() {
      invalidate()
      await call('DELETE', '/api/tags', tagsSchema, { all: true })
    },
  }
}
