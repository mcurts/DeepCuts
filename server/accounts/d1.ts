// The part of Cloudflare D1's API the accounts code uses, written as plain types so the
// code type-checks in Node too. Cloudflare's real `D1Database` fits it, and so does the test
// stand-in over Node's built-in SQLite (server/testing/fakeD1.ts), which runs the real migrations.

/** A prepared statement, with its parameters bound. */
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt
  /** The first row, or null. */
  first<T = Record<string, unknown>>(): Promise<T | null>
  /** Every row. */
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  /** Runs a statement that returns no rows. `meta.changes` is how many rows it changed. */
  run(): Promise<{ meta: { changes: number } }>
}

/** A D1 database: prepare statements one at a time, or run several as one transaction. */
export interface D1Like {
  prepare(sql: string): D1Stmt
  /**
   * Runs the statements in order as one transaction: if any of them fails (a constraint, a missing
   * foreign key), none of them take effect.
   */
  batch(statements: D1Stmt[]): Promise<unknown[]>
}

/** What every accounts Function gets from the Pages project's bindings. */
export type AccountsEnv = { DB: D1Like }
