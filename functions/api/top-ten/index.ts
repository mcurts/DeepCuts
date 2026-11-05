// GET /api/top-ten lists the user's Top Ten; PUT adds a film; DELETE removes one;
// PATCH saves a new order.
// The logic lives in server/accounts/topTen.ts; this file only routes methods to it. The rate
// limit and the Origin check run first, in functions/api/_middleware.ts.
import { changeTopTen, listTopTen, saveTopTenOrder } from '../../../server/accounts/topTen.ts'
import { route } from '../../../server/http.ts'
import type { AccountsEnv } from '../../../server/accounts/d1.ts'

/** Routes each method to its handler; anything else is a 405. */
export const onRequest: PagesFunction<AccountsEnv> = route<AccountsEnv>({
  GET: ({ request, env }) => listTopTen(request, env),
  PUT: ({ request, env }) => changeTopTen(request, env),
  DELETE: ({ request, env }) => changeTopTen(request, env),
  PATCH: ({ request, env }) => saveTopTenOrder(request, env),
})
