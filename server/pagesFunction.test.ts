// @vitest-environment node
// Tests for the Cloudflare Pages Functions glue (ADR-0029, ADR-0031): the TMDB proxy Function
// passes the same contract as the local proxy; the `/api` middleware rate-limits and checks the
// Origin and writes the error log (ADR-0058); the catch-all answers a JSON 404; the root
// middleware adds the security headers.
// The Workers globals it uses (`caches.default`, `fetch`) are replaced with fakes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onRequest as apiCatchAll } from '../functions/api/[[path]]'
import { onRequest, type Env } from '../functions/api/tmdb/[[path]]'
import { onRequest as middleware } from '../functions/_middleware'
import { onRequest as apiMiddleware, type ApiEnv } from '../functions/api/_middleware'
import { reporterFrom, type ErrorLine, type ErrorNote } from './errorLog'
import { productionHeaders } from './securityHeaders'
import { tmdbProxyContract } from './tmdb/proxy.contract'

// A cache that never hits, so the contract sees the uncached behavior.
const emptyCache = { match: async () => undefined, put: async () => undefined }

beforeEach(() => vi.stubGlobal('caches', { default: emptyCache }))
afterEach(() => vi.unstubAllGlobals())

// Calls the Function the way Pages does, with only the context fields it reads.
async function viaFunction(url: string, method: string, env: Env, fetchImpl?: typeof fetch) {
  if (fetchImpl) vi.stubGlobal('fetch', fetchImpl)
  const request = new Request(new URL(url, 'https://deep-cuts.pages.dev'), {
    method,
    headers: { 'CF-Connecting-IP': '203.0.113.7' },
  })
  const response = await onRequest({ request, env } as unknown as Parameters<typeof onRequest>[0])
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  }
}

tmdbProxyContract('Pages Function', (url, { method, token, fetchImpl }) =>
  viaFunction(url, method, { TMDB_READ_TOKEN: token }, fetchImpl),
)

// A stand-in for the live site's address, which stays out of this public repo (ADR-0047).
const site = 'deep-cuts.example'

describe('/api middleware: rate limit (Stage 4 H4)', () => {
  // Runs the API middleware with `next` standing in for the route, on the site's own address.
  async function viaApiMiddleware(request: Request, env: ApiEnv) {
    const next = vi.fn(async () => Response.json({ ok: true }))
    const withSite = { CANONICAL_HOST: site, ...env }
    const res = await apiMiddleware({
      request,
      env: withSite,
      next,
      data: {},
      waitUntil: () => {},
    } as unknown as Parameters<typeof apiMiddleware>[0])
    return { res, next }
  }
  const get = (path: string) =>
    new Request(`https://${site}${path}`, {
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    })

  it('refuses a client over the limit with 429 before the route runs', async () => {
    const check = vi.fn(async () => ({ allowed: false }))
    const { res, next } = await viaApiMiddleware(get('/api/tmdb/genre/movie/list'), {
      RATE_LIMITER: { check },
    })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'rate_limited' })
    expect(res.headers.get('retry-after')).toBe('60')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(check).toHaveBeenCalledWith('203.0.113.7', 'api')
    expect(next).not.toHaveBeenCalled()
  })

  it('lets a client within the limit through', async () => {
    const { res } = await viaApiMiddleware(get('/api/tmdb/genre/movie/list'), {
      RATE_LIMITER: { check: async () => ({ allowed: true }) },
    })
    expect(res.status).toBe(200)
  })

  it('fails open when the limiter itself fails', async () => {
    const { res } = await viaApiMiddleware(get('/api/tmdb/genre/movie/list'), {
      RATE_LIMITER: {
        check: async () => {
          throw new Error('limiter down')
        },
      },
    })
    expect(res.status).toBe(200)
  })

  it('refuses a data-changing request from another origin', async () => {
    const request = new Request(`https://${site}/api/tags/import`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    })
    const { res, next } = await viaApiMiddleware(request, {})
    expect(res.status).toBe(403)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('/api middleware: host pin', () => {
  async function viaApiMiddleware(url: string, env: ApiEnv) {
    const next = vi.fn(async () => Response.json({ ok: true }))
    const request = new Request(url, { headers: { 'CF-Connecting-IP': '203.0.113.7' } })
    const res = await apiMiddleware({
      request,
      env,
      next,
      data: {},
      waitUntil: () => {},
    } as unknown as Parameters<typeof apiMiddleware>[0])
    return { res, next }
  }

  it('answers on the site address', async () => {
    const { res } = await viaApiMiddleware(`https://${site}/api/tags`, { CANONICAL_HOST: site })
    expect(res.status).toBe(200)
  })

  it.each([
    'https://deep-cuts.pages.dev/api/tags',
    'https://3f2a9c1b.deep-cuts.pages.dev/api/auth/session',
    'https://3f2a9c1b.deep-cuts.pages.dev/api/tmdb/genre/movie/list',
    `https://${site}.evil.example/api/tags`,
  ])('refuses %s with 421 before the rate limiter or the route', async (url) => {
    const check = vi.fn(async () => ({ allowed: true }))
    const { res, next } = await viaApiMiddleware(url, {
      CANONICAL_HOST: site,
      RATE_LIMITER: { check },
    })
    expect(res.status).toBe(421)
    expect(await res.json()).toEqual({ error: 'wrong_host' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(check).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it.each(['http://localhost:8788', 'http://127.0.0.1:8788', 'http://[::1]:8788'])(
    'allows %s, where wrangler pages dev runs with the production config',
    async (origin) => {
      const { res } = await viaApiMiddleware(`${origin}/api/tags`, { CANONICAL_HOST: site })
      expect(res.status).toBe(200)
    },
  )

  it('refuses everything when no site address is configured (fails closed, ADR-0047)', async () => {
    const check = vi.fn(async () => ({ allowed: true }))
    const { res, next } = await viaApiMiddleware(`https://${site}/api/tags`, {
      RATE_LIMITER: { check },
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'host_not_configured' })
    expect(check).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })
})

describe('/api middleware: error log (ADR-0058)', () => {
  /**
   * Runs the middleware with `route` standing in for the Function behind it, waits for whatever
   * it handed to `waitUntil`, and returns the answer plus the lines the log Worker received.
   */
  async function run(
    route: (context: { data: Record<string, unknown> }) => Promise<Response>,
    { method = 'GET', path = '/api/tags', env = {} as ApiEnv } = {},
  ) {
    const lines: ErrorLine[] = []
    const pending: Promise<unknown>[] = []
    const data: Record<string, unknown> = {}
    const request = new Request(`https://${site}${path}`, {
      method,
      headers: { 'CF-Connecting-IP': '203.0.113.7', Origin: `https://${site}` },
    })
    const res = await apiMiddleware({
      request,
      env: {
        CANONICAL_HOST: site,
        ERROR_LOG: { report: async (line: ErrorLine) => void lines.push(line) },
        ...env,
      },
      next: () => route({ data }),
      data,
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    } as unknown as Parameters<typeof apiMiddleware>[0])
    await Promise.all(pending)
    return { res, lines }
  }

  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}))
  afterEach(() => vi.restoreAllMocks())

  it('answers an uncaught throw with 500 server_error and logs it', async () => {
    const { res, lines } = await run(async () => {
      throw new TypeError('secret detail from user input')
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'server_error' })
    expect(lines).toEqual([
      expect.objectContaining({
        route: '/api/tags',
        status: 500,
        code: 'server_error',
        cause: 'uncaught',
        errorName: 'TypeError',
      }),
    ])
    expect(JSON.stringify(lines)).not.toContain('secret detail')
  })

  it('logs a 5xx answer no handler explained', async () => {
    const { lines } = await run(async () => Response.json({ error: 'boom' }, { status: 503 }))
    expect(lines).toEqual([
      expect.objectContaining({ status: 503, code: 'boom', cause: 'status_5xx' }),
    ])
  })

  it.each([400, 401, 403, 404, 409, 413])('logs nothing for an ordinary %i', async (status) => {
    const { res, lines } = await run(async () => Response.json({ error: 'x' }, { status }))
    expect(res.status).toBe(status)
    expect(lines).toEqual([])
  })

  it('logs nothing for refusals made by the guard itself (421, 429)', async () => {
    const wrongHost = await run(async () => Response.json({}), {
      env: { CANONICAL_HOST: 'elsewhere.example' },
    })
    const limited = await run(async () => Response.json({}), {
      env: { RATE_LIMITER: { check: async () => ({ allowed: false }) } },
    })
    expect([wrongHost.res.status, limited.res.status]).toEqual([421, 429])
    expect([...wrongHost.lines, ...limited.lines]).toEqual([])
  })

  it('logs a note a handler left, even on a 4xx answer', async () => {
    const note: ErrorNote = { cause: 'signup_batch_failed', error: new Error('D1 down') }
    const { lines } = await run(
      async ({ data }) => {
        reporterFrom(data)(note)
        return Response.json({ error: 'invalid_invite' }, { status: 400 })
      },
      { method: 'POST', path: '/api/auth/register/verify' },
    )
    expect(lines).toEqual([
      expect.objectContaining({
        route: '/api/auth/register/verify',
        method: 'POST',
        status: 400,
        code: 'invalid_invite',
        cause: 'signup_batch_failed',
        errorName: 'Error',
      }),
    ])
  })

  it('logs a failing rate limiter but still lets the request through', async () => {
    const { res, lines } = await run(async () => Response.json({ ok: true }), {
      env: {
        RATE_LIMITER: {
          check: async () => {
            throw new Error('limiter down')
          },
        },
      },
    })
    expect(res.status).toBe(200)
    expect(lines).toEqual([
      expect.objectContaining({ status: 200, code: null, cause: 'rate_limiter_unavailable' }),
    ])
  })

  it('answers normally when the log Worker is missing or failing', async () => {
    const failing = await run(async () => Response.json({ error: 'x' }, { status: 500 }), {
      env: { ERROR_LOG: { report: async () => Promise.reject(new Error('down')) } },
    })
    const missing = await run(async () => Response.json({ error: 'x' }, { status: 500 }), {
      env: { ERROR_LOG: undefined },
    })
    expect([failing.res.status, missing.res.status]).toEqual([500, 500])
  })
})

describe('API catch-all', () => {
  it('answers unknown API paths with a JSON 404, not the app page', async () => {
    const request = new Request('https://deep-cuts.pages.dev/api/nope')
    const res = await apiCatchAll({ request, env: {} } as unknown as Parameters<
      typeof apiCatchAll
    >[0])
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })
})

describe('Functions middleware (Stage 4 H6)', () => {
  it('adds every production security header to Function answers', async () => {
    const next = async () => Response.json({ ok: true })
    const res = await middleware({ next } as unknown as Parameters<typeof middleware>[0])
    for (const [name, value] of Object.entries(productionHeaders))
      expect(res.headers.get(name)).toBe(value)
    expect(await res.json()).toEqual({ ok: true })
  })
})
