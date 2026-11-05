// TMDB reads through TanStack Query: caching, de-duplication and cancellation.
//
// Each entry pairs a cache key with the call that fills it. Screens use them as
// `useQuery(movieQueries.detail(id))`; two screens asking for the same film share one request.
import { queryOptions } from '@tanstack/react-query'
import { tmdb } from './tmdb'

const HOUR = 60 * 60 * 1000
// The starter shelf picks from TMDB's first ten pages of deep cuts: about 200 films,
// the better-known end of the ~120 pages, so newcomers meet films they may recognise.
const DEEP_CUT_PAGES = 10

// Movie metadata rarely changes, so TMDB queries stay fresh for a long time.
export const movieQueries = {
  /** Title search. Waits for at least two characters, so a single letter doesn't search. */
  search: (query: string) =>
    queryOptions({
      queryKey: ['tmdb', 'search', query],
      queryFn: ({ signal }) => tmdb.search(query, 1, signal),
      enabled: query.trim().length >= 2,
      staleTime: HOUR,
    }),
  /** Popular films (Discover without likes, and onboarding). */
  discover: () =>
    queryOptions({
      queryKey: ['tmdb', 'discover'],
      queryFn: ({ signal }) => tmdb.discover(signal),
      staleTime: HOUR,
    }),
  /**
   * Discovery's starter shelf before any likes: one random page of the first ten, so
   * new visits see different films. The page is picked when the query runs, so the shelf holds
   * still for the hour the result stays fresh.
   */
  deepCuts: () =>
    queryOptions({
      queryKey: ['tmdb', 'deep-cuts'],
      queryFn: ({ signal }) =>
        tmdb.deepCuts(1 + Math.floor(Math.random() * DEEP_CUT_PAGES), signal),
      staleTime: HOUR,
    }),
  /** Well-rated films with one keyword, for the scorer's keyword candidates. */
  byKeyword: (keywordId: number) =>
    queryOptions({
      queryKey: ['tmdb', 'keyword', keywordId],
      queryFn: ({ signal }) => tmdb.byKeyword(keywordId, signal),
      staleTime: 24 * HOUR,
    }),
  /** A film series' films, for the scorer's series candidates. */
  collection: (id: number) =>
    queryOptions({
      queryKey: ['tmdb', 'collection', id],
      queryFn: ({ signal }) => tmdb.collection(id, signal),
      staleTime: 24 * HOUR,
    }),
  /** One film's details (also feeds the recommendation scorer). */
  detail: (id: number) =>
    queryOptions({
      queryKey: ['tmdb', 'movie', id],
      queryFn: ({ signal }) => tmdb.movie(id, signal),
      staleTime: 24 * HOUR,
    }),
  /** Where to watch one film. */
  providers: (id: number) =>
    queryOptions({
      queryKey: ['tmdb', 'movie', id, 'providers'],
      queryFn: ({ signal }) => tmdb.watchProviders(id, signal),
      staleTime: 24 * HOUR,
    }),
}
