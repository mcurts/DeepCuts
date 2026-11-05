// The signed-in account (Stage 6 A2/A2b): who am I, sign out, rename, delete.
// Every handler finds the user from the session cookie only; no user id is ever taken from the
// client.
import { z } from 'zod'
import { registrationSchema } from '../../src/adapters/SessionProvider.ts'
import { fail, json, readJson } from '../http.ts'
import type { AccountsEnv } from './d1.ts'
import { clearedSessionCookie, currentUser, endSession } from './sessions.ts'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * `GET /api/auth/session`: the signed-in user `{ id, name }`, or `null` when nobody is signed in.
 * Renews a session past half its life (the new cookie rides along). Signed out is an ordinary
 * answer here, not an error: every page asks on load, and a 401 put an error in the browser's
 * console for every signed-out visitor (Lighthouse "Best practices"). Clients from before this
 * change read `null` as an unexpected body and fall back to signed out, the same as a 401.
 */
export async function getSession(request: Request, env: AccountsEnv, now = Date.now()) {
  const user = await currentUser(env.DB, request, now)
  if (!user) return json(200, null, NO_STORE)
  return json(
    200,
    { id: user.id, name: user.name },
    { ...NO_STORE, ...(user.renewedCookie && { 'Set-Cookie': user.renewedCookie }) },
  )
}

/** `POST /api/auth/sign-out`: deletes the session row and clears the cookie. Always succeeds. */
export async function signOut(request: Request, env: AccountsEnv) {
  await endSession(env.DB, request)
  return json(200, { ok: true }, { ...NO_STORE, 'Set-Cookie': clearedSessionCookie(request) })
}

/** The rename body: the same name rule as registration. */
const renameSchema = z.object({ name: registrationSchema.shape.name })

/** `PATCH /api/auth/me` `{ name }`: renames the signed-in user. */
export async function rename(request: Request, env: AccountsEnv, now = Date.now()) {
  const user = await currentUser(env.DB, request, now)
  if (!user) return fail(401, 'signed_out')
  const body = await readJson(request, renameSchema)
  if ('error' in body) return body.error
  await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(body.data.name, user.id).run()
  return json(200, { id: user.id, name: body.data.name }, NO_STORE)
}

/**
 * `DELETE /api/auth/me`: deletes the signed-in user and everything they own, in one D1 batch, then
 * clears the cookie. Each table is deleted explicitly (not only through the foreign-key cascade),
 * so the outcome doesn't depend on a database setting.
 */
export async function deleteAccount(request: Request, env: AccountsEnv, now = Date.now()) {
  const user = await currentUser(env.DB, request, now)
  if (!user) return fail(401, 'signed_out')
  const db = env.DB
  await db.batch([
    db.prepare('DELETE FROM tags WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM top_ten WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM watchlist_order WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(user.id),
    // Recovery invites for this user (used ones too: they'd point at a deleted user).
    db.prepare('DELETE FROM invites WHERE user_id = ?').bind(user.id),
    db.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ])
  return json(200, { ok: true }, { ...NO_STORE, 'Set-Cookie': clearedSessionCookie(request) })
}
