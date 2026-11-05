// Feeds the scorer from the person's tags,
// their Top Ten and cached TMDB data.
//
// The Top Ten counts as extra likes: each Top Ten film is a liked film that weighs
// TOP_TEN_WEIGHT, whether or not it also has the liked tag, and is never suggested back.
//
// Two passes:
// 1. One details call per tagged film (with recommended and similar films, keywords and credits
//    appended), one series call per liked series (MAX_SERIES at most), and one keyword search
//    per keyword your likes share most (KEYWORD_SEARCHES at most) give the
//    candidates; the scorer ranks them.
// 2. The top RERANK candidates get one details call each for their keywords, credits and series, and
//    the scorer ranks again with them. Every call is the same cached details query the Detail
//    page uses, so opening a recommended film afterwards costs nothing.
// Each pick then gets its one-sentence reason (pickReason.ts), named from the same data. Home
// shows "Why this pick?", which opens it (PickReason).
import { useQueries, useQuery } from '@tanstack/react-query'
import { movieQueries } from '@/api/queries'
import { crewOf, releaseYear, type MovieDetail, type MovieSummary } from '@/api/tmdb'
import { pickReasons } from '@/domain/pickReason'
import {
  DEFAULT_WEIGHTS,
  keywordsToSearch,
  recommend,
  scoreCandidates,
  TOP_TEN_WEIGHT,
  type FilmDetails,
  type Pick,
  type RecommendOptions,
  type ScorerFilm,
  type TasteInput,
} from '@/domain/scorer'
import { useTagQueries } from './tagQueries'
import { useTopTen } from './topTenQueries'

// These caps bound how many proxy calls a first Discover load makes, which must stay well
// under the per-client rate limit (workers/rate-limit/wrangler.toml). feedBudget.test.ts adds
// them up and fails if a change here would push a heavy profile's first load over it.

/**
 * How many recent tags of each kind inform the feed (bounds the number of calls). Likes drive the
 * candidates, so they get the most; the watchlist and dislikes only nudge scores, so 5 each is
 * enough (kept low to fit the rate limit). "Recent" for likes and dislikes;
 * for the watchlist it's the first 5 in the person's own order, the same 5 Home shows.
 */
export const LIMITS = { liked: 20, watchlist: 5, disliked: 5 } as const
/**
 * How many picks Home's Discovery shelf shows: two full rows in the 1200px column. Each
 * needs its details for the credit lines; most are already loaded by the re-rank (RERANK).
 */
export const HOME_PICKS = 10
/** How many top candidates get their keywords and directors loaded for the re-rank. */
export const RERANK = 20
/** How many liked series (most recent likes first) bring their films in as candidates. */
export const MAX_SERIES = 10

/** A pick with TMDB's summary of the film and the sentence saying why it was picked. */
export interface Recommendation extends Omit<Pick, 'film'> {
  movie: MovieSummary
  /** "Same director as The Thing", unique across the list where it can be (pickReason.ts). */
  reason: string
}

// A film's keywords, credits, studios and series, from its details (empty when TMDB has none).
function detailsOf(m: MovieDetail): FilmDetails {
  return {
    keywordIds: m.keywords?.keywords.map((k) => k.id) ?? [],
    ...crewOf(m),
    cast: m.credits?.cast ?? [],
    companies: m.production_companies,
    seriesId: m.belongs_to_collection?.id ?? null,
  }
}

// "2026-10-07" style dates compare correctly as strings; a missing date sorts first and counts
// as unreleased, so announced sequels without a date stay out.
const today = () => new Date().toISOString().slice(0, 10)
const isReleased = (m: MovieSummary) => m.release_date !== '' && m.release_date <= today()

// Converts TMDB's data (either shape) into the plain facts the scorer uses, so the scorer never
// depends on TMDB's field names. Full details also carry keywords and directors.
function toScorerFilm(m: MovieSummary | MovieDetail): ScorerFilm {
  return {
    ...('genres' in m && detailsOf(m)),
    id: m.id,
    title: m.title,
    genreIds: 'genre_ids' in m ? m.genre_ids : m.genres.map((g) => g.id),
    year: Number(releaseYear(m.release_date)) || null,
    language: m.original_language,
    popularity: m.popularity,
    voteAverage: m.vote_average,
    voteCount: m.vote_count,
  }
}

/** The person's taste, loaded once and scored as often as needed (Discover, the weights lab). */
export interface Taste {
  /** True when there's anything to recommend from: a liked film or a Top Ten film. */
  hasLikes: boolean
  loading: boolean
  /** Scores the taste, keeping picks whose TMDB summary is known (for posters and links). */
  score: (options?: RecommendOptions) => Recommendation[]
  /**
   * Every candidate, scored but not ranked (best score first), for the weights lab's spread panel.
   */
  candidates: (options?: RecommendOptions) => Recommendation[]
}

/**
 * Loads the current person's taste: their recent tags and their Top Ten, plus each film's details.
 */
export function useTaste(): Taste {
  const tagQueries = useTagQueries()
  // The whole Top Ten (at most ten films), in rank order. Home's Top Ten shelf loads the same
  // details, so on Home these cost no extra calls (feedBudget.test.ts already counts them).
  const topTenQuery = useTopTen()
  const topTen = topTenQuery.data ?? []
  const liked = (useQuery(tagQueries.list('liked')).data ?? []).slice(0, LIMITS.liked)
  const wanted = (useQuery(tagQueries.list('watchlist')).data ?? []).slice(0, LIMITS.watchlist)
  const disliked = (useQuery(tagQueries.list('disliked')).data ?? []).slice(0, LIMITS.disliked)
  const tagged = useQuery(tagQueries.all()).data

  const ids = [...new Set([...topTen, ...liked, ...wanted, ...disliked])]
  // One details call per tagged film, all in parallel; already-cached films cost nothing.
  const details = useQueries({ queries: ids.map((id) => movieQueries.detail(id)) })
  const byId = new Map<number, MovieDetail>()
  details.forEach((q, i) => {
    const id = ids[i]
    if (q.data && id !== undefined) byId.set(id, q.data)
  })
  const moviesFor = (list: number[]) => list.flatMap((id) => byId.get(id) ?? [])

  // Every film that counts as a like: the Top Ten first (the strongest signal, so their series
  // come first under MAX_SERIES), then liked films not already in it. A film that is both counts
  // once, at the Top Ten weight.
  const inTopTen = new Set(topTen)
  const likedMovies = moviesFor([...new Set([...topTen, ...liked])])
  // The series of your liked films: one cached call each, newest likes first.
  const seriesIds = [
    ...new Set(likedMovies.flatMap((m) => m.belongs_to_collection?.id ?? [])),
  ].slice(0, MAX_SERIES)
  const seriesQueries = useQueries({
    queries: seriesIds.map((id) => movieQueries.collection(id)),
  })
  // Each series' released films, by series id. A series that fails to load just adds nothing.
  const seriesFilms = new Map<number, MovieSummary[]>()
  seriesQueries.forEach((q, i) => {
    const id = seriesIds[i]
    if (q.data && id !== undefined) seriesFilms.set(id, q.data.parts.filter(isReleased))
  })
  const seriesOf = (m: MovieDetail) => {
    const id = m.belongs_to_collection?.id
    return id === undefined ? [] : (seriesFilms.get(id) ?? [])
  }
  const tags = {
    liked: likedMovies.map((m) => ({
      film: toScorerFilm(m),
      weight: inTopTen.has(m.id) ? TOP_TEN_WEIGHT : 1,
      recommendations: (m.recommendations?.results ?? []).map(toScorerFilm),
      similar: (m.similar?.results ?? []).map(toScorerFilm),
      // Series films carry their series id, so the series part and spread rules know them.
      series: seriesOf(m).map((f) => ({
        ...toScorerFilm(f),
        seriesId: m.belongs_to_collection?.id ?? null,
      })),
    })),
    wanted: moviesFor(wanted).map(toScorerFilm),
    disliked: moviesFor(disliked).map(toScorerFilm),
  }
  // The keywords your likes share most, each searched for well-rated films. Waits for
  // every tagged film's details, so the keywords don't change (and search again) as they arrive.
  const taggedLoaded = !topTenQuery.isPending && details.every((q) => !q.isPending)
  const keywordIds = taggedLoaded ? keywordsToSearch(tags) : []
  const keywordQueries = useQueries({
    queries: keywordIds.map((id) => movieQueries.byKeyword(id)),
  })
  const keywordFilms = keywordQueries.map((q) => (q.data?.results ?? []).filter(isReleased))
  // TMDB's own summaries of every candidate film, to show posters and titles for the picks.
  const summaries = new Map(
    [
      ...likedMovies.flatMap((m) => [
        ...(m.recommendations?.results ?? []),
        ...(m.similar?.results ?? []),
        ...seriesOf(m),
      ]),
      ...keywordFilms.flat(),
    ].map((r) => [r.id, r] as const),
  )
  const input: TasteInput = {
    ...tags,
    keywordSearches: keywordIds.map((keywordId, i) => ({
      keywordId,
      films: (keywordFilms[i] ?? []).map(toScorerFilm),
    })),
    // Your own Top Ten films are never suggested back to you, tagged or not.
    excluded: new Set([...(tagged?.map((r) => r.tmdbId) ?? []), ...topTen]),
  }

  // Pass 2: load keywords, credits and series for the top candidates (default weights, so the set of
  // films fetched doesn't change while someone drags the weights lab sliders).
  const top = recommend(input, { limit: RERANK }).map((p) => p.film.id)
  const topDetails = useQueries({ queries: top.map((id) => movieQueries.detail(id)) })
  const candidateDetails = new Map<number, FilmDetails>()
  topDetails.forEach((q, i) => {
    const id = top[i]
    if (q.data && id !== undefined) candidateDetails.set(id, detailsOf(q.data))
  })
  const reranked: TasteInput = { ...input, details: candidateDetails }
  // Keyword names for the reasons ("final girl"): a pick's shared keywords are always ones a liked
  // film has, and the liked films' details carry their names.
  const keywordNames = new Map(
    likedMovies.flatMap((m) => m.keywords?.keywords ?? []).map((k) => [k.id, k.name] as const),
  )

  return {
    hasLikes: liked.length > 0 || topTen.length > 0,
    // Still loading until both passes are in, so the picks don't reshuffle on screen.
    loading:
      topTenQuery.isPending ||
      details.some((q) => q.isPending) ||
      seriesQueries.some((q) => q.isPending) ||
      keywordQueries.some((q) => q.isPending) ||
      topDetails.some((q) => q.isPending),
    // Scoring a few hundred candidates is well under a millisecond, so it simply runs each render.
    score: (options) => withSummaries(recommend(reranked, options), options),
    candidates: (options) => withSummaries(scoreCandidates(reranked, options), options),
  }

  // Drops picks without a TMDB summary, swaps each scorer film for its summary, and adds the
  // reasons (worked out after the drop, so a hidden pick never takes a sentence).
  function withSummaries(picks: Pick[], options?: RecommendOptions): Recommendation[] {
    const shown = picks.filter((p) => summaries.has(p.film.id))
    const weights = options?.weights ?? DEFAULT_WEIGHTS
    const reasons = pickReasons(shown, weights, (id) => keywordNames.get(id))
    return shown.flatMap(({ film, ...rest }, i) => {
      const movie = summaries.get(film.id)
      return movie ? [{ ...rest, movie, reason: reasons[i] ?? '' }] : []
    })
  }
}

/** Discover's picks with the default weights: `{ recommendations, hasLikes, loading }`. */
export function useRecommendations(limit = 20) {
  const { score, hasLikes, loading } = useTaste()
  return { recommendations: score({ limit }), hasLikes, loading }
}
