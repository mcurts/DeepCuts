// Local TMDB proxy for `vite dev` and `vite preview`. A thin adapter: it turns Node's
// request into a Fetch `Request`, lets the shared core (core.ts) answer it, and writes the
// `Response` back. The same core runs on Cloudflare Pages as a Function, so local and
// hosted behave the same.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin } from 'vite'
import { handleTmdb, TMDB_PREFIX } from './core.ts'

/**
 * The proxy as a Connect middleware.
 * @param token - TMDB's read token, from .env.local (never a VITE_ variable, so never bundled).
 * @param fetchImpl - Tests pass a fake fetch.
 */
export function createTmdbMiddleware(token: string | undefined, fetchImpl: typeof fetch = fetch) {
  return async (req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    if (!req.url?.startsWith(TMDB_PREFIX)) return next()
    // Only the method and URL matter to the proxy (it's GET-only and ignores headers and body),
    // so nothing else is copied across.
    const request = new Request(new URL(req.url, 'http://localhost'), { method: req.method })
    const response = await handleTmdb(request, token, { fetchImpl })
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.end(await response.text())
  }
}

/** The Vite plugin that installs the proxy in both the dev server and `vite preview`. */
export function tmdbProxy(token: string | undefined): Plugin {
  const middleware = createTmdbMiddleware(token)
  return {
    name: 'deep-cuts-tmdb-proxy',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}
