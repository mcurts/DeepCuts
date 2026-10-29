// Small HTTP helpers shared by every server-side handler (the TMDB proxy, the auth and tags APIs),
// written on the Fetch API so they run the same in Vite, Vitest and Cloudflare (ADR-0029).
import type { z } from 'zod'

/**
 * A JSON response. Successful answers may be cached privately by the browser for 5 minutes;
 * errors never are. Pass `Cache-Control` in `extraHeaders` to override (the accounts API sends
 * `no-store` for everything).
 */
export function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'private, max-age=300' : 'no-store',
      ...extraHeaders,
    },
  })
}

/**
 * An error answer with a short code (`invalid_invite`, `verification_failed`…). Never a stack
 * trace or a library's own message, which could reveal internals (ADR-0008).
 */
export const fail = (status: number, error: string) => json(status, { error })

/**
 * Reads a JSON body and validates it with `schema`. Returns the data, or a 400 response to send
 * back as-is. Bodies over 64 kB are refused before parsing (a passkey response is ~1–2 kB; a full
 * tag import is the largest legitimate body).
 */
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 64 * 1024,
): Promise<{ data: T } | { error: Response }> {
  const declared = Number(request.headers.get('Content-Length') ?? 0)
  if (declared > maxBytes) return { error: fail(413, 'too_large') }
  const text = await request.text().catch(() => '')
  if (text.length > maxBytes) return { error: fail(413, 'too_large') }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { error: fail(400, 'bad_request') }
  }
  const parsed = schema.safeParse(raw)
  return parsed.success ? { data: parsed.data } : { error: fail(400, 'bad_request') }
}

/** Methods that only read, so they're exempt from the Origin check (CSRF protection). */
export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Whether a request comes from this site's own pages: its `Origin` header must equal the
 * request's own origin. Browsers always send `Origin` on cross-site and on POST/PATCH/DELETE
 * requests, so a forged form or script on another site fails this check (ADR-0031).
 */
export function isSameOrigin(request: Request): boolean {
  return request.headers.get('Origin') === new URL(request.url).origin
}

/**
 * What a route's handler gets: the request, the bindings, and Pages' per-request `data`, which
 * carries the error reporter from functions/api/_middleware.ts (read it with `reporterFrom`).
 */
export type HandlerContext<Env> = { request: Request; env: Env; data?: Record<string, unknown> }

/** A request handler for one HTTP method. */
export type Handler<Env> = (context: HandlerContext<Env>) => Promise<Response>

/**
 * Builds a Pages `onRequest` from one handler per method. Any other method gets a 405, so a route
 * never falls through to the app's HTML.
 */
export function route<Env>(handlers: Partial<Record<string, Handler<Env>>>) {
  return (context: HandlerContext<Env>): Promise<Response> => {
    const handler = handlers[context.request.method]
    return handler ? handler(context) : Promise.resolve(fail(405, 'method_not_allowed'))
  }
}
