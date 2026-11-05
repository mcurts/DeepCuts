// The rate-limit Worker. Pages Functions can't use
// Cloudflare's rate-limit binding directly, so this tiny Worker holds it and the Pages Functions
// ask it, over a service binding, whether a client may make another request.
//
// It never logs or stores the key it's given (the Function passes the client's IP). The binding
// counts requests per key in Cloudflare's memory for the configured period and forgets them.
import { WorkerEntrypoint } from 'cloudflare:workers'

/** What this Worker is bound to (workers/rate-limit/wrangler.toml). */
export type RateLimitEnv = {
  /** 120 requests per 60 s per key: movie data, tags, the session check. */
  API_LIMITER: RateLimit
  /** 10 requests per 60 s per key: sign-in, registration and account changes. */
  AUTH_LIMITER: RateLimit
}

/** Which limit to count against (see `RateLimitEnv`). */
export type Bucket = 'api' | 'auth'

/** The answer to one check. */
export type RateLimitResult = { allowed: boolean }

/**
 * Called by the Pages Functions as `env.RATE_LIMITER.check(key, bucket)` (an RPC over the service
 * binding). Not reachable from the internet: the Worker has no route and `workers_dev` is off.
 */
export default class RateLimiter extends WorkerEntrypoint<RateLimitEnv> {
  /** Counts one request for `key` in `bucket` and says whether it's within the limit. */
  async check(key: string, bucket: Bucket = 'api'): Promise<RateLimitResult> {
    const limiter = bucket === 'auth' ? this.env.AUTH_LIMITER : this.env.API_LIMITER
    const { success } = await limiter.limit({ key })
    return { allowed: success }
  }

  /** Plain HTTP requests are refused: the only way in is the RPC method above. */
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 })
  }
}
