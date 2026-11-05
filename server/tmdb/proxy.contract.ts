// Shared contract suite for the TMDB proxy: the local Vite middleware and the
// Cloudflare Pages Function must both pass it unchanged, so the hosted proxy behaves exactly like
// the one used in development and E2E. Same pattern as src/adapters/*.contract.ts.
import { describe, expect, it, vi } from 'vitest'

/** One proxy answer, as either adapter returns it. */
export type ProxyResult = { status: number; headers: Record<string, string>; body: string }

/** How the suite calls an adapter: one request in, one answer out. */
export type ProxyCaller = (
  url: string,
  opts: { method: string; token: string | undefined; fetchImpl: typeof fetch },
) => Promise<ProxyResult>

/**
 * Registers the suite for one adapter.
 * @param name - Shown in the test names.
 * @param call - Sends one request through the adapter.
 */
export function tmdbProxyContract(name: string, call: ProxyCaller) {
  // Runs one request with a fake TMDB that answers `upstream` (or throws it).
  async function run(
    url: string,
    opts: { token?: string; method?: string; upstream?: Response | Error } = {},
  ) {
    const fetchImpl = vi.fn(async () => {
      if (opts.upstream instanceof Error) throw opts.upstream
      return opts.upstream ?? Response.json({ ok: true })
    })
    const res = await call(url, {
      method: opts.method ?? 'GET',
      token: 'token' in opts ? opts.token : 'secret-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    return { res, fetchImpl }
  }

  describe(`TMDB proxy contract: ${name}`, () => {
    it('injects the bearer token server-side and never echoes it', async () => {
      const { res, fetchImpl } = await run('/api/tmdb/search/movie?query=alien')
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://api.themoviedb.org/3/search/movie?query=alien&include_adult=false',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
        }),
      )
      expect(res.status).toBe(200)
      expect(res.body).not.toContain('secret-token')
      expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
      expect(res.headers['cache-control']).toBe('private, max-age=300')
    })

    it.each([
      ['/api/tmdb/account', 404],
      ['/api/tmdb/search/movie?query=a&api_key=x', 400],
    ])('rejects %s with %i without calling TMDB', async (url, status) => {
      const { res, fetchImpl } = await run(url)
      expect(res.status).toBe(status)
      expect(res.headers['cache-control']).toBe('no-store')
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('rejects non-GET methods', async () => {
      const { res, fetchImpl } = await run('/api/tmdb/genre/movie/list', { method: 'POST' })
      expect(res.status).toBe(405)
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('returns 503 when the token is not configured', async () => {
      const { res } = await run('/api/tmdb/genre/movie/list', { token: undefined })
      expect(res).toMatchObject({ status: 503, body: '{"error":"tmdb_token_missing"}' })
    })

    it('maps upstream failures without leaking details', async () => {
      const { res } = await run('/api/tmdb/movie/1', {
        upstream: new Response('{"status_message":"x"}', { status: 401 }),
      })
      expect(res).toMatchObject({ status: 502, body: '{"error":"upstream_error"}' })
    })

    it('passes an upstream 404 through as a 404', async () => {
      const { res } = await run('/api/tmdb/movie/1', {
        upstream: new Response('{}', { status: 404 }),
      })
      expect(res).toMatchObject({ status: 404, body: '{"error":"upstream_error"}' })
    })

    it('maps network errors and timeouts to 504', async () => {
      const { res } = await run('/api/tmdb/movie/1', { upstream: new Error('timeout') })
      expect(res.status).toBe(504)
    })

    it('trims appended credits to directors, writers and top-billed cast', async () => {
      const { res } = await run('/api/tmdb/movie/1', {
        upstream: Response.json({
          id: 1,
          credits: {
            cast: [{ id: 2, name: 'W', character: 'Lead', profile_path: '/w.jpg', order: 0 }],
            crew: [
              { id: 3, name: 'X', job: 'Director' },
              { id: 4, name: 'Y', job: 'Writer' },
              { id: 5, name: 'Z', job: 'Editor' },
            ],
          },
        }),
      })
      expect(JSON.parse(res.body)).toEqual({
        id: 1,
        credits: {
          crew: [
            { id: 3, name: 'X', job: 'Director' },
            { id: 4, name: 'Y', job: 'Writer' },
          ],
          cast: [{ id: 2, name: 'W' }],
        },
      })
    })
  })
}
