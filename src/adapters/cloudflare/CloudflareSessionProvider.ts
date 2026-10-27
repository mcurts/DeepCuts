// The session provider for real accounts (ADR-0031, Stage 6 A4): passkeys against the accounts API
// (`/api/auth/*`, Cloudflare Pages Functions + D1).
//
// Only passkey accounts live on the server. The demo account, which reviewers can try without an
// invite (ADR-0025), stays on this device and is handed to the local provider unchanged.
//
// The browser side of WebAuthn comes from @simplewebauthn/browser: `startRegistration` asks the
// device to create a passkey, `startAuthentication` asks it to use one. Cancelling that prompt
// rejects (NotAllowedError), which the pages show as "didn't finish, nothing was changed".
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { z } from 'zod'
import { createMockSessionProvider } from '../local/MockSessionProvider'
import { AccountsApiError } from './AccountsApiError'
import { reportStatus } from './sessionEnded'
import {
  registrationSchema,
  SIGNED_OUT,
  type Registration,
  type Session,
  type SessionProvider,
  type SignInMethod,
} from '../SessionProvider'

// What the server says about the signed-in user.
const userSchema = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/),
  name: z.string().min(1).max(80),
})
// The options step's answer: a challenge id and the WebAuthn options, which the browser library
// passes to the device as-is (the device and the server check them).
const optionsSchema = z.object({
  challengeId: z.string().regex(/^[\w-]{22}$/),
  options: z.looseObject({ challenge: z.string() }),
})
const errorSchema = z.object({ error: z.string().max(64) })

// How long the startup session check waits for an answer before giving up (issue #19). The app
// waits for it before its first paint (main.tsx), so a stalled request would otherwise leave a
// blank page; 5 seconds is far beyond a normal answer (well under a second) yet short enough that
// the person gets a "can't reach your account" screen with a retry instead of waiting forever.
export const SESSION_TIMEOUT_MS = 5000

/**
 * Calls the accounts API (same origin, cookies included) and validates the answer.
 * @param timeoutMs - Gives up (rejects with an AbortError) when the whole answer hasn't arrived
 *   by then. Only the session check sets one; sign-in calls wait as long as the browser does.
 */
async function api<T>(
  method: string,
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
  timeoutMs?: number,
) {
  const controller = new AbortController()
  const timer =
    timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  let data: unknown
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? null : JSON.stringify(body),
      signal: controller.signal,
    })
    // The body counts too: a server can send headers and then stall. A body that isn't JSON (or is
    // cut off by the timeout) reads as `undefined` and is judged below.
    data = await res.json().catch(() => undefined)
  } finally {
    clearTimeout(timer)
  }
  if (controller.signal.aborted) throw controller.signal.reason
  if (!res.ok) {
    // A 401 means the session ended on the server (issue #18): the app signs out.
    reportStatus(res.status)
    throw new AccountsApiError(res.status, errorSchema.safeParse(data).data?.error ?? 'error')
  }
  const parsed = schema.safeParse(data)
  // A 200 that isn't the expected JSON (e.g. the app's HTML when Functions are skipped) is an error.
  if (!parsed.success) throw new AccountsApiError(502, 'bad_response')
  return parsed.data
}

// A passkey account as a session.
const accountSession = (user: z.infer<typeof userSchema>): Session => ({
  kind: 'account',
  account: { id: user.id, name: user.name, method: 'passkey' },
})

// Passkey first: it's the real account. The demo stays for reviewers (ADR-0025).
const PASSKEY: SignInMethod = {
  id: 'passkey',
  label: 'Sign in with a passkey',
  description: 'Use your fingerprint, face or device PIN.',
}

/**
 * Builds the Cloudflare session provider.
 * @param local - The on-device provider for the demo account (tests inject one).
 */
export function createCloudflareSessionProvider(
  local: SessionProvider = createMockSessionProvider(),
): SessionProvider {
  return {
    async getSession() {
      try {
        const user = await api(
          'GET',
          '/api/auth/session',
          userSchema.nullable(),
          undefined,
          SESSION_TIMEOUT_MS,
        )
        if (user) return accountSession(user)
      } catch (error) {
        // A 401 is a clear "no session": signed out, below. Anything else (a timeout, no network,
        // a 5xx such as the daily Functions quota running out, or HTML instead of JSON) means we
        // can't tell whether a passkey account is signed in (issue #19). Showing signed out then
        // would quietly hide a signed-in person's lists, so this rejects and the app shows "can't
        // reach your account" with a retry (startup.tsx). The demo account still works: it lives on
        // this device, and signing in with a passkey ends it, so if it's here it's the session.
        const signedOut = error instanceof AccountsApiError && error.status === 401
        if (!signedOut) {
          const onDevice = await local.getSession()
          if (onDevice.kind === 'account') return onDevice
          throw error
        }
      }
      // Signed out of a passkey account: the demo account if this device has one.
      return local.getSession()
    },
    practiceRegistration: false,
    signInMethods: () => [PASSKEY, ...local.signInMethods()],
    async signIn(method) {
      if (method !== 'passkey') return local.signIn(method)
      const { challengeId, options } = await api(
        'POST',
        '/api/auth/authenticate/options',
        optionsSchema,
      )
      const response = await startAuthentication({ optionsJSON: options as never })
      const user = await api('POST', '/api/auth/authenticate/verify', userSchema, {
        challengeId,
        response,
      })
      // Only one account at a time: a demo sign-in on this device ends here.
      await local.signOut()
      return accountSession(user)
    },
    async register(details: Registration) {
      // parse() throws a ZodError for invalid details; the form shows them before getting here.
      const valid = registrationSchema.parse(details)
      const { challengeId, options } = await api(
        'POST',
        '/api/auth/register/options',
        optionsSchema,
        valid,
      )
      const response = await startRegistration({ optionsJSON: options as never })
      const user = await api('POST', '/api/auth/register/verify', userSchema, {
        challengeId,
        response,
      })
      await local.signOut()
      return accountSession(user)
    },
    async signOut() {
      // End the server session if there is one (harmless otherwise), and anything on the device.
      await api('POST', '/api/auth/sign-out', z.unknown()).catch(() => undefined)
      await local.signOut()
      return SIGNED_OUT
    },
    async rename(name) {
      return accountSession(await api('PATCH', '/api/auth/me', userSchema, { name }))
    },
    async deleteAccount() {
      await api('DELETE', '/api/auth/me', z.unknown())
      await local.signOut()
      return SIGNED_OUT
    },
  }
}
