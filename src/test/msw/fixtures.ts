// Small, hand-written TMDB fixtures. Tests and Storybook never call the real API.
export const searchFixture = {
  page: 1,
  total_pages: 1,
  total_results: 2,
  results: [
    {
      id: 1091,
      title: 'The Thing',
      release_date: '1982-06-25',
      overview: 'Researchers in Antarctica discover a shape-shifting alien.',
      poster_path: '/tzGY49kseSE9QAKk47uuDGwnSCu.jpg',
      backdrop_path: '/aYRmsBEyVLAXyAy5tK2qIy0sD1B.jpg',
      genre_ids: [27, 9648, 878],
    },
    {
      id: 348,
      title: 'Alien',
      release_date: '1979-05-25',
      overview: 'The crew of a commercial spacecraft encounters a deadly lifeform.',
      poster_path: null,
      backdrop_path: null,
      genre_ids: [27, 878],
    },
  ],
}

export const movieFixture = {
  id: 1091,
  title: 'The Thing',
  tagline: 'Man is the warmest place to hide.',
  release_date: '1982-06-25',
  runtime: 109,
  overview:
    'Researchers in Antarctica discover a shape-shifting alien that assumes the appearance of the people it kills.',
  poster_path: '/tzGY49kseSE9QAKk47uuDGwnSCu.jpg',
  backdrop_path: '/aYRmsBEyVLAXyAy5tK2qIy0sD1B.jpg',
  genres: [
    { id: 27, name: 'Horror' },
    { id: 878, name: 'Science Fiction' },
  ],
  popularity: 25.3,
  vote_average: 8.1,
  vote_count: 7200,
  original_language: 'en',
  // Appended recommendations: the scorer's candidates.
  recommendations: {
    results: [
      {
        id: 348,
        title: 'Alien',
        release_date: '1979-05-25',
        overview: 'The crew of a commercial spacecraft encounters a deadly lifeform.',
        poster_path: null,
        backdrop_path: null,
        genre_ids: [27, 878],
        popularity: 40.2,
        vote_average: 8.2,
        vote_count: 15000,
        original_language: 'en',
      },
      {
        id: 790,
        title: 'The Fog',
        release_date: '1980-02-08',
        overview: 'A strange fog rolls into a coastal town on its centennial.',
        poster_path: null,
        backdrop_path: null,
        genre_ids: [27],
        popularity: 9.1,
        vote_average: 6.6,
        vote_count: 1500,
        original_language: 'en',
      },
      {
        id: 948,
        title: 'Halloween',
        release_date: '1978-10-25',
        overview: 'Fifteen years after a murder, a killer escapes and returns home.',
        poster_path: null,
        backdrop_path: null,
        genre_ids: [27, 53],
        popularity: 30.5,
        vote_average: 7.5,
        vote_count: 6000,
        original_language: 'en',
      },
    ],
  },
  // Keywords and credits as the proxy returns them (credits trimmed to directors).
  keywords: {
    keywords: [
      { id: 1599, name: 'antarctica' },
      { id: 9715, name: 'paranoia' },
      { id: 162846, name: 'shapeshifter' },
    ],
  },
  credits: {
    crew: [
      { id: 11770, name: 'John Carpenter', job: 'Director' },
      { id: 3, name: 'Bill Lancaster', job: 'Screenplay' },
    ],
  },
  release_dates: {
    results: [
      { iso_3166_1: 'GB', release_dates: [{ certification: '18' }] },
      { iso_3166_1: 'US', release_dates: [{ certification: '' }, { certification: 'R' }] },
    ],
  },
}

// Writers for the same films (Halloween's two writers share one credit line).
const WRITERS: Record<number, { id: number; name: string; job: string }[]> = {
  348: [{ id: 8, name: 'Dan O’Bannon', job: 'Screenplay' }],
  948: [
    { id: 11770, name: 'John Carpenter', job: 'Writer' },
    { id: 9, name: 'Debra Hill', job: 'Writer' },
  ],
}
// Details for the films The Thing recommends, so the scorer's re-rank has keywords
// and directors to work with: The Fog and Halloween share John Carpenter with The Thing; Alien
// doesn't. Two Carpenter films put the director reason on a grid tile as well as the feature.
const DIRECTORS: Record<number, { id: number; name: string; job: string }> = {
  790: { id: 11770, name: 'John Carpenter', job: 'Director' },
  948: { id: 11770, name: 'John Carpenter', job: 'Director' },
  348: { id: 578, name: 'Ridley Scott', job: 'Director' },
}
export const candidateDetailFixtures = Object.fromEntries(
  movieFixture.recommendations.results.map((m) => [
    m.id,
    {
      ...m,
      genres: m.genre_ids.map((id) => ({ id, name: '' })),
      keywords: { keywords: [{ id: 9715, name: 'paranoia' }] },
      credits: { crew: [...(DIRECTORS[m.id] ? [DIRECTORS[m.id]] : []), ...(WRITERS[m.id] ?? [])] },
    },
  ]),
)

// A liked film in a series, and the series itself: liking Friday the 13th brings in its
// released sequels as candidates. TMDB recommends nothing for it here, so any pick must come from
// the series. The undated entry is an announced film and must stay out.
const f13Summary = (id: number, title: string, release_date: string) => ({
  id,
  title,
  release_date,
  overview: '',
  poster_path: null,
  backdrop_path: null,
  genre_ids: [27],
  popularity: 12,
  vote_average: 6,
  vote_count: 1500,
  original_language: 'en',
})
export const friday13Fixture = {
  ...f13Summary(4488, 'Friday the 13th', '1980-05-09'),
  genres: [{ id: 27, name: 'Horror' }],
  belongs_to_collection: { id: 9735, name: 'Friday the 13th Collection' },
  recommendations: { results: [] },
}
export const collectionFixture = {
  id: 9735,
  name: 'Friday the 13th Collection',
  parts: [
    f13Summary(4488, 'Friday the 13th', '1980-05-09'),
    f13Summary(9725, 'Friday the 13th Part 2', '1981-04-30'),
    f13Summary(9728, 'Friday the 13th Part III', '1982-08-13'),
    f13Summary(999001, 'Friday the 13th: Announced', ''),
  ],
}

export const providersFixture = {
  results: {
    US: {
      flatrate: [
        {
          provider_id: 337,
          provider_name: 'Disney Plus',
          logo_path: '/97yvRBw1GzX7fXprcF80er19ot.jpg',
        },
      ],
      rent: [
        {
          provider_id: 2,
          provider_name: 'Apple TV',
          logo_path: '/9ghgSC0MA082EL6HLCW3GalykFD.jpg',
        },
        {
          provider_id: 337,
          provider_name: 'Disney Plus',
          logo_path: '/97yvRBw1GzX7fXprcF80er19ot.jpg',
        },
      ],
    },
  },
}
