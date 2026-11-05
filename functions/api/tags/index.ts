// GET /api/tags lists the user's tags; PUT sets one; DELETE removes one (or all).
// The logic lives in server/accounts/; this file only routes methods to it. The rate
// limit and the Origin check run first, in functions/api/_middleware.ts.
import { changeTag, listTags } from '../../../server/accounts/tags.ts'
import { route } from '../../../server/http.ts'
import type { AccountsEnv } from '../../../server/accounts/d1.ts'

/** Routes each method to its handler; anything else is a 405. */
export const onRequest: PagesFunction<AccountsEnv> = route<AccountsEnv>({
  GET: ({ request, env }) => listTags(request, env),
  PUT: ({ request, env }) => changeTag(request, env),
  DELETE: ({ request, env }) => changeTag(request, env),
})
