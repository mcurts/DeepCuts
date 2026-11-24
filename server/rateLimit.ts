// The per-client rate limit in front of every `/api/*` request.
// functions/api/_middleware.ts asks the rate-limit Worker (workers/rate-limit/) over a service
// binding; over the limit, the client gets a short 429 and the request goes no further.
import type { ReportError } from './errorLog.ts'
import { json } from './http.ts'

/** The rate-limit Worker as the Function sees it through the service binding (an RPC stub). */
export type RateLimiterBinding = {
  check(key: string, bucket?: Bucket): Promise<{ allowed: boolean }>
}

/**
 * Which limit a request counts against: `auth` is the tighter one (10 / 60 s) and `tmdb` the
 * roomier one (300 / 60 s) for read-only film data.
 */
export type Bucket = 'api' | 'auth' | 'tmdb'

/**
 * Picks the bucket for a request. Anything that signs in, registers or changes the account counts
 * against the tight `auth` limit. Reading the session (`GET /api/auth/session`, on every page
 * load) stays in the general bucket, so reloading the app can't lock anyone out.
 *
 * Film data (`/api/tmdb/*`) has its own bucket. It is public, read-only data, and one Discover load
 * makes dozens of calls for it; sharing a bucket with the account calls would either starve the
 * suggestions or loosen the limit on everything else.
 */
export function bucketFor(request: Request): Bucket {
  const { pathname } = new URL(request.url)
  if (pathname.startsWith('/api/auth/') && request.method !== 'GET') return 'auth'
  return pathname.startsWith('/api/tmdb/') ? 'tmdb' : 'api'
}

/** How long a limited client should wait, in seconds: the limiter's whole period. */
const RETRY_AFTER_SECONDS = 60

/**
 * Checks the client against the limit. Returns a 429 response when they're over it, or `null`
 * to carry on.
 *
 * The key is the client's IP from `CF-Connecting-IP`, which Cloudflare sets and a client can't
 * forge. It's passed to the limiter and nowhere else: never logged, never stored.
 *
 * **Fails open.** If the limiter is missing or errors, the request is allowed. A limiter outage
 * shouldn't take the app down, and cost is already capped elsewhere: on Workers Free, requests
 * past the daily quota are refused, never billed. A limiter error is
 * reported, so an unchecked API shows up in the error log.
 */
export async function rateLimit(
  request: Request,
  limiter: RateLimiterBinding | undefined,
  report?: ReportError,
): Promise<Response | null> {
  if (!limiter) return null
  // Locally (`wrangler pages dev`) the header may be absent; everyone then shares one bucket.
  const key = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  try {
    const { allowed } = await limiter.check(key, bucketFor(request))
    if (allowed) return null
  } catch (error) {
    report?.({ cause: 'rate_limiter_unavailable', error })
    return null
  }
  return json(429, { error: 'rate_limited' }, { 'Retry-After': String(RETRY_AFTER_SECONDS) })
}
