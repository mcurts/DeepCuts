// Tests for D1 migrations that change existing data, run on Node's SQLite like fakeD1.ts. Each
// test applies the migrations before the one under test, saves rows in the old shape, then runs
// it and checks what's left.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

const MIGRATIONS = join(import.meta.dirname, '..', '..', 'migrations')
const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()

/** A database with every migration before `name` applied, and a function that runs `name`. */
function before(name: string) {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const file of files.slice(0, files.indexOf(name)))
    db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))
  return { db, run: () => db.exec(readFileSync(join(MIGRATIONS, name), 'utf8')) }
}

describe('0004: one tag per film', () => {
  it('deletes Seen, keeps each film’s newest tag, and drops stale watchlist places', () => {
    const { db, run } = before('0004_one_tag_per_film.sql')
    db.exec(`INSERT INTO users (id, name, created_at) VALUES ('a', 'A', 0), ('b', 'B', 0)`)
    const at = (d: number) => `'2026-10-0${d}T12:00:00.000Z'`
    db.exec(`INSERT INTO tags (user_id, tmdb_id, tag, created_at) VALUES
      ('a', 1, 'seen', ${at(1)}), ('a', 1, 'liked', ${at(2)}),
      ('a', 2, 'watchlist', ${at(3)}), ('a', 2, 'liked', ${at(4)}),
      ('a', 3, 'liked', ${at(5)}), ('a', 3, 'watchlist', ${at(6)}),
      ('a', 4, 'watchlist', ${at(7)}), ('a', 4, 'liked', ${at(7)}),
      ('a', 5, 'seen', ${at(8)}),
      ('b', 2, 'watchlist', ${at(1)})`)
    db.exec(`INSERT INTO watchlist_order (user_id, tmdb_id, position) VALUES
      ('a', 2, 1), ('a', 3, 2), ('a', 4, 3), ('b', 2, 1)`)

    run()

    const tags = db
      .prepare('SELECT user_id, tmdb_id, tag FROM tags ORDER BY user_id, tmdb_id')
      .all()
      .map((r) => `${String(r.user_id)}:${String(r.tmdb_id)}:${String(r.tag)}`)
    expect(tags).toEqual([
      'a:1:liked', // Seen deleted, Like kept
      'a:2:liked', // Like was newer than Want to see
      'a:3:watchlist', // Want to see was newer than Like
      'a:4:liked', // equal times: the row inserted later
      'b:2:watchlist', // another user's tags are untouched
    ])
    const order = db
      .prepare('SELECT user_id, tmdb_id FROM watchlist_order ORDER BY user_id, position')
      .all()
      .map((r) => `${String(r.user_id)}:${String(r.tmdb_id)}`)
    expect(order).toEqual(['a:3', 'b:2'])
  })
})
