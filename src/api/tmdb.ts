// TMDB client (ADR-0002): the only code that fetches movie data.
//
// The browser never talks to TMDB directly: it calls our own `/api/tmdb/...` proxy, which adds
// the secret API token on the server (server/tmdb/proxy.ts). Every response is checked with a
// Zod schema before the app uses it (ADR-0008, ADR-0015), so unexpected data fails safely here
// instead of breaking a screen. Schemas only keep the fields the app actually uses.
import { z } from 'zod'

// An image path like "/abc123.jpg". Anything else (a full URL, odd characters) becomes null,
// so we only ever build image URLs on TMDB's own image host.
const imagePath = z
  .string()
  .regex(/^\/[\w.-]+\.(jpg|jpeg|png|svg|webp)$/i)
  .nullable()
  .catch(null)

// Signals the recommendation scorer uses (ADR-0026). Lenient: missing or odd values become neutral.
const signals = {
  popularity: z.number().nonnegative().catch(0).default(0),
  vote_average: z.number().min(0).max(10).catch(0).default(0),
  vote_count: z.number().int().nonnegative().catch(0).default(0),
  original_language: z.string().max(8).catch('').default(''),
}

// A film as it appears in search results, lists and recommendations.
const movieSummary = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  release_date: z.string().optional().default(''),
  overview: z.string().default(''),
  poster_path: imagePath,
  backdrop_path: imagePath,
  genre_ids: z.array(z.number().int()).default([]),
  ...signals,
})

/** One page of search or discover results. */
export const searchResultsSchema = z.object({
  page: z.number().int(),
  total_pages: z.number().int(),
  total_results: z.number().int(),
  results: z.array(movieSummary),
})

/** A film series and its films, in TMDB's order (ADR-0032). */
export const collectionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  parts: z.array(movieSummary).default([]),
})

/** Everything the Detail page needs about one film, from a single call. */
export const movieDetailSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  tagline: z.string().default(''),
  release_date: z.string().default(''),
  runtime: z.number().int().nullable().default(null),
  overview: z.string().default(''),
  poster_path: imagePath,
  backdrop_path: imagePath,
  genres: z.array(z.object({ id: z.number().int(), name: z.string() })).default([]),
  ...signals,
  // The series the film belongs to, if any ("Friday the 13th Collection"). Its films become
  // scorer candidates when you like this one (ADR-0032). Lenient: odd data means no series.
  belongs_to_collection: z
    .object({ id: z.number().int().positive(), name: z.string() })
    .nullable()
    .optional()
    .catch(null),
  // Appended to the same call: the film's recommendations, the scorer's candidates (ADR-0026).
  recommendations: z
    .object({ results: z.array(movieSummary) })
    .optional()
    .catch(undefined),
  // Appended to the same call: films TMDB finds similar by genre and keywords. More candidates
  // that aren't from the same series, at no extra request (ADR-0037).
  similar: z
    .object({ results: z.array(movieSummary) })
    .optional()
    .catch(undefined),
  // Appended to the same call for the scorer's keyword and director parts (ADR-0028). Lenient:
  // a malformed block just means no keywords or directors for this film.
  keywords: z
    .object({ keywords: z.array(z.object({ id: z.number().int(), name: z.string() })) })
    .optional()
    .catch(undefined),
  // The proxy trims credits to directors, writers and the five top-billed actors
  // (server/tmdb/core.ts), so this stays small.
  credits: z
    .object({
      crew: z.array(z.object({ id: z.number().int(), name: z.string(), job: z.string() })),
      cast: z.array(z.object({ id: z.number().int(), name: z.string() })).default([]),
    })
    .optional()
    .catch(undefined),
  // The companies that made it, for the scorer's studio part (ADR-0038). Lenient: odd data means
  // no companies.
  production_companies: z
    .array(z.object({ id: z.number().int(), name: z.string() }))
    .default([])
    .catch([]),
  // Appended to the same call for the content rating (ADR-0024).
  release_dates: z
    .object({
      results: z.array(
        z.object({
          iso_3166_1: z.string(),
          release_dates: z.array(z.object({ certification: z.string().max(10).default('') })),
        }),
      ),
    })
    .optional()
    .catch(undefined),
})

// A streaming service (Netflix, Apple TV…), from JustWatch via TMDB.
const provider = z.object({
  provider_id: z.number().int(),
  provider_name: z.string(),
  logo_path: imagePath,
})

/** Where to watch a film, per country code ("US"), split by subscription, rent and buy. */
export const watchProvidersSchema = z.object({
  results: z.record(
    z.string(),
    z.object({
      flatrate: z.array(provider).optional(),
      rent: z.array(provider).optional(),
      buy: z.array(provider).optional(),
    }),
  ),
})

// TypeScript types derived from the schemas, so types and validation can't disagree.
export type MovieSummary = z.infer<typeof movieSummary>
export type SearchResults = z.infer<typeof searchResultsSchema>
export type MovieDetail = z.infer<typeof movieDetailSchema>
export type Collection = z.infer<typeof collectionSchema>
export type Provider = z.infer<typeof provider>
export type WatchProviders = z.infer<typeof watchProvidersSchema>

/** A TMDB request that came back with an error status (e.g. 404 for an unknown film). */
export class TmdbError extends Error {
  readonly status: number
  /** On a 429: how many seconds the server asked us to wait (`Retry-After`), if it said. */
  readonly retryAfter: number | undefined
  constructor(status: number, retryAfter?: number) {
    super(`TMDB request failed (${status})`)
    this.status = status
    this.retryAfter = retryAfter
  }
}

// The rate limiter's `Retry-After` in whole seconds (server/rateLimit.ts sends 60). Anything that
// isn't a sensible number (the HTTP-date form, junk, or more than ten minutes) is ignored, so the
// retry falls back to the limiter's period (api/retry.ts).
function retryAfterOf(res: Response) {
  const seconds = Number(res.headers.get('Retry-After') ?? NaN)
  return Number.isInteger(seconds) && seconds >= 0 && seconds <= 600 ? seconds : undefined
}

// Fetches one proxy path, throws on an error status, and validates the JSON with `schema`.
// `signal` lets TanStack Query cancel requests that are no longer needed.
//
// A 200 that isn't the JSON we expect is treated as an upstream error (502) too. On Cloudflare,
// once the daily Function quota runs out, Pages skips the proxy ("fail open") and answers
// `/api/tmdb/*` with the app's index.html and a 200 (ADR-0029, Stage 4 H8). The screens then show
// their usual "can't reach movie data" state instead of crashing.
async function get<T>(
  path: string,
  schema: z.ZodType<T>,
  params?: Record<string, string>,
  signal?: AbortSignal,
) {
  const qs = params ? `?${new URLSearchParams(params)}` : ''
  const res = await fetch(`/api/tmdb/${path}${qs}`, signal ? { signal } : {})
  if (!res.ok) throw new TmdbError(res.status, retryAfterOf(res))
  if (!res.headers.get('Content-Type')?.includes('application/json')) throw new TmdbError(502)
  const parsed = schema.safeParse(await res.json().catch(() => undefined))
  if (!parsed.success) throw new TmdbError(502)
  return parsed.data
}

/** The TMDB calls the app makes. Each returns validated data. */
export const tmdb = {
  /** Films whose title matches `query`. */
  search: (query: string, page = 1, signal?: AbortSignal) =>
    get('search/movie', searchResultsSchema, { query, page: String(page) }, signal),
  /**
   * One film's details, plus in the same call: content ratings, recommended and similar films,
   * keywords and directors (one request serves Detail and the recommendation scorer,
   * ADR-0024/0026/0028/0037).
   */
  movie: (id: number, signal?: AbortSignal) =>
    get(
      `movie/${id}`,
      movieDetailSchema,
      { append_to_response: 'release_dates,recommendations,similar,keywords,credits' },
      signal,
    ),
  /** Popular, well-voted films (no genre filter: ADR-0032 dropped favourite genres). */
  discover: (signal?: AbortSignal) =>
    get(
      'discover/movie',
      searchResultsSchema,
      {
        sort_by: 'popularity.desc',
        // Skip barely-rated films so the feed isn't full of obscure noise.
        'vote_count.gte': '200',
      },
      signal,
    ),
  /**
   * Acclaimed, lesser-known, older films: Discovery's starter shelf before you've liked anything
   * (ADR-0042). `page` picks one slice of the ~120 pages; `today` is only for tests.
   */
  deepCuts: (page: number, signal?: AbortSignal, today = new Date()) =>
    get(
      'discover/movie',
      searchResultsSchema,
      {
        // 200 to 3,000 votes: enough to trust the rating, too few for a blockbuster (those have
        // tens of thousands).
        'vote_count.gte': '200',
        'vote_count.lte': '3000',
        'vote_average.gte': '7',
        // Released more than ten years ago, counted in whole years so the cutoff moves each
        // January and "older" stays true.
        'primary_release_date.lte': `${today.getFullYear() - 10}-12-31`,
        // Popularity *within* that band brings up recognisable cult films; sorting by rating
        // instead surfaced mostly concert films, shorts and arthouse canon (sampled 2026-10-15).
        sort_by: 'popularity.desc',
        page: String(page),
      },
      signal,
    ),
  /**
   * Well-rated films tagged with one keyword ("slasher"), for the scorer's keyword candidates
   * (ADR-0038). Needs 100 votes, so the barely-rated don't rank by a lucky 10/10.
   */
  byKeyword: (keywordId: number, signal?: AbortSignal) =>
    get(
      'discover/movie',
      searchResultsSchema,
      {
        with_keywords: String(keywordId),
        sort_by: 'vote_average.desc',
        'vote_count.gte': '100',
      },
      signal,
    ),
  /** A film series and its films (ADR-0032). */
  collection: (id: number, signal?: AbortSignal) =>
    get(`collection/${id}`, collectionSchema, undefined, signal),
  /** Where a film can be streamed, rented or bought. */
  watchProviders: (id: number, signal?: AbortSignal) =>
    get(`movie/${id}/watch/providers`, watchProvidersSchema, undefined, signal),
}

// The image widths TMDB serves ("w342" = 342px wide).
type ImageSize = 'w92' | 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original'

/** Builds a TMDB CDN URL; the CSP only allows images from this host. */
export function imageUrl(path: string | null, size: ImageSize): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null
}

/** "1982-06-25" → "1982"; '' when the date is missing or malformed. */
export function releaseYear(date: string): string {
  return /^\d{4}/.test(date) ? date.slice(0, 4) : ''
}

/** 109 → "1h 49m"; 45 → "45m"; '' when unknown. */
export function formatRuntime(minutes: number | null): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

/** Subscription providers first, then rent/buy, de-duplicated. */
export function providersFor(data: WatchProviders, region: string): Provider[] {
  const r = data.results[region]
  if (!r) return []
  const seen = new Set<number>()
  // A service often offers both rent and buy; keep its first (most useful) appearance only.
  return [...(r.flatrate ?? []), ...(r.rent ?? []), ...(r.buy ?? [])].filter((p) =>
    seen.has(p.provider_id) ? false : (seen.add(p.provider_id), true),
  )
}

/** The first non-empty certification for a region (e.g. "R"), or ''. */
export function certification(movie: MovieDetail, region: string): string {
  const r = movie.release_dates?.results.find((x) => x.iso_3166_1 === region)
  return r?.release_dates.find((d) => d.certification)?.certification ?? ''
}

/** A credited person: TMDB's person id and name. */
export interface CrewMember {
  id: number
  name: string
}

/**
 * A film's directors and writers from its appended credits, each person once, in TMDB's order.
 * Writers are the "Screenplay" and "Writer" credits; a film with neither falls back to "Story".
 * Used by the Discover cards (names) and the scorer (ids, ADR-0032).
 */
export function crewOf(movie: MovieDetail): { directors: CrewMember[]; writers: CrewMember[] } {
  const crew = movie.credits?.crew ?? []
  // People with any of the given jobs, each person once.
  const people = (...jobs: string[]) => {
    const seen = new Set<number>()
    return crew
      .filter((p) => jobs.includes(p.job) && !seen.has(p.id) && (seen.add(p.id), true))
      .map(({ id, name }) => ({ id, name }))
  }
  const writers = people('Screenplay', 'Writer')
  return { directors: people('Director'), writers: writers.length ? writers : people('Story') }
}

/** A film's directors and writers by name, for the Discover cards. */
export interface Credits {
  directors: string[]
  writers: string[]
}

/** How many names each credit line shows; more would wrap a tile into a wall of text. */
const MAX_CREDIT_NAMES = 2

/** The directors and writers from a film's appended credits, by name, at most two each. */
/** A Detail response as a summary, for components shared with search and picks (the cassette tile). */
export function summaryOf(movie: MovieDetail): MovieSummary {
  return { ...movie, genre_ids: movie.genres.map((g) => g.id) }
}

export function creditsOf(movie: MovieDetail): Credits {
  const { directors, writers } = crewOf(movie)
  // Names, each once (two people can share a name), at most MAX_CREDIT_NAMES.
  const names = (people: CrewMember[]) =>
    [...new Set(people.map((p) => p.name))].slice(0, MAX_CREDIT_NAMES)
  return { directors: names(directors), writers: names(writers) }
}
