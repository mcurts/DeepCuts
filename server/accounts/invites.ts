// Invite codes: how people get an account. Used by `npm run invite`
// (scripts/invite.mjs) and by the tests, so both make codes the same way.
//
// A code is 16 random bytes as base64url (22 characters, 128 bits). Only its SHA-256 is stored;
// the code itself exists only in the printed link, so a database copy holds no usable invite.
import { randomToken, sha256Hex } from './crypto.ts'

/** How long an invite lasts by default: 7 days. */
export const INVITE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** A new invite: the code to share, and the row to store. */
export type NewInvite = {
  code: string
  codeHash: string
  createdAt: number
  expiresAt: number
  /** Set for a recovery invite: it adds a passkey to this existing user. */
  userId: string | null
}

/**
 * Makes an invite.
 * @param days - How long it stays valid (1–30).
 * @param userId - For a recovery invite, the user it adds a passkey to.
 */
export async function makeInvite({
  days = INVITE_DAYS,
  userId = null,
  now = Date.now(),
}: { days?: number; userId?: string | null; now?: number } = {}): Promise<NewInvite> {
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error('days must be 1–30')
  if (userId !== null && !/^[\w-]{22}$/.test(userId)) throw new Error('not a user id')
  const code = randomToken(16)
  return {
    code,
    codeHash: await sha256Hex(code),
    createdAt: now,
    expiresAt: now + days * DAY_MS,
    userId,
  }
}

/**
 * The SQL that stores an invite. Values are checked above and are only hex, digits and base64url,
 * so inlining them is safe (the wrangler CLI's `--command` takes no bound parameters).
 */
export function inviteInsertSql(invite: NewInvite): string {
  const user = invite.userId === null ? 'NULL' : `'${invite.userId}'`
  return `INSERT INTO invites (code_hash, created_at, expires_at, user_id) VALUES ('${invite.codeHash}', ${invite.createdAt}, ${invite.expiresAt}, ${user});`
}

/** The link that opens registration with the code filled in. */
export const inviteLink = (base: string, code: string) =>
  `${base.replace(/\/$/, '')}/register?invite=${code}`
