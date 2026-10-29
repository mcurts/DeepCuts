// The TMDB proxy as a Cloudflare Pages Function (ADR-0029, Stage 4 H2). It answers every
// `/api/tmdb/*` request with the same core the local Vite proxy uses (server/tmdb/core.ts), plus
// Cloudflare's edge cache. The rate limit runs first, in functions/api/_middleware.ts.
//
// Only `/api/*` reaches Functions at all (public/_routes.json), so static files never use the
// Function quota.
import { reporterFrom } from '../../../server/errorLog.ts'
import { handleTmdb } from '../../../server/tmdb/core.ts'

/** What the Pages project gives this Function (the dashboard secret, or `.dev.vars` locally). */
export type Env = {
  /** TMDB's read token: an encrypted Pages secret in production, `.dev.vars` locally. */
  TMDB_READ_TOKEN?: string
}

/**
 * Every method lands here; the core answers anything but GET with 405. TMDB failures are reported
 * to the `/api` middleware's error log (ADR-0058).
 */
export const onRequest: PagesFunction<Env> = async ({ request, env, data }) =>
  handleTmdb(request, env.TMDB_READ_TOKEN, { cache: caches.default, report: reporterFrom(data) })
