// The Top Ten API for signed-in accounts.
//
// - Every query is scoped to the session's user (`WHERE user_id = ?`); a user id is never taken
//   from the client, so nobody can read or change someone else's Top Ten.
// - The Top Ten rules (src/domain/topTen.ts) run here too, through the same `addToTopTen`,
//   `removeFromTopTen` and `reorderTopTen` the app uses, so a modified client can't store an
//   eleventh film, or slip a film in or out while reordering.
// - A change rewrites the user's whole list (at most ten rows) in one D1 batch: delete, then insert
//   with fresh positions. Batches are transactions, so a list is never half-written, and positions
//   stay 1…n without gaps. The list travels as one JSON parameter that SQLite expands with
//   `json_each`, like the tags API.
// - Two changes at the same moment (two tabs) can race: the later write wins. The database
//   constraints still hold (ten films at most, each once), so the worst case is one lost add.
import { z } from 'zod'
import { topTenSchema } from '../../src/adapters/TopTenRepository.ts'
import {
  addToTopTen,
  removeFromTopTen,
  reorderTopTen,
  TopTenChangedError,
  TopTenFullError,
  type TopTenList,
} from '../../src/domain/topTen.ts'
import { fail, json, readJson } from '../http.ts'
import type { AccountsEnv, D1Like } from './d1.ts'
import { currentUser } from './sessions.ts'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** A user's Top Ten in ranked order. */
async function load(db: D1Like, userId: string): Promise<TopTenList> {
  const { results } = await db
    .prepare('SELECT tmdb_id AS tmdbId FROM top_ten WHERE user_id = ? ORDER BY position')
    .bind(userId)
    .all<{ tmdbId: number }>()
  return results.map((r) => r.tmdbId)
}

/** Replaces a user's whole Top Ten with `list`, position 1 first, as one transaction. */
async function save(db: D1Like, userId: string, list: TopTenList) {
  await db.batch([
    db.prepare('DELETE FROM top_ten WHERE user_id = ?').bind(userId),
    // json_each numbers array items from 0 (`key`), so the rank is key + 1.
    db
      .prepare(
        `INSERT INTO top_ten (user_id, tmdb_id, position)
         SELECT ?, value, key + 1 FROM json_each(?)`,
      )
      .bind(userId, JSON.stringify(list)),
  ])
}

/** `GET /api/top-ten`: the user's Top Ten `{ films }`, in ranked order. */
export async function listTopTen(request: Request, env: AccountsEnv, now = Date.now()) {
  const user = await currentUser(env.DB, request, now)
  if (!user) return fail(401, 'signed_out')
  return json(200, { films: await load(env.DB, user.id) }, NO_STORE)
}

// One film id, with the same rule as the stored list (a positive whole number).
const oneFilm = z.object({ tmdbId: topTenSchema.element })

/**
 * `PUT /api/top-ten` `{ tmdbId }` adds a film at the end; `DELETE /api/top-ten` `{ tmdbId }` removes
 * it. Both return the new list `{ films }`. Adding to a full list answers 409 `top_ten_full`.
 */
export async function changeTopTen(request: Request, env: AccountsEnv, now = Date.now()) {
  const user = await currentUser(env.DB, request, now)
  if (!user) return fail(401, 'signed_out')
  const body = await readJson(request, oneFilm)
  if ('error' in body) return body.error

  const before = await load(env.DB, user.id)
  let after: TopTenList
  try {
    after =
      request.method === 'PUT'
        ? addToTopTen(before, body.data.tmdbId)
        : removeFromTopTen(before, body.data.tmdbId)
  } catch (e) {
    if (e instanceof TopTenFullError) return fail(409, 'top_ten_full')
    throw e
  }
  // Skip the write when nothing changed (adding a film that's there, removing one that isn't).
  if (after.length !== before.length) await save(env.DB, user.id, after)
  return json(200, { films: after }, NO_STORE)
}

// A new order: the whole list, with the same rules as the stored one (ids, at most ten, no repeats).
const newOrder = z.object({ ids: topTenSchema })

/**
 * `PATCH /api/top-ten` `{ ids }` saves a new order for the user's films and returns it
 * as `{ films }`. `ids` must hold exactly the stored films: an order that adds, drops or repeats
 * one answers 409 `top_ten_changed` (the list changed elsewhere, so the client re-reads it), and
 * a malformed body answers 400.
 */
export async function saveTopTenOrder(request: Request, env: AccountsEnv, now = Date.now()) {
  const user = await currentUser(env.DB, request, now)
  if (!user) return fail(401, 'signed_out')
  const body = await readJson(request, newOrder)
  if ('error' in body) return body.error

  const before = await load(env.DB, user.id)
  let after: TopTenList
  try {
    after = reorderTopTen(before, body.data.ids)
  } catch (e) {
    if (e instanceof TopTenChangedError) return fail(409, 'top_ten_changed')
    throw e
  }
  // Skip the write when the order didn't change (`reorderTopTen` returns the same list).
  if (after !== before) await save(env.DB, user.id, after)
  return json(200, { films: after }, NO_STORE)
}
