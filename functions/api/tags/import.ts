// POST /api/tags/import: move a device's picks into the account (up to 5,000 records).
// The logic lives in server/accounts/; this file only routes methods to it. The rate
// limit and the Origin check run first, in functions/api/_middleware.ts.
import { importTags } from '../../../server/accounts/tags.ts'
import { route } from '../../../server/http.ts'
import type { AccountsEnv } from '../../../server/accounts/d1.ts'

/** Routes each method to its handler; anything else is a 405. */
export const onRequest: PagesFunction<AccountsEnv> = route<AccountsEnv>({
  POST: ({ request, env }) => importTags(request, env),
})
