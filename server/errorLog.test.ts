// @vitest-environment node
// Tests for the error log (ADR-0058, server/errorLog.ts). The privacy guard is the first test: a
// line built from a request full of personal data must contain none of it.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptLine,
  errorName,
  logServerError,
  resetVersionCache,
  ROUTE_NAMES,
  routeName,
  type ErrorLine,
} from './errorLog'
import { ROUTES } from './testing/api'

let printed: string[]
beforeEach(() => {
  printed = []
  vi.spyOn(console, 'log').mockImplementation((text: string) => void printed.push(text))
  resetVersionCache()
})
afterEach(() => vi.restoreAllMocks())

/** Static assets that serve `/version.json` with the given body. */
const assets = (body: unknown) => ({ fetch: async () => Response.json(body) })

describe('logServerError', () => {
  it('never logs the IP, headers, cookies, query, body or error message', async () => {
    const secrets = [
      '203.0.113.7',
      'dc_session=abc123secret',
      'Bearer tok_SECRET',
      'Mozilla/5.0 private',
      'blade+runner',
      'INVITE22CHARSxxxxxxxxx',
      'sk_live_DO_NOT_LOG',
    ]
    const request = new Request(
      'https://deep-cuts.example/api/tmdb/search/movie?query=blade+runner',
      {
        method: 'POST',
        headers: {
          'CF-Connecting-IP': secrets[0],
          Cookie: secrets[1],
          Authorization: secrets[2],
          'User-Agent': secrets[3],
        },
        body: JSON.stringify({ invite: secrets[5] }),
      },
    )
    const sent: ErrorLine[] = []
    await logServerError({
      request,
      response: Response.json({ error: 'upstream_error' }, { status: 502 }),
      note: { cause: 'tmdb_upstream', upstreamStatus: 401, error: new Error(secrets[6]) },
      binding: { report: async (line) => void sent.push(line) },
      assets: assets({ version: '1.9.0' }),
    })
    const everything = printed.join('\n') + JSON.stringify(sent)
    for (const secret of secrets) expect(everything).not.toContain(secret)
    expect(sent).toEqual([
      {
        event: 'server_error',
        v: 1,
        route: '/api/tmdb/*',
        method: 'POST',
        status: 502,
        code: 'upstream_error',
        cause: 'tmdb_upstream',
        errorName: 'Error',
        upstreamStatus: 401,
        version: '1.9.0',
      },
    ])
    // The console line is the same line, for the real-time tail.
    expect(printed).toEqual([JSON.stringify(sent[0])])
  })

  it('stamps "unknown" when the version file is missing or malformed', async () => {
    const sent: ErrorLine[] = []
    const binding = { report: async (line: ErrorLine) => void sent.push(line) }
    // A fresh request and answer each time: a body can only be read once.
    const failed = () => ({
      request: new Request('https://deep-cuts.example/api/tags'),
      response: Response.json({ error: 'x' }, { status: 500 }),
      binding,
    })
    await logServerError({ ...failed(), assets: assets({ version: '<script>' }) })
    resetVersionCache()
    await logServerError(failed())
    expect(sent.map((l) => l.version)).toEqual(['unknown', 'unknown'])
  })

  it('reads the version once, then reuses it', async () => {
    const fetch = vi.fn(async () => Response.json({ version: '2.0.0' }))
    const request = new Request('https://deep-cuts.example/api/tags')
    for (let i = 0; i < 3; i++)
      await logServerError({
        request,
        response: Response.json({}, { status: 500 }),
        assets: { fetch },
      })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('drops a code that is not a short code, and never throws', async () => {
    const sent: ErrorLine[] = []
    await logServerError({
      request: new Request('https://deep-cuts.example/api/tags', { method: 'PROPFIND' }),
      response: new Response('<html>Bad gateway</html>', { status: 502 }),
      binding: { report: async (line) => void sent.push(line) },
    })
    expect(sent[0]).toMatchObject({ code: null, method: 'OTHER', cause: 'status_5xx' })
    await expect(
      logServerError({
        request: new Request('https://deep-cuts.example/api/tags'),
        response: Response.json({}, { status: 500 }),
        binding: { report: () => Promise.reject(new Error('down')) },
      }),
    ).resolves.toBeUndefined()
  })
})

describe('routeName', () => {
  it('knows every route the API serves', () => {
    for (const path of Object.keys(ROUTES)) expect(routeName(path)).toBe(path)
  })

  it('names every Function file under functions/api', () => {
    // Walks functions/api for route files (not middleware or the catch-all) and turns each path
    // into its URL, so a new route without a name here fails this test.
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const full = join(dir, f)
        return statSync(full).isDirectory() ? walk(full) : [full]
      })
    const urls = walk('functions/api')
      // Middleware isn't a route, and the /api catch-all is what /api/other names.
      .filter((f) => !f.endsWith('_middleware.ts') && f !== join('functions', 'api', '[[path]].ts'))
      .map((f) =>
        f
          .replace(/^functions/, '')
          .replace(/\/index\.ts$|\.ts$/, '')
          .replace('[[path]]', '*'),
      )
    for (const url of urls) expect(ROUTE_NAMES).toContain(url)
  })

  it('collapses TMDB paths, so film ids and searches never reach the log', () => {
    expect(routeName('/api/tmdb/search/movie')).toBe('/api/tmdb/*')
    expect(routeName('/api/tmdb/movie/603')).toBe('/api/tmdb/*')
  })

  it('names anything else /api/other', () => {
    expect(routeName('/api/nope')).toBe('/api/other')
    expect(routeName('/api/tags/../../etc')).toBe('/api/other')
    expect(routeName('/api/tags/')).toBe('/api/tags')
  })
})

describe('errorName', () => {
  it('keeps only a class name', () => {
    expect(errorName(new TypeError('x'))).toBe('TypeError')
    expect(errorName(Object.assign(new Error('x'), { name: 'Bad name with spaces' }))).toBeNull()
    expect(errorName('a thrown string')).toBeNull()
    expect(errorName(undefined)).toBeNull()
  })
})

describe('acceptLine (the log Worker)', () => {
  const line: ErrorLine = {
    event: 'server_error',
    v: 1,
    route: '/api/tags',
    method: 'GET',
    status: 500,
    code: 'server_error',
    cause: 'uncaught',
    errorName: null,
    upstreamStatus: null,
    version: 'dev',
  }

  it('writes a valid line as JSON', () => {
    expect(acceptLine(line)).toBe(JSON.stringify(line))
  })

  it('refuses extra fields, oversized values and anything else', () => {
    expect(acceptLine({ ...line, ip: '203.0.113.7' })).toBeNull()
    expect(acceptLine({ ...line, code: 'x'.repeat(41) })).toBeNull()
    expect(acceptLine({ ...line, route: '/api/tmdb/search/movie?query=x' })).toBeNull()
    expect(acceptLine('a string')).toBeNull()
  })
})
