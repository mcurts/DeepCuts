// The MVP session provider, running entirely in this browser.
//
// "Sign in" offers only a clearly labelled demo account. Registration makes a practice account: the invite code is validated and then
// dropped, never stored, and no passkey is made. No network. When real sign-in methods are chosen, a new
// provider implements the same SessionProvider interface and the screens don't change.
import {
  accountSchema,
  registrationSchema,
  SIGNED_OUT,
  type Account,
  type SessionProvider,
  type SignInMethod,
} from '../SessionProvider'
import { versionedStore } from './versionedStore'

/**
 * Storage keys (without the `deepcuts:v1:` prefix) that older versions wrote for the retired
 * device profile, "Save my picks". Nothing reads them any more; they're listed so a
 * later cleanup knows exactly what to remove.
 */
export const RETIRED_PROFILE_KEYS = ['profile', 'tags'] as const

// The practice account everyone signs in as (the project owner's name), labelled as a demo in the UI.
const DEMO_ACCOUNT: Account = { id: 'demo', name: 'Mike Curts', method: 'demo' }
// The sign-in options shown on the sign-in page, in order.
const METHODS: readonly SignInMethod[] = [
  {
    id: 'demo',
    label: 'Continue with a demo account',
    description: 'Practice sign-in. No real account is created.',
  },
]

/**
 * Builds the local session provider.
 * @param storage - Defaults to the browser's localStorage; tests pass their own.
 */
export function createMockSessionProvider(storage?: Storage): SessionProvider {
  const opts = storage ? { storage } : {}
  // One stored value: the signed-in account.
  const account = versionedStore<Account | null>({
    key: 'account',
    schema: accountSchema.nullable(),
    fallback: null,
    ...opts,
  })
  return {
    async getSession() {
      const a = account.load()
      // The demo account is defined here, not by what was stored: a browser that signed in before
      // the demo was renamed (Alex Rivera → Mike Curts) would otherwise keep the old name forever.
      if (a?.method === 'demo') return { kind: 'account', account: DEMO_ACCOUNT }
      return a ? { kind: 'account', account: a } : SIGNED_OUT
    },
    // Registration here only makes a practice account; the page says so.
    practiceRegistration: true,
    signInMethods: () => METHODS,
    async signIn(method) {
      if (!METHODS.some((m) => m.id === method))
        throw new Error(`Unknown sign-in method: ${method}`)
      account.save(DEMO_ACCOUNT)
      return { kind: 'account', account: DEMO_ACCOUNT }
    },
    async register(details) {
      // parse() throws a ZodError for invalid details; the form shows them before getting here.
      const { name } = registrationSchema.parse(details)
      // Only the name is kept. Any well-formed invite code is accepted: the real check (single
      // use, not expired) happens on the server in the accounts stage.
      // One fixed id: registering again on this device returns to the same practice lists.
      const practice: Account = { id: 'practice', name, method: 'practice' }
      account.save(practice)
      return { kind: 'account', account: practice }
    },
    async signOut() {
      // Forget who's signed in. The account's own tag list stays stored for next time.
      account.remove()
      return SIGNED_OUT
    },
  }
}
