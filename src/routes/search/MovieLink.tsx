// One film as a row in a list: poster, title, year/genre and a short overview. The whole row is the
// link; its title lights up on hover.
import { Link } from 'react-router'
import { imageUrl, type MovieSummary } from '@/api/tmdb'
import { LoadingImage } from '@/components/ui/LoadingImage'

/**
 * Poster + text link for list rows (Search, My Lists). Expects `--tone` from `genreTone()` on a
 * parent, for the colored line under the poster.
 * @param meta - Short facts shown under the title, e.g. `['1982', 'Horror']`.
 * @param disliked - Adds a "Less like this" marker (disliked films stay findable in Search, design E4).
 */
export function MovieLink({
  movie,
  meta,
  disliked = false,
}: {
  movie: Pick<MovieSummary, 'id' | 'title' | 'overview' | 'poster_path'>
  meta: string[]
  disliked?: boolean
}) {
  const poster = imageUrl(movie.poster_path, 'w185')
  return (
    <Link
      to={`/movie/${movie.id}`}
      className="group grid min-h-26 min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-3.5 md:grid-cols-[4.75rem_minmax(0,1fr)] md:gap-4.5"
    >
      {/* The poster is decorative (alt=""): the title right next to it names the link. A film
          without a poster gets an empty placeholder of the same size. */}
      {poster ? (
        <LoadingImage
          src={poster}
          alt=""
          loading="lazy"
          className="h-24 w-16 border-b-3 border-(--tone) object-cover md:h-26 md:w-19"
        />
      ) : (
        <span
          aria-hidden="true"
          className="h-24 w-16 border-b-3 border-(--tone) bg-poster-placeholder-background md:h-26 md:w-19"
        />
      )}
      <span className="flex min-w-0 flex-col gap-1.5">
        <strong className="font-bold wrap-anywhere underline-offset-4 group-hover:text-content-accent group-hover:underline">
          {movie.title}
        </strong>
        <small className="text-sm text-content-muted">
          {meta.join(' · ')}
          {disliked && <span className="ml-2 text-tag-disliked">Less like this</span>}
        </small>
        {movie.overview && (
          <span className="line-clamp-2 text-sm leading-relaxed text-content-soft">
            {movie.overview}
          </span>
        )}
      </span>
    </Link>
  )
}
