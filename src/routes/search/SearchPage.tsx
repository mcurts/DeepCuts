// The Search page (/search, the landing page): results for the header search, with quick add.
//
// The header search field writes `?q=` into the URL; this page reads it and lists every match,
// so a search can be bookmarked or shared (ADR-0014).
import { useQuery } from '@tanstack/react-query'
import { ToggleButton } from 'react-aria-components'
import { useSearchParams } from 'react-router'
import { z } from 'zod'
import { movieQueries } from '@/api/queries'
import { releaseYear, type MovieSummary } from '@/api/tmdb'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { MovieLink } from './MovieLink'
import { PageHeading } from '@/components/ui/PageHeading'
import { genreTone, primaryGenreName } from '@/domain/genres'
import { notify, notifyTagged, TAG_ERROR } from '@/notify'
import { useSetTag, useTagQueries } from '@/session/tagQueries'

// ?q= is untrusted input: trimmed and capped before use (ADR-0014). The header search writes it.
const searchParamsSchema = z.object({ q: z.string().max(100).catch('').default('') })

/** The Search page. */
export function SearchPage() {
  const [params] = useSearchParams()
  const query = searchParamsSchema.parse(Object.fromEntries(params)).q.trim()
  const { data, isFetching, isError } = useQuery(movieQueries.search(query))
  // Like the header field, only search once there are at least two characters.
  const results = query.length >= 2 ? data?.results : undefined

  return (
    <>
      <title>Search · Deep Cuts</title>
      <PageHeading
        eyebrow={query ? 'Search results' : 'Quick add'}
        title={query ? `Results for “${query}”` : 'Find your next film'}
        lede="Open a film for details, or add it straight to Want to see."
      />
      {/* One status line, announced to screen readers as it changes. */}
      <p role="status" className="mb-3 text-sm text-fg-muted">
        {isError
          ? 'Search is unavailable right now. Try again in a moment.'
          : isFetching
            ? 'Searching…'
            : results
              ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
              : 'Use the search above to find a film.'}
      </p>
      {results && results.length > 0 && (
        <ul className="flex flex-col gap-3">
          {results.map((movie) => (
            <ResultRow key={movie.id} movie={movie} />
          ))}
        </ul>
      )}
      {results?.length === 0 && <EmptyState>No matching films found.</EmptyState>}
    </>
  )
}

// One result: the film's link, plus an "Add to list" toggle for Want to see.
function ResultRow({ movie }: { movie: MovieSummary }) {
  const queries = useTagQueries()
  const tags = useQuery(queries.forMovie(movie.id)).data
  const setTag = useSetTag()
  const wanted = tags?.has('watchlist') ?? false
  const meta = [releaseYear(movie.release_date), primaryGenreName(movie.genre_ids)].filter(Boolean)

  return (
    <li
      style={genreTone(movie.genre_ids)}
      className="grid min-w-0 gap-2.5 rounded-card border-2 border-card-border bg-card-bg p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4 md:p-4"
    >
      <MovieLink movie={movie} meta={meta} disliked={tags?.has('disliked') ?? false} />
      <ToggleButton
        isSelected={wanted}
        onChange={(on) =>
          setTag.mutate(
            { tmdbId: movie.id, tag: 'watchlist', on },
            {
              onSuccess: () => notifyTagged(movie.title, 'Want to see', on),
              onError: () => notify.error(TAG_ERROR),
            },
          )
        }
        aria-label={`Want to see ${movie.title}`}
        className="inline-flex h-11 w-36 shrink-0 items-center justify-center gap-2 justify-self-end rounded-button border-2 border-button-secondary-border bg-button-secondary-bg px-3.5 font-display text-base tracking-widest whitespace-nowrap text-button-secondary-fg case-display hover:border-accent data-selected:border-accent data-selected:bg-accent data-selected:text-fg-on-accent"
      >
        <Icon name={wanted ? 'check' : 'bookmark'} />
        {wanted ? 'Added' : 'Add to list'}
      </ToggleButton>
    </li>
  )
}
