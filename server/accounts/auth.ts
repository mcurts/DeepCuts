// Passkey sign-up and sign-in (ADR-0031, Stage 6 A2), built on @simplewebauthn/server.
//
// Each flow is two requests:
// 1. `…/options`: the server stores a single-use challenge (5 minutes) and returns the options the
//    browser passes to the device ("create a passkey" or "use a passkey").
// 2. `…/verify`: the browser sends back the device's signed answer. The challenge is consumed
//    first (deleted and returned in one statement, so it can never be used twice, even by two
//    requests at once), then the answer is checked against it, this site's origin and RP ID.
//
// Sign-up needs a valid invite: it exists (looked up by its SHA-256), is unused and unexpired.
// The invite is claimed in the same D1 batch that creates the account, so it can't be used twice.
// A *recovery* invite carries a user id and adds a new passkey to that existing account.
//
// Each new challenge also clears out expired challenges and sessions (`storeChallenge`), so
// abandoned attempts and long-gone visitors don't pile up in D1.
//
// Errors are short codes only (`invalid_invite`, `verification_failed`…), never library messages.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { z } from 'zod'
import { registrationSchema } from '../../src/adapters/SessionProvider.ts'
import { ignoreErrors, type ReportError } from '../errorLog.ts'
import { fail, json, readJson } from '../http.ts'
import { base64url, randomToken, sha256Hex } from './crypto.ts'
import type { AccountsEnv, D1Like, D1Stmt } from './d1.ts'
import { newSession, purgeExpiredSessions } from './sessions.ts'

/** How long a challenge stays usable. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000
/** Shown by the device when it saves the passkey ("Deep Cuts"). */
const RP_NAME = 'Deep Cuts'

/** Answers from the accounts API are never cached, by the browser or anything in between. */
const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * The relying party, from the request itself: the origin the page was served from and its host
 * name as the RP ID. Behind Cloudflare, `request.url` is the public URL; locally it's
 * `http://localhost:8788` (browsers allow passkeys on localhost).
 */
function relyingParty(request: Request) {
  const url = new URL(request.url)
  return { origin: url.origin, rpID: url.hostname }
}

/** A passkey row as the verify steps need it. */
type PasskeyRow = {
  credential_id: string
  user_id: string
  public_key: ArrayBuffer | Uint8Array | number[]
  counter: number
  transports: string | null
}

/** Reads `transports` back from its JSON column ("internal", "hybrid"…). Anything odd is dropped. */
function parseTransports(value: string | null): string[] | undefined {
  if (!value) return undefined
  try {
    return z.array(z.string().max(32)).max(8).parse(JSON.parse(value))
  } catch {
    return undefined
  }
}

/**
 * Stores a new challenge, first deleting expired challenges and sessions in the same transaction.
 * The options endpoints are the only writers of challenges and sit in the tight `auth` rate-limit
 * bucket, so the purge runs at most a few times a minute per client. Both tables are small (one
 * row per sign-in attempt or device), so a scan is cheap.
 */
async function storeChallenge(db: D1Like, insert: D1Stmt, now: number) {
  await db.batch([
    db.prepare('DELETE FROM challenges WHERE expires_at <= ?').bind(now),
    purgeExpiredSessions(db, now),
    insert,
  ])
}

/**
 * Deletes a challenge and returns it, if it exists, is of `kind` and hasn't expired. Deleting
 * first makes every challenge single-use: a second attempt (or a replay) finds nothing.
 */
async function consumeChallenge(
  db: D1Like,
  id: string,
  kind: 'register' | 'authenticate',
  now: number,
) {
  return db
    .prepare(
      `DELETE FROM challenges WHERE id = ? AND kind = ? AND expires_at > ?
       RETURNING challenge, invite_code_hash AS inviteHash, name, user_id AS userId`,
    )
    .bind(id, kind, now)
    .first<{
      challenge: string
      inviteHash: string | null
      name: string | null
      userId: string | null
    }>()
}

/** The usable invite with this code hash, or null. */
async function findInvite(db: D1Like, codeHash: string, now: number) {
  return db
    .prepare(
      'SELECT user_id AS userId FROM invites WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?',
    )
    .bind(codeHash, now)
    .first<{ userId: string | null }>()
}

// ---- Registration -------------------------------------------------------------------------

/**
 * `POST /api/auth/register/options` `{ name, invite }`: checks the invite and returns passkey
 * creation options plus the challenge id to send back with the answer.
 */
export async function registerOptions(request: Request, env: AccountsEnv, now = Date.now()) {
  const body = await readJson(request, registrationSchema)
  if ('error' in body) return body.error
  const { name, invite } = body.data
  const inviteHash = await sha256Hex(invite)
  const found = await findInvite(env.DB, inviteHash, now)
  if (!found) return fail(400, 'invalid_invite')

  // A recovery invite adds a passkey to its user; a normal one creates a new user. Either way the
  // id is fixed now and stored with the challenge, so the verify step can't be pointed elsewhere.
  const userId = found.userId ?? randomToken(16)
  // A recovered account shouldn't register a passkey it already has.
  const existing = found.userId
    ? (
        await env.DB.prepare('SELECT credential_id, transports FROM passkeys WHERE user_id = ?')
          .bind(found.userId)
          .all<{ credential_id: string; transports: string | null }>()
      ).results
    : []

  const { rpID } = relyingParty(request)
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: name,
    userDisplayName: name,
    // The WebAuthn user handle is our user id's bytes; sign-in checks it matches (`userHandle`).
    userID: Uint8Array.from(new TextEncoder().encode(userId)),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.credential_id,
      transports: parseTransports(p.transports),
    })),
    // A discoverable credential, so sign-in needs no username. User verification (fingerprint,
    // face or PIN) is only preferred: devices that can will still ask, but it isn't enforced,
    // because accounts are test-only invites (owner decision, 2026-10-07).
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  })

  const challengeId = randomToken(16)
  await storeChallenge(
    env.DB,
    env.DB.prepare(
      `INSERT INTO challenges (id, challenge, kind, invite_code_hash, name, user_id, expires_at)
       VALUES (?, ?, 'register', ?, ?, ?, ?)`,
    ).bind(challengeId, options.challenge, inviteHash, name, userId, now + CHALLENGE_TTL_MS),
    now,
  )
  return json(200, { challengeId, options }, NO_STORE)
}

/** The verify body: which challenge, and the device's answer (checked by SimpleWebAuthn). */
const verifySchema = z.object({
  challengeId: z.string().regex(/^[\w-]{22}$/),
  response: z.looseObject({ id: z.string().max(1024), type: z.literal('public-key') }),
})

/**
 * `POST /api/auth/register/verify` `{ challengeId, response }`: verifies the new passkey, then in
 * one D1 batch creates the user (unless recovering), claims the invite, stores the passkey and
 * starts a session. A failed batch is reported to the error log (ADR-0058): it usually means D1
 * failed, though it's also how a lost race for one invite ends.
 */
export async function registerVerify(
  request: Request,
  env: AccountsEnv,
  now = Date.now(),
  report: ReportError = ignoreErrors,
) {
  const body = await readJson(request, verifySchema)
  if ('error' in body) return body.error
  const challenge = await consumeChallenge(env.DB, body.data.challengeId, 'register', now)
  if (!challenge?.inviteHash || !challenge.userId || !challenge.name)
    return fail(400, 'verification_failed')

  // The invite is checked again: it may have been used or expired since the options step.
  const invite = await findInvite(env.DB, challenge.inviteHash, now)
  if (!invite || (invite.userId !== null && invite.userId !== challenge.userId))
    return fail(400, 'invalid_invite')

  const { origin, rpID } = relyingParty(request)
  let credential
  try {
    const result = await verifyRegistrationResponse({
      response: body.data.response as unknown as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // Preferred, not required (see registerOptions).
      requireUserVerification: false,
    })
    if (!result.verified) return fail(400, 'verification_failed')
    credential = result.registrationInfo.credential
  } catch {
    return fail(400, 'verification_failed')
  }

  const recovering = invite.userId !== null
  const session = await newSession(env.DB, request, challenge.userId, now)
  const db = env.DB
  try {
    await db.batch([
      // New account: the user first, so the invite and passkey can point at it.
      ...(recovering
        ? []
        : [
            db
              .prepare('INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)')
              .bind(challenge.userId, challenge.name, now),
          ]),
      // Claim the invite, recording which user it went to. Only an unused, unexpired one changes.
      db
        .prepare(
          `UPDATE invites SET used_at = ?, user_id = COALESCE(user_id, ?)
           WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`,
        )
        .bind(now, challenge.userId, challenge.inviteHash, now),
      // The passkey's user id is read back from the invite *we* just claimed. If another request
      // claimed it first, this is NULL, the NOT NULL rule fails, and the whole batch is undone.
      db
        .prepare(
          `INSERT INTO passkeys (credential_id, user_id, public_key, counter, transports, created_at)
           VALUES (?, (SELECT user_id FROM invites WHERE code_hash = ? AND used_at = ? AND user_id = ?),
                   ?, ?, ?, ?)`,
        )
        .bind(
          credential.id,
          challenge.inviteHash,
          now,
          challenge.userId,
          credential.publicKey,
          credential.counter,
          credential.transports ? JSON.stringify(credential.transports) : null,
          now,
        ),
      session.statement,
    ])
  } catch (error) {
    report({ cause: 'signup_batch_failed', error })
    return fail(400, 'invalid_invite')
  }
  const user = await db
    .prepare('SELECT id, name FROM users WHERE id = ?')
    .bind(challenge.userId)
    .first<{ id: string; name: string }>()
  return json(200, user, { ...NO_STORE, 'Set-Cookie': session.cookie })
}

// ---- Sign-in ------------------------------------------------------------------------------

/**
 * `POST /api/auth/authenticate/options`: a challenge for "use a passkey". No `allowCredentials`:
 * the passkey is discoverable, so the device offers the right one and nobody types a username.
 */
export async function authenticateOptions(request: Request, env: AccountsEnv, now = Date.now()) {
  const { rpID } = relyingParty(request)
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' })
  const challengeId = randomToken(16)
  await storeChallenge(
    env.DB,
    env.DB.prepare(
      `INSERT INTO challenges (id, challenge, kind, expires_at) VALUES (?, ?, 'authenticate', ?)`,
    ).bind(challengeId, options.challenge, now + CHALLENGE_TTL_MS),
    now,
  )
  return json(200, { challengeId, options }, NO_STORE)
}

/**
 * `POST /api/auth/authenticate/verify` `{ challengeId, response }`: finds the passkey, verifies the
 * signature, updates its counter and starts a session.
 */
export async function authenticateVerify(request: Request, env: AccountsEnv, now = Date.now()) {
  const body = await readJson(request, verifySchema)
  if ('error' in body) return body.error
  const challenge = await consumeChallenge(env.DB, body.data.challengeId, 'authenticate', now)
  if (!challenge) return fail(400, 'verification_failed')

  const response = body.data.response as unknown as AuthenticationResponseJSON
  const passkey = await env.DB.prepare(
    'SELECT credential_id, user_id, public_key, counter, transports FROM passkeys WHERE credential_id = ?',
  )
    .bind(response.id)
    .first<PasskeyRow>()
  if (!passkey) return fail(400, 'verification_failed')
  // The device also says which user the passkey belongs to; it must match what we stored.
  const handle = response.response?.userHandle
  if (handle && handle !== base64url(new TextEncoder().encode(passkey.user_id)))
    return fail(400, 'verification_failed')

  const { origin, rpID } = relyingParty(request)
  let newCounter: number
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // Preferred, not required (see registerOptions).
      requireUserVerification: false,
      credential: {
        id: passkey.credential_id,
        // D1 may return a BLOB as an ArrayBuffer or a number array; both become bytes here.
        publicKey: new Uint8Array(passkey.public_key as ArrayBuffer),
        counter: passkey.counter,
        transports: parseTransports(passkey.transports),
      },
    })
    // (A counter that goes backwards, the sign of a cloned authenticator, throws above.)
    if (!result.verified) return fail(400, 'verification_failed')
    newCounter = result.authenticationInfo.newCounter
  } catch {
    return fail(400, 'verification_failed')
  }

  const session = await newSession(env.DB, request, passkey.user_id, now)
  await env.DB.batch([
    env.DB.prepare(
      'UPDATE passkeys SET counter = ?, last_used_at = ? WHERE credential_id = ?',
    ).bind(newCounter, now, passkey.credential_id),
    session.statement,
  ])
  const user = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?')
    .bind(passkey.user_id)
    .first<{ id: string; name: string }>()
  return json(200, user, { ...NO_STORE, 'Set-Cookie': session.cookie })
}
