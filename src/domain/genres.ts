// Film genres: names and color tones for TMDB's genre ids.
//
// TMDB's movie genre ids are stable, so names and tones come from this map instead of an extra
// API call (ADR-0024, zero cost). Each slug has a matching `genre-*` color token (ADR-0023,
// tokens/themes/<theme>/color.json), used as a decorative accent on cards and posters.

/**
 * One genre. `slug` names its color token, `name` is shown in text, and `label` is the short
 * store-style name printed on the VHS genre sticker (e.g. "Sci-Fi").
 */
export interface Genre {
  slug: string
  name: string
  label: string
}

/** Every TMDB movie genre, keyed by its id. */
export const GENRES = {
  28: { slug: 'action', name: 'Action', label: 'Action' },
  12: { slug: 'adventure', name: 'Adventure', label: 'Adventure' },
  16: { slug: 'animation', name: 'Animation', label: 'Animated' },
  35: { slug: 'comedy', name: 'Comedy', label: 'Comedy' },
  80: { slug: 'crime', name: 'Crime', label: 'Crime' },
  99: { slug: 'documentary', name: 'Documentary', label: 'Docu' },
  18: { slug: 'drama', name: 'Drama', label: 'Drama' },
  10751: { slug: 'family', name: 'Family', label: 'Family' },
  14: { slug: 'fantasy', name: 'Fantasy', label: 'Fantasy' },
  36: { slug: 'history', name: 'History', label: 'History' },
  27: { slug: 'horror', name: 'Horror', label: 'Horror' },
  10402: { slug: 'music', name: 'Music', label: 'Music' },
  9648: { slug: 'mystery', name: 'Mystery', label: 'Mystery' },
  10749: { slug: 'romance', name: 'Romance', label: 'Romance' },
  878: { slug: 'science-fiction', name: 'Science Fiction', label: 'Sci-Fi' },
  10770: { slug: 'tv-movie', name: 'TV Movie', label: 'TV Movie' },
  53: { slug: 'thriller', name: 'Thriller', label: 'Thriller' },
  10752: { slug: 'war', name: 'War', label: 'War' },
  37: { slug: 'western', name: 'Western', label: 'Western' },
} as const satisfies Record<number, Genre>

/** A genre id we know about (a key of GENRES). */
export type GenreId = keyof typeof GENRES

// Looks up any number, known or not; unknown ids (TMDB could add one) return undefined.
const lookup = (id: number): Genre | undefined => (GENRES as Record<number, Genre>)[id]

/** The first genre in `ids` that we recognise, or undefined. TMDB lists the main genre first. */
export function primaryGenre(ids: readonly number[]): Genre | undefined {
  return ids.map(lookup).find(Boolean)
}

/** The first known genre's name, or '' when TMDB gives none we recognise. */
export function primaryGenreName(ids: readonly number[]): string {
  for (const id of ids) {
    const g = lookup(id)
    if (g) return g.name
  }
  return ''
}

/**
 * Inline style that sets `--tone` to the first known genre's color, for card accents (design
 * v2). Components then use it as `border-(--tone)`. Films with no known genre get the default
 * genre color (`--color-genre`, from the token `color.genre.default`).
 */
export function genreTone(ids: readonly number[]): Record<string, string> {
  const slug = ids.map(lookup).find(Boolean)?.slug
  return { '--tone': slug ? `var(--color-genre-${slug})` : 'var(--color-genre)' }
}
