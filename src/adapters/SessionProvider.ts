// The session contract (ADR-0013, ADR-0025, ADR-0034): who is using the app.
//
// There are two kinds of session (ADR-0034):
// - signedOut: the landing page and the account pages only; nothing is read or saved;
// - account: signed in. A real account signs in with a passkey (ADR-0031, Cloudflare D1). The
//   shared "demo" account (ADR-0025) and the "practice" account the local mock makes from the
//   registration form are stand-ins that live only on this device.
import { z } from 'zod'

/** A signed-in account as stored and shown. `id` is restricted so it's safe in storage keys. */
export const accountSchema = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/),
  name: z.string().trim().min(1).max(80),
  // passkey: a real account on the server (ADR-0031). demo: the shared practice account
  // (ADR-0025). practice: made by the local mock's registration form. Neither demo nor practice is
  // a real account; both live only on this device.
  method: z.enum(['passkey', 'demo', 'practice']),
})
/** A signed-in account (see `accountSchema`). */
export type Account = z.infer<typeof accountSchema>
/** The sign-in page's buttons: a passkey (real accounts) and the demo account. */
export type SignInMethodId = Extract<Account['method'], 'passkey' | 'demo'>

/**
 * What the registration form asks for (ADR-0031). The messages are shown under each field.
 * - name: the same limit an account name has.
 * - invite: the single-use code from an invite link: 128 random bits as base64url (22 characters).
 * The passkey itself is made by the device, not typed, so it isn't part of this schema.
 */
export const registrationSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use 80 characters or fewer.'),
  invite: z
    .string()
    .trim()
    .min(1, 'Enter the code from your invite link.')
    .regex(/^[\w-]{22}$/, 'That code isn’t right. Check your invite link.'),
})
/** The registration form's fields (see `registrationSchema`). */
export type Registration = z.infer<typeof registrationSchema>

/** What the sign-in page shows for each method the provider supports. */
export interface SignInMethod {
  id: SignInMethodId
  label: string
  description: string
}

/** The current session: signed out, or signed in to an account (ADR-0034). */
export type Session = { kind: 'signedOut' } | { kind: 'account'; account: Account }

/** The one signed-out session; providers return this rather than building their own. */
export const SIGNED_OUT: Session = { kind: 'signedOut' }

/** Everything the app can do with sessions, independent of how sign-in actually works. */
export interface SessionProvider {
  /**
   * The account signed in last time, or signed out. Rejects when it can't tell (e.g. the accounts
   * server doesn't answer in time, or answers with an error), so the app can say so instead of
   * showing a signed-in person as signed out (issue #19).
   */
  getSession(): Promise<Session>
  /** The sign-in options to offer, in display order. */
  signInMethods(): readonly SignInMethod[]
  /** Rejects for a method this provider doesn't offer, or when sign-in doesn't complete. */
  signIn(method: SignInMethodId): Promise<Session>
  /**
   * Creates an account from the registration form and signs it in (ADR-0031). Throws a ZodError
   * for invalid details. The local mock keeps only the name; the invite code is discarded.
   */
  register(details: Registration): Promise<Session>
  /** Signs out on this device. The account keeps its lists. */
  signOut(): Promise<Session>
  /**
   * True when `register` only makes a practice account on this device (the local mock), so the
   * registration page says so (ADR-0025: a mock must never pass for a real account).
   */
  readonly practiceRegistration: boolean
  /** Renames the signed-in passkey account (ADR-0031 A2b). Absent where accounts can't be renamed. */
  rename?(name: string): Promise<Session>
  /** Deletes the signed-in passkey account and its lists, for good. Absent where unsupported. */
  deleteAccount?(): Promise<Session>
}

/** The first word of a name, for the header ("Mike Curts" → "Mike"). */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? ''

/** The line under the account's name (header account menu, Account page), per kind of account. */
export const SIGNED_IN_WITH: Record<Account['method'], string> = {
  passkey: 'Signed in with a passkey',
  demo: 'Signed in with the demo account',
  practice: 'Practice account, made on this device',
}
