// Sign-in sessions: a random id in a cookie the page's JavaScript can't read, and only
// its SHA-256 hash in the database.
//
// Cookie: `__Host-dc_session` with `HttpOnly; Secure; SameSite=Lax; Path=/`. The `__Host-` prefix
// makes the browser refuse it unless it's Secure, has Path=/ and no Domain, so no subdomain can
// set or overwrite it. Sessions last 30 days and are renewed when less than half remains.
//
// Local exception: on plain `http://localhost` the cookie is `dc_session` without `Secure`.
// Safari won't store a Secure cookie over http, even on localhost (Chrome and Firefox will), and
// `__Host-` requires Secure. The real site is always https, so it always gets the strict cookie.
import type { D1Like, D1Stmt } from './d1.ts'
import { randomToken, sha256Hex } from './crypto.ts'

/** The session cookie's name on the real (https) site. */
export const SESSION_COOKIE = '__Host-dc_session'
/** The session cookie's name on plain `http://localhost` (see the file header). */
export const LOCAL_SESSION_COOKIE = 'dc_session'
/** How long a session lasts: 30 days. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** A session is renewed once less than this much of it remains. */
const RENEW_BELOW_MS = SESSION_TTL_MS / 2

/** Whether the request is to plain http on this machine (`npm run preview:accounts`). */
function isLocalHttp(request: Request): boolean {
  const { protocol, hostname } = new URL(request.url)
  return protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

/** The cookie's name and attributes for this request: strict everywhere but local http. */
function cookieFor(request: Request) {
  return isLocalHttp(request)
    ? { name: LOCAL_SESSION_COOKIE, attrs: 'Path=/; HttpOnly; SameSite=Lax' }
    : { name: SESSION_COOKIE, attrs: 'Path=/; HttpOnly; Secure; SameSite=Lax' }
}

/** The `Set-Cookie` value that stores session id `id` for the full lifetime. */
export function sessionCookie(request: Request, id: string): string {
  const { name, attrs } = cookieFor(request)
  return `${name}=${id}; Max-Age=${SESSION_TTL_MS / 1000}; ${attrs}`
}

/** The `Set-Cookie` value that deletes the session cookie. */
export function clearedSessionCookie(request: Request): string {
  const { name, attrs } = cookieFor(request)
  return `${name}=; Max-Age=0; ${attrs}`
}

/** The session id from the request's cookies, or null. Malformed values are ignored. */
export function readSessionId(request: Request): string | null {
  // Only the name this request would set, so a local cookie never counts on the real site.
  const { name: expected } = cookieFor(request)
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    const value = rest.join('=')
    // 32 random bytes as base64url are always 43 characters.
    if (name === expected && /^[\w-]{43}$/.test(value)) return value
  }
  return null
}

/**
 * Prepares a new session for `userId`, to run in the caller's batch (so it starts in the same
 * transaction as whatever signed the person in). Returns the statement and the cookie to send.
 */
export async function newSession(
  db: D1Like,
  request: Request,
  userId: string,
  now: number,
): Promise<{ statement: D1Stmt; cookie: string }> {
  const id = randomToken(32)
  const statement = db
    .prepare('INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(id), userId, now + SESSION_TTL_MS, now)
  return { statement, cookie: sessionCookie(request, id) }
}

/**
 * Deletes every expired session, for the caller's batch. Expired sessions are already refused, and
 * a returning visitor's own row is deleted on sight (`currentUser`), but a browser that never comes
 * back would leave its row forever. Sign-in and sign-up run this, so the table can't grow without
 * bound and dead session hashes don't linger.
 */
export function purgeExpiredSessions(db: D1Like, now: number): D1Stmt {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now)
}

/** The signed-in user, plus a renewed cookie to send when the session was extended. */
export type CurrentUser = { id: string; name: string; renewedCookie: string | null }

/**
 * Who the request is signed in as, or null. An expired session is deleted. A session past half its
 * life gets a fresh expiry; the caller sends `renewedCookie` so the browser keeps it as long.
 */
export async function currentUser(
  db: D1Like,
  request: Request,
  now: number,
): Promise<CurrentUser | null> {
  const id = readSessionId(request)
  if (!id) return null
  const hash = await sha256Hex(id)
  const row = await db
    .prepare(
      `SELECT s.expires_at AS expiresAt, u.id AS id, u.name AS name
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`,
    )
    .bind(hash)
    .first<{ expiresAt: number; id: string; name: string }>()
  if (!row) return null
  if (row.expiresAt <= now) {
    await db.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(hash).run()
    return null
  }
  let renewedCookie: string | null = null
  if (row.expiresAt - now < RENEW_BELOW_MS) {
    await db
      .prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?')
      .bind(now + SESSION_TTL_MS, hash)
      .run()
    renewedCookie = sessionCookie(request, id)
  }
  return { id: row.id, name: row.name, renewedCookie }
}

/** Ends the request's session, if it has one. */
export async function endSession(db: D1Like, request: Request): Promise<void> {
  const id = readSessionId(request)
  if (id)
    await db
      .prepare('DELETE FROM sessions WHERE id_hash = ?')
      .bind(await sha256Hex(id))
      .run()
}
