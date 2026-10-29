// POST /api/auth/register/verify: verify the new passkey, create the account, start a session.
// The logic lives in server/accounts/ (ADR-0031); this file only routes methods to it. The rate
// limit and the Origin check run first, in functions/api/_middleware.ts.
import { registerVerify } from '../../../../server/accounts/auth.ts'
import { reporterFrom } from '../../../../server/errorLog.ts'
import { route } from '../../../../server/http.ts'
import type { AccountsEnv } from '../../../../server/accounts/d1.ts'

/** Routes each method to its handler; anything else is a 405. */
export const onRequest: PagesFunction<AccountsEnv> = route<AccountsEnv>({
  // The reporter lets a failed sign-up batch reach the error log (ADR-0058).
  POST: ({ request, env, data }) => registerVerify(request, env, Date.now(), reporterFrom(data)),
})
