// Fake TMDB endpoints for unit tests (Mock Service Worker), answering with the fixtures.
import { http, HttpResponse } from 'msw'
import {
  candidateDetailFixtures,
  collectionFixture,
  friday13Fixture,
  movieFixture,
  providersFixture,
  searchFixture,
} from './fixtures'

/** One handler per TMDB proxy path the app uses. */
export const handlers = [
  http.get('/api/tmdb/search/movie', ({ request }) => {
    const q = new URL(request.url).searchParams.get('query')?.toLowerCase() ?? ''
    const results = searchFixture.results.filter((m) => m.title.toLowerCase().includes(q))
    return HttpResponse.json({ ...searchFixture, results, total_results: results.length })
  }),
  http.get('/api/tmdb/discover/movie', () => HttpResponse.json(searchFixture)),
  http.get('/api/tmdb/movie/:id/watch/providers', () => HttpResponse.json(providersFixture)),
  // The Thing, Friday the 13th, the films The Thing recommends (for the re-rank), or not found.
  http.get('/api/tmdb/movie/:id', ({ params }) => {
    if (params.id === String(movieFixture.id)) return HttpResponse.json(movieFixture)
    if (params.id === String(friday13Fixture.id)) return HttpResponse.json(friday13Fixture)
    const candidate = candidateDetailFixtures[Number(params.id)]
    return candidate
      ? HttpResponse.json(candidate)
      : HttpResponse.json({ error: 'not_found' }, { status: 404 })
  }),
  // The Friday the 13th series, or not found.
  http.get('/api/tmdb/collection/:id', ({ params }) =>
    params.id === String(collectionFixture.id)
      ? HttpResponse.json(collectionFixture)
      : HttpResponse.json({ error: 'not_found' }, { status: 404 }),
  ),
]
