// Allowlist for the local TMDB proxy. Pure and unit-tested:
// only these endpoints and parameters reach TMDB; anything else is rejected.
import { z } from 'zod'

/** A request that passed the allowlist, ready to send to TMDB. */
export type TmdbRequest = { path: string; params: URLSearchParams }
/** Either the cleaned-up request, or why it was refused (400 bad input, 404 unknown endpoint). */
export type AllowlistResult = { ok: true; request: TmdbRequest } | { ok: false; status: 400 | 404 }

// Shared rules for parameter values.
const page = z.coerce.number().int().min(1).max(500)
const id = z.coerce.number().int().positive().max(99_999_999)
const voteCount = z.coerce.number().int().min(0).max(100_000)
// A real calendar date, YYYY-MM-DD (no 2015-02-31), in a sane range: 1870 predates the first films.
const isoDate = z.iso.date().refine((v) => v >= '1870-01-01' && v <= '2999-12-31')
// Extras that may ride along on a film's details call; each at most once.
const APPENDABLE = new Set(['release_dates', 'recommendations', 'similar', 'keywords', 'credits'])
const appendList = z.string().refine((v) => {
  const parts = v.split(',')
  return parts.every((p) => APPENDABLE.has(p)) && new Set(parts).size === parts.length
})

// One allowed endpoint: the path pattern, its allowed parameters (strict: any other parameter is
// refused), how to build the upstream path, and parameters we always add.
type Route = {
  pattern: RegExp
  params: z.ZodObject
  path: (match: RegExpMatchArray) => string
  fixed?: Record<string, string>
}

// Every TMDB endpoint the app may reach. Adult content is always excluded.
const ROUTES: Route[] = [
  {
    pattern: /^search\/movie$/,
    params: z.strictObject({ query: z.string().trim().min(1).max(100), page: page.optional() }),
    path: () => 'search/movie',
    fixed: { include_adult: 'false' },
  },
  {
    pattern: /^discover\/movie$/,
    // No genre filters: taste comes only from tagged films, never declared genres.
    // One keyword id at a time, taken from the keywords of films you liked.
    params: z.strictObject({
      page: page.optional(),
      with_keywords: id.optional(),
      sort_by: z
        .enum(['popularity.desc', 'vote_average.desc', 'primary_release_date.desc'])
        .optional(),
      'vote_count.gte': voteCount.optional(),
      // The starter shelf's band and cutoff: at most so many votes, a minimum rating,
      // released on or before a date.
      'vote_count.lte': voteCount.optional(),
      'vote_average.gte': z.coerce.number().min(0).max(10).optional(),
      'primary_release_date.lte': isoDate.optional(),
    }),
    path: () => 'discover/movie',
    fixed: { include_adult: 'false' },
  },
  {
    pattern: /^movie\/(\d+)$/,
    // Only these extras may be appended, so Detail and the scorer each need one call: the content rating, recommended and similar films, keywords
    // and credits.
    params: z.strictObject({ append_to_response: appendList.optional() }),
    path: (m) => `movie/${id.parse(m[1])}`,
  },
  {
    pattern: /^movie\/(\d+)\/watch\/providers$/,
    params: z.strictObject({}),
    path: (m) => `movie/${id.parse(m[1])}/watch/providers`,
  },
  {
    // A film series ("Friday the 13th Collection"): its films become scorer candidates when you
    // liked one of them.
    pattern: /^collection\/(\d+)$/,
    params: z.strictObject({}),
    path: (m) => `collection/${id.parse(m[1])}`,
  },
  {
    pattern: /^genre\/movie\/list$/,
    params: z.strictObject({}),
    path: () => 'genre/movie/list',
  },
]

/**
 * Checks a proxy request against the allowlist and returns the clean request to send upstream.
 * `subpath` is the part after `/api/tmdb/` with no leading slash or query string.
 */
export function resolveTmdbRequest(subpath: string, query: URLSearchParams): AllowlistResult {
  for (const route of ROUTES) {
    const match = subpath.match(route.pattern)
    if (!match) continue
    // A repeated parameter (?page=1&page=2) is ambiguous, so it's refused.
    const keys = [...query.keys()]
    if (new Set(keys).size !== keys.length) return { ok: false, status: 400 }
    const parsed = route.params.safeParse(Object.fromEntries(query))
    if (!parsed.success) return { ok: false, status: 400 }
    let path: string
    try {
      path = route.path(match)
    } catch {
      return { ok: false, status: 400 }
    }
    // Rebuild the query from validated values only, then add the fixed parameters.
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) params.set(k, String(v))
    }
    for (const [k, v] of Object.entries(route.fixed ?? {})) params.set(k, v)
    return { ok: true, request: { path, params } }
  }
  return { ok: false, status: 404 }
}
