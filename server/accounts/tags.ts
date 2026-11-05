// The tags API for signed-in accounts (Stage 6 A3).
//
// - Every query is scoped to the session's user (`WHERE user_id = ?`); a user id is never taken
//   from the client, so nobody can read or change someone else's lists.
// - The tag rules (src/domain/tagRules.ts) run here too, through the same `applyTag` the app uses,
//   so a modified client can't store a state the rules forbid (e.g. two tags on one film).
// - Rows of a retired tag ("Seen it") are never read: migration 0004 deletes them, and
//   until it has run every query skips them, so deploy and migration can happen in either order.
// - Changes are written as a diff (rows to delete, rows to add). The rows travel as one JSON
//   parameter that SQLite expands with `json_each`, because D1 allows only 100 bound parameters
//   per query and 50 queries per request: a 5,000-record import is still two statements.
// - The watchlist's saved order lives in `watchlist_order`. Every tag change also drops
//   the rows of films no longer on the watchlist, so a film added again starts at the top.
import { z } from 'zod'
import { listOf } from '../../src/adapters/createTagRepository.ts'
import {
  savedOrderSchema,
  tagRecordSchema,
  type TagRecord,
} from '../../src/adapters/TagRepository.ts'
import { applySavedOrder, ListChangedError, reorderList } from '../../src/domain/ranking.ts'
import { applyTag, SYSTEM_TAGS, type SystemTag } from '../../src/domain/tagRules.ts'
import { fail, json, readJson } from '../http.ts'
import type { AccountsEnv, D1Like, D1Stmt } from './d1.ts'
import { currentUser } from './sessions.ts'

/** The most records one import may carry (the whole of a device's lists). */
export const IMPORT_LIMIT = 5000
/** The most tag rows one account may hold, so storage can't be filled by a script. */
export const ACCOUNT_TAG_LIMIT = 20_000

const NO_STORE = { 'Cache-Control': 'no-store' }

type Row = { tmdbId: number; tag: SystemTag; createdAt: string }

// SQL that keeps only rows of today's tags. Built from the constant SYSTEM_TAGS, never
// from input, so it's safe to put into the query text.
const CURRENT_TAG = `tag IN (${SYSTEM_TAGS.map((t) => `'${t}'`).join(', ')})`

/** All of a user's tag rows, oldest first (insertion order breaks ties). */
async function loadAll(db: D1Like, userId: string): Promise<Row[]> {
  const { results } = await db
    .prepare(
      `SELECT tmdb_id AS tmdbId, tag, created_at AS createdAt FROM tags
       WHERE user_id = ? AND ${CURRENT_TAG} ORDER BY created_at, rowid`,
    )
    .bind(userId)
    .all<Row>()
  return results
}

/** A user's saved watchlist order, first first (may name films that have since left). */
async function loadOrder(db: D1Like, userId: string): Promise<number[]> {
  const { results } = await db
    .prepare('SELECT tmdb_id AS tmdbId FROM watchlist_order WHERE user_id = ? ORDER BY position')
    .bind(userId)
    .all<{ tmdbId: number }>()
  return results.map((r) => r.tmdbId)
}

/**
 * One statement that drops saved places for films no longer on the watchlist: no `watchlist`
 * tag, or disliked (a disliked film is only on the Disliked list). Runs last in every
 * tag-changing batch, so it sees the batch's own changes.
 */
const pruneOrder = (db: D1Like, userId: string) =>
  db
    .prepare(
      `DELETE FROM watchlist_order WHERE user_id = ?1 AND tmdb_id NOT IN (
         SELECT tmdb_id FROM tags WHERE user_id = ?1 AND tag = 'watchlist'
           AND tmdb_id NOT IN (SELECT tmdb_id FROM tags WHERE user_id = ?1 AND tag = 'disliked'))`,
    )
    .bind(userId)

/** One statement that deletes the given (film, tag) pairs for this user. */
const deleteRows = (db: D1Like, userId: string, rows: { tmdbId: number; tag: string }[]) =>
  db
    .prepare(
      `DELETE FROM tags WHERE user_id = ? AND EXISTS (
         SELECT 1 FROM json_each(?) j
         WHERE json_extract(j.value, '$.tmdbId') = tags.tmdb_id
           AND json_extract(j.value, '$.tag') = tags.tag)`,
    )
    .bind(userId, JSON.stringify(rows))

/** One statement that adds the given rows for this user (existing ones are left alone). */
const insertRows = (db: D1Like, userId: string, rows: Row[]) =>
  db
    .prepare(
      `INSERT OR IGNORE INTO tags (user_id, tmdb_id, tag, created_at)
       SELECT ?, json_extract(value, '$.tmdbId'), json_extract(value, '$.tag'),
              json_extract(value, '$.createdAt')
       FROM json_each(?)`,
    )
    .bind(userId, JSON.stringify(rows))

/**
 * The statements that turn `before` into `after` (both: film → set of tags). New rows get
 * `createdAt` from `stamp`; tags a film keeps are untouched, so lists stay in the order the tags
 * were first added.
 */
function diff(
  db: D1Like,
  userId: string,
  before: Map<number, Set<SystemTag>>,
  after: Map<number, Set<SystemTag>>,
  stamp: (tmdbId: number, tag: SystemTag) => string,
): D1Stmt[] {
  const removed: { tmdbId: number; tag: SystemTag }[] = []
  const added: Row[] = []
  for (const [tmdbId, tags] of before)
    for (const tag of tags) if (!after.get(tmdbId)?.has(tag)) removed.push({ tmdbId, tag })
  for (const [tmdbId, tags] of after)
    for (const tag of tags)
      if (!before.get(tmdbId)?.has(tag)) added.push({ tmdbId, tag, createdAt: stamp(tmdbId, tag) })
  return [
    ...(removed.length ? [deleteRows(db, userId, removed)] : []),
    ...(added.length ? [insertRows(db, userId, added)] : []),
  ]
}

/** Groups rows by film: film id → its set of tags. */
function byFilm(rows: readonly Row[]) {
  const films = new Map<number, Set<SystemTag>>()
  for (const r of rows) films.set(r.tmdbId, (films.get(r.tmdbId) ?? new Set()).add(r.tag))
  return films
}

/**
 * `GET /api/tags`: every one of the user's tag records, oldest first, and the saved watchlist
 * order as `watchlistOrder`, already limited to films still on the watchlist.
 */
export async function listTags(request: Request, env: AccountsEnv, now = Date.now()) {
  const user = await currentUser(env.DB, request, now)
  if (!user) return fail(401, 'signed_out')
  const records = await loadAll(env.DB, user.id)
  const onList = new Set(listOf(records, 'watchlist'))
  const watchlistOrder = (await loadOrder(env.DB, user.id)).filter((id) => onList.has(id))
  return json(200, { records, watchlistOrder }, NO_STORE)
}

const oneTag = z.object({ tmdbId: tagRecordSchema.shape.tmdbId, tag: z.enum(SYSTEM_TAGS) })

/**
 * `PUT /api/tags` `{ tmdbId, tag }` turns a tag on; `DELETE /api/tags` `{ tmdbId, tag }` turns it
 * off, and `DELETE /api/tags` `{ all: true }` removes every tag. Returns the film's new tags.
 */
export async function changeTag(request: Request, env: AccountsEnv, now = Date.now()) {
  const user = await currentUser(env.DB, request, now)
  if (!user) return fail(401, 'signed_out')
  const on = request.method === 'PUT'
  const schema = on ? oneTag : z.union([oneTag, z.object({ all: z.literal(true) })])
  const body = await readJson(request, schema)
  if ('error' in body) return body.error

  if ('all' in body.data) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM tags WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM watchlist_order WHERE user_id = ?').bind(user.id),
    ])
    return json(200, { tags: [] }, NO_STORE)
  }
  const { tmdbId, tag } = body.data
  if (on) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM tags WHERE user_id = ?')
      .bind(user.id)
      .first<{ n: number }>()
    if ((count?.n ?? 0) >= ACCOUNT_TAG_LIMIT) return fail(409, 'too_many_tags')
  }
  const { results } = await env.DB.prepare(
    `SELECT tag FROM tags WHERE user_id = ? AND tmdb_id = ? AND ${CURRENT_TAG}`,
  )
    .bind(user.id, tmdbId)
    .all<{ tag: SystemTag }>()
  const current = new Set(results.map((r) => r.tag))
  const next = applyTag(current, tag, on)
  const createdAt = new Date(now).toISOString()
  const statements = diff(
    env.DB,
    user.id,
    new Map([[tmdbId, current]]),
    new Map([[tmdbId, new Set(next)]]),
    () => createdAt,
  )
  if (statements.length) await env.DB.batch([...statements, pruneOrder(env.DB, user.id)])
  return json(200, { tags: [...next] }, NO_STORE)
}

const importSchema = z.object({ records: z.array(tagRecordSchema).max(IMPORT_LIMIT) })

/**
 * `POST /api/tags/import` `{ records }`: moves a device's picks into the account when someone signs
 * in. Records are replayed oldest first through the tag rules, as if tagged by hand here, and keep
 * their original timestamps. Up to 5,000 records.
 */
export async function importTags(request: Request, env: AccountsEnv, now = Date.now()) {
  const user = await currentUser(env.DB, request, now)
  if (!user) return fail(401, 'signed_out')
  // ~70 bytes per record, so 5,000 records fit well inside 512 kB.
  const body = await readJson(request, importSchema, 512 * 1024)
  if ('error' in body) return body.error

  const existing = await loadAll(env.DB, user.id)
  const before = byFilm(existing)
  const after = new Map([...before].map(([id, tags]) => [id, new Set(tags)]))
  // When each (film, tag) was first tagged, from the imported records.
  const stamps = new Map<string, string>()
  const ordered = [...body.data.records].sort((a: TagRecord, b: TagRecord) =>
    a.createdAt.localeCompare(b.createdAt),
  )
  for (const r of ordered) {
    after.set(r.tmdbId, new Set(applyTag(after.get(r.tmdbId) ?? new Set(), r.tag, true)))
    stamps.set(`${r.tmdbId}:${r.tag}`, r.createdAt)
  }
  const total = [...after.values()].reduce((n, tags) => n + tags.size, 0)
  if (total > ACCOUNT_TAG_LIMIT) return fail(409, 'too_many_tags')

  const statements = diff(
    env.DB,
    user.id,
    before,
    after,
    (id, tag) => stamps.get(`${id}:${tag}`) ?? new Date(now).toISOString(),
  )
  if (statements.length) await env.DB.batch([...statements, pruneOrder(env.DB, user.id)])
  return json(200, { ok: true }, NO_STORE)
}

// A new watchlist order: the whole list, film ids first first, at most one each.
const newOrder = z.object({ tag: z.literal('watchlist'), ids: savedOrderSchema })

/**
 * `PATCH /api/tags/order` `{ tag: 'watchlist', ids }` saves a new order for the user's watchlist
 * and returns it as `{ ids }`. `ids` must be exactly the films on the watchlist: any
 * other set answers 409 `list_changed` (it changed elsewhere, so the client re-reads it), and a
 * malformed body answers 400. The order is rewritten in one batch, positions 1…n.
 */
export async function reorderWatchlist(request: Request, env: AccountsEnv, now = Date.now()) {
  const user = await currentUser(env.DB, request, now)
  if (!user) return fail(401, 'signed_out')
  // ~7 bytes an id, so even a 20,000-film order fits.
  const body = await readJson(request, newOrder, 256 * 1024)
  if ('error' in body) return body.error

  const db = env.DB
  const before = applySavedOrder(
    listOf(await loadAll(db, user.id), 'watchlist'),
    await loadOrder(db, user.id),
  )
  let after: readonly number[]
  try {
    after = reorderList(before, body.data.ids)
  } catch (e) {
    if (e instanceof ListChangedError) return fail(409, 'list_changed')
    throw e
  }
  if (after !== before)
    await db.batch([
      db.prepare('DELETE FROM watchlist_order WHERE user_id = ?').bind(user.id),
      // json_each numbers array items from 0 (`key`), so the position is key + 1.
      db
        .prepare(
          `INSERT INTO watchlist_order (user_id, tmdb_id, position)
           SELECT ?, value, key + 1 FROM json_each(?)`,
        )
        .bind(user.id, JSON.stringify(after)),
    ])
  return json(200, { ids: after }, NO_STORE)
}
