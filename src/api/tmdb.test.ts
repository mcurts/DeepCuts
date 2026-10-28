// Tests for the TMDB client: responses are validated (bad ones rejected, odd image paths
// dropped), errors carry the status, and the helpers (image URLs, providers, certification,
// discover parameters) behave.
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { movieFixture } from '@/test/msw/fixtures'
import { server } from '@/test/msw/server'
import {
  certification,
  formatRuntime,
  imageUrl,
  movieDetailSchema,
  providersFor,
  releaseYear,
  tmdb,
  TmdbError,
  watchProvidersSchema,
} from './tmdb'
import { providersFixture } from '@/test/msw/fixtures'

describe('tmdb client', () => {
  it('validates and returns search results', async () => {
    const r = await tmdb.search('thing')
    expect(r.results.map((m) => m.title)).toEqual(['The Thing'])
  })

  it('throws TmdbError with the proxy status', async () => {
    await expect(tmdb.movie(999)).rejects.toEqual(new TmdbError(404))
  })

  it('carries the rate limiter’s Retry-After on a 429, and ignores one that makes no sense', async () => {
    const limited = (retryAfter: string) =>
      server.use(
        http.get('/api/tmdb/movie/:id', () =>
          HttpResponse.json(
            { error: 'rate_limited' },
            { status: 429, headers: { 'Retry-After': retryAfter } },
          ),
        ),
      )
    limited('60')
    await expect(tmdb.movie(1)).rejects.toMatchObject({ status: 429, retryAfter: 60 })
    limited('Wed, 21 Oct 2026 07:28:00 GMT')
    await expect(tmdb.movie(1)).rejects.toMatchObject({ status: 429, retryAfter: undefined })
    limited('86400')
    await expect(tmdb.movie(1)).rejects.toMatchObject({ status: 429, retryAfter: undefined })
  })

  it('rejects responses that do not match the schema as an upstream error', async () => {
    server.use(http.get('/api/tmdb/movie/:id', () => HttpResponse.json({ id: 'nope' })))
    await expect(tmdb.movie(1)).rejects.toEqual(new TmdbError(502))
  })

  // Stage 4 H8: when the Function quota runs out, Pages "fails open" and serves index.html.
  it('treats an HTML page with status 200 as an upstream error, not a crash', async () => {
    server.use(
      http.get('/api/tmdb/search/movie', () =>
        HttpResponse.html('<!doctype html><title>Deep Cuts</title>'),
      ),
    )
    await expect(tmdb.search('thing')).rejects.toEqual(new TmdbError(502))
  })

  it('treats a JSON content type with a broken body as an upstream error', async () => {
    server.use(
      http.get(
        '/api/tmdb/movie/:id',
        () => new HttpResponse('{oops', { headers: { 'Content-Type': 'application/json' } }),
      ),
    )
    await expect(tmdb.movie(1)).rejects.toEqual(new TmdbError(502))
  })

  it('drops image paths that are not plain TMDB file names', async () => {
    server.use(
      http.get('/api/tmdb/movie/:id', () =>
        HttpResponse.json({
          id: 1,
          title: 'X',
          poster_path: '//evil.example/x.jpg',
          backdrop_path: '/ok.jpg',
        }),
      ),
    )
    const m = await tmdb.movie(1)
    expect(m.poster_path).toBeNull()
    expect(m.backdrop_path).toBe('/ok.jpg')
  })
})

describe('helpers', () => {
  it('builds CDN image URLs only for present paths', () => {
    expect(imageUrl('/a.jpg', 'w342')).toBe('https://image.tmdb.org/t/p/w342/a.jpg')
    expect(imageUrl(null, 'w342')).toBeNull()
  })

  it.each([
    ['1982-06-25', '1982'],
    ['', ''],
    ['TBA', ''],
  ])('releaseYear(%s) = %s', (d, y) => expect(releaseYear(d)).toBe(y))

  it.each([
    [109, '1h 49m'],
    [45, '45m'],
    [null, ''],
    [0, ''],
  ])('formatRuntime(%s) = %s', (m, s) => expect(formatRuntime(m)).toBe(s))

  it('lists subscription providers first without duplicates', () => {
    const data = watchProvidersSchema.parse(providersFixture)
    expect(providersFor(data, 'US').map((p) => p.provider_name)).toEqual([
      'Disney Plus',
      'Apple TV',
    ])
    expect(providersFor(data, 'GB')).toEqual([])
  })
})

describe('certification', () => {
  it('picks the first non-empty rating for the region', () => {
    const movie = movieDetailSchema.parse(movieFixture)
    expect(certification(movie, 'US')).toBe('R')
    expect(certification(movie, 'FR')).toBe('')
  })

  it('tolerates a malformed release_dates block', () => {
    const movie = movieDetailSchema.parse({ ...movieFixture, release_dates: { results: 'nope' } })
    expect(certification(movie, 'US')).toBe('')
  })
})

describe('discover', () => {
  it('asks the allowlisted endpoint for popular films, with no genre filter (ADR-0032)', async () => {
    let url: URL | undefined
    server.use(
      http.get('/api/tmdb/discover/movie', ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json({ page: 1, total_pages: 1, total_results: 0, results: [] })
      }),
    )
    await tmdb.discover()
    expect(url?.searchParams.get('sort_by')).toBe('popularity.desc')
    expect(url?.searchParams.has('with_genres')).toBe(false)
  })
})

describe('deep cuts (ADR-0042)', () => {
  it('asks for well-rated films with a modest vote count, released over ten years ago', async () => {
    let url: URL | undefined
    server.use(
      http.get('/api/tmdb/discover/movie', ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json({ page: 3, total_pages: 120, total_results: 0, results: [] })
      }),
    )
    await tmdb.deepCuts(3, undefined, new Date('2026-10-15'))
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      'vote_count.gte': '200',
      'vote_count.lte': '3000',
      'vote_average.gte': '7',
      'primary_release_date.lte': '2016-12-31',
      sort_by: 'popularity.desc',
      page: '3',
    })
  })
})

describe('collections (ADR-0032)', () => {
  it('reads a series and its films', async () => {
    const series = await tmdb.collection(9735)
    expect(series.name).toBe('Friday the 13th Collection')
    expect(series.parts.map((p) => p.title)).toContain('Friday the 13th Part 2')
  })

  it('treats a malformed series link on a film as no series', () => {
    const movie = movieDetailSchema.parse({ ...movieFixture, belongs_to_collection: 'nope' })
    expect(movie.belongs_to_collection).toBeNull()
  })
})
