// PATCH /api/tags/order: save a new order for the watchlist.
// The logic lives in server/accounts/tags.ts; this file only routes methods to it. The rate limit
// and the Origin check run first, in functions/api/_middleware.ts.
import { reorderWatchlist } from '../../../server/accounts/tags.ts'
import { route } from '../../../server/http.ts'
import type { AccountsEnv } from '../../../server/accounts/d1.ts'

/** Routes each method to its handler; anything else is a 405. */
export const onRequest: PagesFunction<AccountsEnv> = route<AccountsEnv>({
  PATCH: ({ request, env }) => reorderWatchlist(request, env),
})
