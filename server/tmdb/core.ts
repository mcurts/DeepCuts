// The TMDB proxy's request handling, written once on the Fetch API (`Request` → `Response`) so it
// runs unchanged in two places (ADR-0029):
// - locally, inside `vite dev` / `vite preview`, through the thin adapter in proxy.ts;
// - on Cloudflare Pages, as the Function in functions/api/tmdb/[[path]].ts.
//
// The browser calls `/api/tmdb/<path>`; this checks the request against the allowlist
// (allowlist.ts), adds the secret read token, calls TMDB and returns the JSON. Errors are
// reduced to a short code, so TMDB's own messages (or the token) never reach the browser
// (ADR-0008, ADR-0013).
import { ignoreErrors, type ReportError } from '../errorLog.ts'
import { json } from '../http.ts'
import { resolveTmdbRequest } from './allowlist.ts'

/** The path prefix the proxy answers. Anything else isn't a proxy request. */
export const TMDB_PREFIX = '/api/tmdb/'
const UPSTREAM = 'https://api.themoviedb.org/3/'
const HOUR = 60 * 60

/**
 * The crew jobs the app shows or scores: the director (ADR-0028) and the writers credited on
 * Discover tiles. TMDB files writers under several jobs; "Story" is the fallback when a film has
 * no screenplay or writer credit.
 */
export const KEPT_CREW_JOBS = ['Director', 'Screenplay', 'Writer', 'Story'] as const

/** How many top-billed actors the scorer's cast part compares (ADR-0038). */
export const KEPT_CAST = 5

/**
 * Shrinks a film's appended credits to its directors, writers and top-billed actors before they
 * reach the browser (ADR-0028, ADR-0038). Full credits list the whole cast and crew (often
 * 50–150 kB); the app only uses these few. Anything that isn't a film-details body with credits
 * passes through unchanged.
 */
export function trimCredits(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('credits' in body)) return body
  const credits = (body as { credits: unknown }).credits
  // One of the credits' lists, or an empty one when it's missing or malformed.
  const list = (key: 'crew' | 'cast'): unknown[] =>
    typeof credits === 'object' &&
    credits !== null &&
    key in credits &&
    Array.isArray((credits as Record<string, unknown>)[key])
      ? ((credits as Record<string, unknown>)[key] as unknown[])
      : []
  const crew = list('crew')
    .filter((p) => (KEPT_CREW_JOBS as readonly unknown[]).includes((p as { job?: unknown })?.job))
    .map((p) => {
      const { id, name, job } = p as { id: unknown; name: unknown; job: unknown }
      return { id, name, job }
    })
  // TMDB lists the cast in billing order; `order` says so explicitly, so sort by it to be sure.
  const cast = list('cast')
    .filter(
      (p): p is { id: unknown; name: unknown; order?: unknown } =>
        typeof p === 'object' && p !== null,
    )
    .map((p, i) => ({ p, order: typeof p.order === 'number' ? p.order : i }))
    .sort((a, b) => a.order - b.order)
    .slice(0, KEPT_CAST)
    .map(({ p }) => ({ id: p.id, name: p.name }))
  return { ...body, credits: { crew, cast } }
}

/**
 * How long the edge may cache a successful answer, in seconds. Matches the client's `staleTime`
 * in src/api/queries.ts: lists that change through the day (search, discover) for an hour; a
 * film's details, its providers and the genre list for a day.
 */
export function edgeTtl(upstreamPath: string): number {
  return /^(search|discover)\//.test(upstreamPath) ? HOUR : 24 * HOUR
}

/** Optional extras for {@link handleTmdb}. */
export type TmdbOptions = {
  /** Tests pass a fake fetch. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /**
   * A shared edge cache (Cloudflare's `caches.default`). When given, successful answers are
   * stored under the normalized upstream URL and served from there until they expire. Local
   * runs pass nothing.
   */
  cache?: Cache
  /**
   * Hears why TMDB failed, for the error log (ADR-0058). A 404 isn't a failure: it's how TMDB
   * answers a film id that doesn't exist, which anyone can ask for.
   */
  report?: ReportError
}

/**
 * Answers one proxy request.
 * @param request - The browser's request. Its path must start with `/api/tmdb/`.
 * @param token - TMDB's read token: from `.env.local` locally, or the Pages secret
 *   `TMDB_READ_TOKEN` on Cloudflare. Never a `VITE_` variable, so never in the bundle.
 */
export async function handleTmdb(
  request: Request,
  token: string | undefined,
  { fetchImpl = fetch, cache, report = ignoreErrors }: TmdbOptions = {},
): Promise<Response> {
  // Read-only: only GET is forwarded.
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' })
  const url = new URL(request.url)
  if (!url.pathname.startsWith(TMDB_PREFIX)) return json(404, { error: 'not_found' })
  // Check the path and parameters against the allowlist (allowlist.ts).
  const result = resolveTmdbRequest(url.pathname.slice(TMDB_PREFIX.length), url.searchParams)
  if (!result.ok)
    return json(result.status, { error: result.status === 404 ? 'not_found' : 'bad_request' })
  // No token configured (e.g. in E2E tests): a clear error instead of a failed TMDB call.
  if (!token) {
    report({ cause: 'tmdb_token_missing' })
    return json(503, { error: 'tmdb_token_missing' })
  }

  // The upstream URL is rebuilt from validated values only (allowlist), so it's a safe cache key:
  // equivalent requests share one entry, and it never contains the token (that goes in a header).
  const upstreamUrl = `${UPSTREAM}${result.request.path}?${result.request.params}`
  const cacheKey = new Request(upstreamUrl)
  // A cache hit saves a TMDB call and its latency. It does NOT save Function quota: on Pages,
  // the Function still runs for every `/api/*` request, and the lookup happens inside it.
  // A broken cache must never break the proxy, so failures there count as a miss.
  const cached = await cache?.match(cacheKey).catch(() => undefined)
  if (cached) return json(200, await cached.json())

  try {
    const upstream = await fetchImpl(upstreamUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      // Give up after 8 seconds rather than leaving the page waiting.
      signal: AbortSignal.timeout(8000),
    })
    if (upstream.status === 404) return json(404, { error: 'upstream_error' })
    if (!upstream.ok) {
      report({ cause: 'tmdb_upstream', upstreamStatus: upstream.status })
      return json(502, { error: 'upstream_error' })
    }
    const body = trimCredits(await upstream.json())
    // Only successful answers are cached; errors (and 429s from the limiter) never reach here.
    // (The Cache API decides expiry from the stored response's Cache-Control.)
    await cache
      ?.put(
        cacheKey,
        json(200, body, { 'Cache-Control': `public, max-age=${edgeTtl(result.request.path)}` }),
      )
      .catch(() => undefined)
    return json(200, body)
  } catch (error) {
    report({ cause: 'tmdb_timeout', error })
    return json(504, { error: 'upstream_timeout' })
  }
}
