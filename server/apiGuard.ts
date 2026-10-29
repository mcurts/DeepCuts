// The checks every `/api/*` request passes before any route runs (ADR-0029, ADR-0031). Used by
// functions/api/_middleware.ts on Cloudflare, and by the accounts tests, so both run the same code:
// 1. The host pin: the API answers only on the site's own address (`CANONICAL_HOST`, a Pages
//    secret, ADR-0047). Every Cloudflare Pages deploy also stays reachable forever at its own
//    `<hash>.<project>.pages.dev` address, running that version's code against the production
//    database and secret; the pin makes those old copies (and `<project>.pages.dev` itself) unable
//    to reach either. Checked first, so a refused host never uses the rate limiter.
// 2. The per-client rate limit (rateLimit.ts). Sign-in, registration and account changes count
//    against a tighter limit than everything else.
// 3. CSRF protection: any request that can change data (anything but GET/HEAD/OPTIONS) must come
//    from this site's own pages, judged by its `Origin` header. Otherwise 403 `bad_origin`.
import type { ReportError } from './errorLog.ts'
import { fail, isSameOrigin, SAFE_METHODS } from './http.ts'
import { rateLimit, type RateLimiterBinding } from './rateLimit.ts'

// This machine's own names. `wrangler pages dev` (preview:cf, the Cloudflare E2E) serves here with
// the production config, pin included. A request routed to Cloudflare can't carry these names,
// so allowing them never opens the pin on the real site.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Whether the API may answer on this request's host.
 * @param canonicalHost - The site's address, from the `CANONICAL_HOST` Pages secret (ADR-0047).
 *   When it isn't set (unit tests), every host is allowed; on Cloudflare the middleware refuses to
 *   run without it (functions/api/_middleware.ts).
 */
export function isAllowedHost(request: Request, canonicalHost: string | undefined): boolean {
  const { hostname } = new URL(request.url)
  return !canonicalHost || hostname === canonicalHost || LOOPBACK.has(hostname)
}

/**
 * Returns the response that stops the request (421, 429 or 403), or null to let it through.
 * `report` hears about a failing rate limiter (ADR-0058).
 */
export async function guardApi(
  request: Request,
  limiter: RateLimiterBinding | undefined,
  canonicalHost?: string,
  report?: ReportError,
): Promise<Response | null> {
  // 421 Misdirected Request: this address isn't the one that serves the API.
  if (!isAllowedHost(request, canonicalHost)) return fail(421, 'wrong_host')
  const limited = await rateLimit(request, limiter, report)
  if (limited) return limited
  if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request)) return fail(403, 'bad_origin')
  return null
}
