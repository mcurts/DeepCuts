// Calls the accounts API in unit tests the way Cloudflare Pages would (Stage 6 A6): the
// shared `/api` guard first (rate limit, Origin check), then the handler the matching file under
// functions/api/ routes to. A cookie jar makes each client behave like one browser.
//
// ROUTES mirrors functions/api/{auth,tags,top-ten}/**. apiRoutes.test.ts checks that each listed file
// exists, so the two can't drift apart silently.
import { deleteAccount, getSession, rename, signOut } from '../accounts/account.ts'
import {
  authenticateOptions,
  authenticateVerify,
  registerOptions,
  registerVerify,
} from '../accounts/auth.ts'
import type { AccountsEnv } from '../accounts/d1.ts'
import { changeTag, importTags, listTags, reorderWatchlist } from '../accounts/tags.ts'
import { changeTopTen, listTopTen, saveTopTenOrder } from '../accounts/topTen.ts'
import { guardApi } from '../apiGuard.ts'
import { route } from '../http.ts'
import type { RateLimiterBinding } from '../rateLimit.ts'

type Env = AccountsEnv & { RATE_LIMITER?: RateLimiterBinding; CANONICAL_HOST?: string }

/** Path → [the Pages file that serves it, its method handlers]. */
export const ROUTES = {
  '/api/auth/register/options': [
    'functions/api/auth/register/options.ts',
    route<Env>({ POST: ({ request, env }) => registerOptions(request, env) }),
  ],
  '/api/auth/register/verify': [
    'functions/api/auth/register/verify.ts',
    route<Env>({ POST: ({ request, env }) => registerVerify(request, env) }),
  ],
  '/api/auth/authenticate/options': [
    'functions/api/auth/authenticate/options.ts',
    route<Env>({ POST: ({ request, env }) => authenticateOptions(request, env) }),
  ],
  '/api/auth/authenticate/verify': [
    'functions/api/auth/authenticate/verify.ts',
    route<Env>({ POST: ({ request, env }) => authenticateVerify(request, env) }),
  ],
  '/api/auth/session': [
    'functions/api/auth/session.ts',
    route<Env>({ GET: ({ request, env }) => getSession(request, env) }),
  ],
  '/api/auth/sign-out': [
    'functions/api/auth/sign-out.ts',
    route<Env>({ POST: ({ request, env }) => signOut(request, env) }),
  ],
  '/api/auth/me': [
    'functions/api/auth/me.ts',
    route<Env>({
      PATCH: ({ request, env }) => rename(request, env),
      DELETE: ({ request, env }) => deleteAccount(request, env),
    }),
  ],
  '/api/tags': [
    'functions/api/tags/index.ts',
    route<Env>({
      GET: ({ request, env }) => listTags(request, env),
      PUT: ({ request, env }) => changeTag(request, env),
      DELETE: ({ request, env }) => changeTag(request, env),
    }),
  ],
  '/api/tags/order': [
    'functions/api/tags/order.ts',
    route<Env>({ PATCH: ({ request, env }) => reorderWatchlist(request, env) }),
  ],
  '/api/tags/import': [
    'functions/api/tags/import.ts',
    route<Env>({ POST: ({ request, env }) => importTags(request, env) }),
  ],
  '/api/top-ten': [
    'functions/api/top-ten/index.ts',
    route<Env>({
      GET: ({ request, env }) => listTopTen(request, env),
      PUT: ({ request, env }) => changeTopTen(request, env),
      DELETE: ({ request, env }) => changeTopTen(request, env),
      PATCH: ({ request, env }) => saveTopTenOrder(request, env),
    }),
  ],
} as const

/**
 * Where the tests pretend the app is served from: https, like the real site, so the strict
 * `__Host-` cookie is what's tested. Local http gets a relaxed cookie (server/accounts/sessions.ts).
 */
export const ORIGIN = 'https://deep-cuts.test'
/** The `npm run preview:accounts` address, for the local-cookie tests. */
export const LOCAL_ORIGIN = 'http://localhost:8788'

/**
 * One test client: a browser with its own cookies.
 * @param base - The site the requests go to.
 * @param origin - The `Origin` header (null: none); defaults to `base`, as a browser would send.
 */
export function createClient(
  env: Env,
  { base = ORIGIN, origin = base }: { base?: string; origin?: string | null } = {},
) {
  const jar = new Map<string, string>()

  /** Sends one request; returns the status, the parsed body and the raw response. */
  async function call(method: string, path: keyof typeof ROUTES, body?: unknown) {
    const headers: Record<string, string> = { 'CF-Connecting-IP': '203.0.113.9' }
    if (origin) headers.Origin = origin
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    const request = new Request(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const response =
      (await guardApi(request, env.RATE_LIMITER, env.CANONICAL_HOST)) ??
      (await ROUTES[path][1]({ request, env }))
    // Keep (or drop) cookies the way a browser would.
    const set = response.headers.get('Set-Cookie')
    if (set) {
      const [pair, ...attrs] = set.split(';')
      const [name, value] = pair.split('=')
      const gone = attrs.some((a) => a.trim() === 'Max-Age=0')
      if (gone) jar.delete(name)
      else jar.set(name, value)
    }
    const text = await response.text()
    return { status: response.status, body: text ? JSON.parse(text) : null, response }
  }

  return { call, jar }
}
