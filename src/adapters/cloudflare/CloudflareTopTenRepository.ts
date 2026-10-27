// The Top Ten store for passkey accounts (ADR-0036): the account's list on the server, through
// `/api/top-ten`. It implements the same TopTenRepository contract as the browser store, so no
// screen changes; topTenRepository.contract.ts proves the behaviors match.
//
// The server applies the Top Ten rules itself (the same `addToTopTen` and `reorderTopTen`), so
// this adapter only sends what the person did and returns the list the server answers with.
// Unlike the tag store there is no local cache: TanStack Query already keeps the list, and it's
// one small request.
import { z } from 'zod'
import { TopTenChangedError, TopTenFullError, type TopTenList } from '../../domain/topTen'
import { topTenSchema, type TopTenRepository } from '../TopTenRepository'
import { reportStatus } from './sessionEnded'

/**
 * A failed Top Ten API call, other than the two expected refusals: "the list is full"
 * (`TopTenFullError`) and "the list changed elsewhere" (`TopTenChangedError`).
 */
export class TopTenApiError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`Top Ten API failed (${status})`)
    this.status = status
  }
}

/** Every answer is the whole list, in ranked order. */
const answerSchema = z.object({ films: topTenSchema })
const errorSchema = z.object({ error: z.string() })

/**
 * Calls the Top Ten API and returns the validated list; any error status or odd body throws.
 * @param payload - The JSON body: `{ tmdbId }` to add or remove, `{ ids }` to reorder.
 */
async function call(
  method: 'GET' | 'PUT' | 'DELETE' | 'PATCH',
  payload?: { tmdbId: number } | { ids: TopTenList },
) {
  const res = await fetch('/api/top-ten', {
    method,
    credentials: 'same-origin',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
    body: payload === undefined ? null : JSON.stringify(payload),
  })
  const body: unknown = await res.json().catch(() => undefined)
  if (!res.ok) {
    // A 401 means the session ended on the server (issue #18): the app signs out.
    reportStatus(res.status)
    // Two 409s are expected outcomes, not failures: `top_ten_full` (the screen shows "full") and
    // `top_ten_changed` (a reorder for a list that changed elsewhere, ADR-0041).
    const code = res.status === 409 ? errorSchema.safeParse(body).data?.error : undefined
    if (code === 'top_ten_full') throw new TopTenFullError()
    if (code === 'top_ten_changed') throw new TopTenChangedError()
    throw new TopTenApiError(res.status)
  }
  const parsed = answerSchema.safeParse(body)
  // A 200 that isn't a valid list (e.g. Pages serving HTML) counts as a bad gateway.
  if (!parsed.success) throw new TopTenApiError(502)
  return parsed.data
}

/** Builds the signed-in passkey account's Top Ten store. */
export function createCloudflareTopTenRepository(): TopTenRepository {
  return {
    list: async () => (await call('GET')).films,
    add: async (tmdbId) => (await call('PUT', { tmdbId })).films,
    remove: async (tmdbId) => (await call('DELETE', { tmdbId })).films,
    reorder: async (ids) => (await call('PATCH', { ids })).films,
  }
}
