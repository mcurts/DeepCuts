// A stand-in for Cloudflare D1 in unit tests (Stage 6 A6), built on Node's own SQLite
// (`node:sqlite`). It runs the real migrations from migrations/, so tests exercise the actual
// schema, constraints and foreign keys, not a mock of them.
//
// Why not @cloudflare/vitest-pool-workers? It requires Vitest 4 and this repo is on Vitest 5;
// installing it would break `npm ls --all` in CI.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { D1Like, D1Stmt } from '../accounts/d1.ts'

const MIGRATIONS = join(import.meta.dirname, '..', '..', 'migrations')

// D1 accepts these JavaScript values as parameters; SQLite needs null instead of undefined.
const toSql = (v: unknown): SQLInputValue =>
  v === undefined ? null : v instanceof ArrayBuffer ? new Uint8Array(v) : (v as SQLInputValue)

/** A fake D1 database, plus direct SQL access for tests to inspect what was stored. */
export type FakeD1 = D1Like & {
  /** Every row of a table, for assertions. */
  rows(table: string): Record<string, unknown>[]
  /** Runs raw SQL (setup only). */
  exec(sql: string): void
}

/** A fresh in-memory database with every migration applied. */
export function createFakeD1(): FakeD1 {
  const db = new DatabaseSync(':memory:')
  // D1 enforces foreign keys; plain SQLite needs this switched on.
  db.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'))

  function statement(sql: string, params: unknown[] = []): D1Stmt {
    const run = () => db.prepare(sql).run(...params.map(toSql))
    return {
      bind: (...values) => statement(sql, values),
      first: async <T>() => (db.prepare(sql).get(...params.map(toSql)) ?? null) as T | null,
      all: async <T>() => ({ results: db.prepare(sql).all(...params.map(toSql)) as T[] }),
      run: async () => ({ meta: { changes: Number(run().changes) } }),
      // Used by batch(): runs synchronously inside its transaction.
      ...{ _runSync: run },
    } as D1Stmt
  }

  return {
    prepare: (sql) => statement(sql),
    // Like D1: all statements in one transaction; any failure rolls every one of them back.
    async batch(statements) {
      db.exec('BEGIN')
      try {
        const out = statements.map((s) => (s as unknown as { _runSync: () => unknown })._runSync())
        db.exec('COMMIT')
        return out
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
    rows: (table) => db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[],
    exec: (sql) => db.exec(sql),
  }
}
