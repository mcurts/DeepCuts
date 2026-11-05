// @vitest-environment node
// Tests for the proxy allowlist: which TMDB paths and query parameters may pass, and that
// everything else is refused.
import { describe, expect, it } from 'vitest'
import { resolveTmdbRequest } from './allowlist'

const q = (s = '') => new URLSearchParams(s)

describe('resolveTmdbRequest', () => {
  it('allows search with a query and forces include_adult=false', () => {
    const r = resolveTmdbRequest('search/movie', q('query=alien&page=2'))
    expect(r).toEqual({
      ok: true,
      request: { path: 'search/movie', params: expect.any(URLSearchParams) },
    })
    if (r.ok) expect(r.request.params.toString()).toBe('query=alien&page=2&include_adult=false')
  })

  it('cannot be tricked into include_adult=true', () => {
    expect(resolveTmdbRequest('search/movie', q('query=a&include_adult=true'))).toEqual({
      ok: false,
      status: 400,
    })
  })

  it.each([
    ['search/movie', ''],
    ['search/movie', 'query='],
    ['search/movie', `query=${'x'.repeat(101)}`],
    ['search/movie', 'query=a&page=0'],
    ['search/movie', 'query=a&page=501'],
    ['search/movie', 'query=a&query=b'],
    ['search/movie', 'query=a&api_key=leak'],
    // Genre filters were removed with favourite genres.
    ['discover/movie', 'with_genres=27'],
    ['discover/movie', 'without_genres=27'],
    // One keyword id only: no lists, no names, no negatives.
    ['discover/movie', 'with_keywords=12339|9715'],
    ['discover/movie', 'with_keywords=12339,9715'],
    ['discover/movie', 'with_keywords=slasher'],
    ['discover/movie', 'with_keywords=-1'],
    ['collection/9735', 'page=1'],
    ['discover/movie', 'sort_by=revenue.desc'],
    // The starter shelf's bounds: counts, ratings and real dates only.
    ['discover/movie', 'vote_count.lte=-1'],
    ['discover/movie', 'vote_count.lte=100001'],
    ['discover/movie', 'vote_average.gte=11'],
    ['discover/movie', 'vote_average.gte=seven'],
    ['discover/movie', 'primary_release_date.lte=2015-02-31'],
    ['discover/movie', 'primary_release_date.lte=2015'],
    ['discover/movie', 'primary_release_date.lte=1800-01-01'],
    ['discover/movie', 'primary_release_date.gte=2015-12-31'],
    ['movie/603', 'append_to_response=videos'],
    ['movie/603', 'append_to_response=release_dates,images'],
    ['movie/603', 'append_to_response=recommendations,recommendations'],
    ['movie/603', 'append_to_response='],
  ])('rejects bad params: %s?%s', (path, query) => {
    expect(resolveTmdbRequest(path, q(query))).toEqual({ ok: false, status: 400 })
  })

  it.each([
    'account',
    'movie/abc',
    'movie/603/credits',
    'collection/abc',
    'collection/9735/images',
    'movie/603/../../account',
    '../3/account',
    'search/person',
    'tv/1',
    '',
  ])('rejects endpoints outside the allowlist: %s', (path) => {
    expect(resolveTmdbRequest(path, q())).toEqual({ ok: false, status: 404 })
  })

  it.each([
    ['movie/603', 'movie/603'],
    ['movie/603/watch/providers', 'movie/603/watch/providers'],
    ['genre/movie/list', 'genre/movie/list'],
    ['collection/9735', 'collection/9735'],
  ])('allows %s', (path, expected) => {
    const r = resolveTmdbRequest(path, q())
    expect(r.ok && r.request.path).toBe(expected)
  })

  it('allows discover with sort', () => {
    const r = resolveTmdbRequest('discover/movie', q('sort_by=vote_average.desc&vote_count.gte=50'))
    expect(r.ok && r.request.params.get('include_adult')).toBe('false')
  })

  it('allows discover by one keyword', () => {
    const r = resolveTmdbRequest(
      'discover/movie',
      q('with_keywords=12339&sort_by=vote_average.desc&vote_count.gte=100'),
    )
    expect(r.ok && r.request.params.get('with_keywords')).toBe('12339')
  })

  it('allows the deep-cuts starter query', () => {
    const r = resolveTmdbRequest(
      'discover/movie',
      q(
        'vote_count.gte=200&vote_count.lte=3000&vote_average.gte=7' +
          '&primary_release_date.lte=2016-12-31&sort_by=popularity.desc&page=4',
      ),
    )
    expect(r.ok && Object.fromEntries(r.request.params)).toEqual({
      'vote_count.gte': '200',
      'vote_count.lte': '3000',
      'vote_average.gte': '7',
      'primary_release_date.lte': '2016-12-31',
      sort_by: 'popularity.desc',
      page: '4',
      include_adult: 'false',
    })
  })

  it('rejects ids beyond the allowed range', () => {
    expect(resolveTmdbRequest('movie/999999999', q())).toEqual({ ok: false, status: 400 })
  })
})

describe('movie detail extras', () => {
  it.each([
    'release_dates',
    'recommendations',
    'release_dates,recommendations',
    'release_dates,recommendations,keywords,credits',
    'release_dates,recommendations,similar,keywords,credits',
  ])('allows appending %s', (value) => {
    const r = resolveTmdbRequest('movie/603', new URLSearchParams(`append_to_response=${value}`))
    expect(r.ok && r.request.params.get('append_to_response')).toBe(value)
  })
})
