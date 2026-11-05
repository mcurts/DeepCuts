// POST /api/auth/authenticate/verify: verify a passkey sign-in, start a session.
// The logic lives in server/accounts/; this file only routes methods to it. The rate
// limit and the Origin check run first, in functions/api/_middleware.ts.
import { authenticateVerify } from '../../../../server/accounts/auth.ts'
import { route } from '../../../../server/http.ts'
import type { AccountsEnv } from '../../../../server/accounts/d1.ts'

/** Routes each method to its handler; anything else is a 405. */
export const onRequest: PagesFunction<AccountsEnv> = route<AccountsEnv>({
  POST: ({ request, env }) => authenticateVerify(request, env),
})
