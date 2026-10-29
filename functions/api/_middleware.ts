// Runs before every `/api/*` Function (ADR-0029, ADR-0031), so no route can forget the host pin,
// the rate limit or the Origin check (server/apiGuard.ts). The root functions/_middleware.ts then adds the
// security headers to whatever is answered.
//
// It is also the only place that writes the error log (ADR-0058, server/errorLog.ts): it catches
// anything a route throws, and after the answer it logs one line if the request failed on the
// server's side (a 5xx, or a note a handler left through `data`).
import { guardApi } from '../../server/apiGuard.ts'
import {
  attachReporter,
  logServerError,
  type AssetsBinding,
  type ErrorLogBinding,
  type ErrorNote,
} from '../../server/errorLog.ts'
import { fail } from '../../server/http.ts'
import type { RateLimiterBinding } from '../../server/rateLimit.ts'

/** What the middleware reads from the Pages project's bindings and secrets. */
export type ApiEnv = {
  RATE_LIMITER?: RateLimiterBinding
  /**
   * The only host the API answers on (server/apiGuard.ts). A Pages secret, not a `wrangler.toml`
   * var, so the public repo never names the live site (ADR-0047).
   */
  CANONICAL_HOST?: string
  /** The error-log Worker (workers/error-log/, ADR-0058). Missing locally; logging then only prints. */
  ERROR_LOG?: ErrorLogBinding
  /** This deploy's static files, given to every Pages Function; read for `/version.json`. */
  ASSETS?: AssetsBinding
}

/** The guard first; the route only runs if it lets the request through. Then the error log. */
export const onRequest: PagesFunction<ApiEnv> = async (context) => {
  const { request, env } = context
  // The handler's note about a failure, if any (last one wins: one line per request).
  let note: ErrorNote | undefined
  const report = (n: ErrorNote) => {
    note = n
  }
  attachReporter(context.data, report)

  let response: Response
  try {
    // Fail closed (ADR-0047): with no site address the pin would let every old deploy reach the
    // production database, so a missing secret stops the API instead of quietly opening it.
    response = !env.CANONICAL_HOST
      ? fail(500, 'host_not_configured')
      : ((await guardApi(request, env.RATE_LIMITER, env.CANONICAL_HOST, report)) ??
        (await context.next()))
  } catch (error) {
    // Without this, the client would get Cloudflare's own error page and nothing would be logged.
    note = { cause: 'uncaught', error }
    response = fail(500, 'server_error')
  }

  if (note || response.status >= 500)
    // After the answer is sent (waitUntil), so logging never slows or breaks it.
    context.waitUntil(
      logServerError({
        request,
        response: response.clone(),
        note,
        binding: env.ERROR_LOG,
        assets: env.ASSETS,
      }),
    )
  return response
}
