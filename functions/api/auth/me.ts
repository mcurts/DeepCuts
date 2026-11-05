// PATCH /api/auth/me renames the signed-in user; DELETE /api/auth/me deletes their account.
// The logic lives in server/accounts/; this file only routes methods to it. The rate
// limit and the Origin check run first, in functions/api/_middleware.ts.
import { deleteAccount, rename } from '../../../server/accounts/account.ts'
import { route } from '../../../server/http.ts'
import type { AccountsEnv } from '../../../server/accounts/d1.ts'

/** Routes each method to its handler; anything else is a 405. */
export const onRequest: PagesFunction<AccountsEnv> = route<AccountsEnv>({
  PATCH: ({ request, env }) => rename(request, env),
  DELETE: ({ request, env }) => deleteAccount(request, env),
})
