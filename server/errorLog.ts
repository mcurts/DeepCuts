// The production error log (ADR-0058): one safe line per `/api` request that failed on the server's
// side, so a broken deploy, a revoked TMDB token or a failing D1 batch shows up before a user
// reports it.
//
// Only functions/api/_middleware.ts writes a line, after the route has answered. A handler that
// knows *why* something failed (a sign-up batch, TMDB, the rate limiter) leaves a note through
// `ReportError`; the middleware adds what the client got and writes it out. So a request makes at
// most one line, and nothing else in server/, functions/ or workers/ may log at all (`no-console`).
//
// Pages Functions can't keep logs (no Workers Logs on Pages), so the line goes two ways: to the
// console, which the real-time tail shows, and over the ERROR_LOG service binding to
// workers/error-log/, a Worker with Workers Logs on, which keeps it for days.
//
// The line is built only from the typed fields below. Never the IP or any header, cookies,
// session or invite tokens, user ids or names, bodies, URLs or query strings, or an error's message
// or stack (which can echo input). The strict schema means a new field is a reviewed change.
import { z } from 'zod'

/**
 * Every `/api` route, by name. A line names one of these, never the raw path: TMDB paths hold
 * film ids and search terms. Kept in step with functions/api/ (errorLog.test.ts checks).
 */
export const ROUTE_NAMES = [
  '/api/auth/authenticate/options',
  '/api/auth/authenticate/verify',
  '/api/auth/me',
  '/api/auth/register/options',
  '/api/auth/register/verify',
  '/api/auth/session',
  '/api/auth/sign-out',
  '/api/tags',
  '/api/tags/import',
  '/api/tags/order',
  '/api/top-ten',
  '/api/tmdb/*',
  '/api/other',
] as const

/** Why a request failed, as a fixed tag chosen where it happened. */
export const CAUSES = [
  // Something threw that no handler caught; the middleware answered 500 server_error.
  'uncaught',
  // A 5xx answer that no handler explained (e.g. host_not_configured).
  'status_5xx',
  // The D1 batch that creates an account failed (also how a lost race for one invite ends).
  'signup_batch_failed',
  // TMDB answered an error other than 404 (the client gets 502 upstream_error).
  'tmdb_upstream',
  // TMDB timed out or its answer couldn't be read (the client gets 504 upstream_timeout).
  'tmdb_timeout',
  // The TMDB_READ_TOKEN secret is missing (the client gets 503 tmdb_token_missing).
  'tmdb_token_missing',
  // The rate-limit Worker failed, so the request was let through unchecked (fail open).
  'rate_limiter_unavailable',
] as const

/** One cause from {@link CAUSES}. */
export type Cause = (typeof CAUSES)[number]

/** An HTTP status code. */
const status = z.number().int().min(100).max(599)

/** The log line. `.strict()`: an unknown field is refused, not passed through. */
export const errorLineSchema = z
  .object({
    /** Fixed, so the logs can be filtered to these lines. */
    event: z.literal('server_error'),
    /** The line format's version. */
    v: z.literal(1),
    route: z.enum(ROUTE_NAMES),
    method: z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'OTHER']),
    /** What the client got. */
    status,
    /** The short error code the client got (ADR-0008), or null when the answer had none. */
    code: z
      .string()
      .regex(/^[a-z_]{1,40}$/)
      .nullable(),
    cause: z.enum(CAUSES),
    /** The error's class name only (`TypeError`), never its message. */
    errorName: z
      .string()
      .regex(/^\w{1,40}$/)
      .nullable(),
    /** TMDB's status, when it answered (a 401 means the token was revoked). */
    upstreamStatus: status.nullable(),
    /** The deployed version (ADR-0049), `dev` for local builds, or `unknown`. */
    version: z.string().regex(/^(\d{1,4}\.\d{1,4}\.\d{1,4}|dev|unknown)$/),
  })
  .strict()

/** A validated log line. */
export type ErrorLine = z.infer<typeof errorLineSchema>

/** What a handler knows about a failure: its cause, and the error or TMDB status if there is one. */
export type ErrorNote = { cause: Cause; error?: unknown; upstreamStatus?: number }

/** Leaves a note for the middleware's log line. Calling it again replaces the earlier note. */
export type ReportError = (note: ErrorNote) => void

/** A `ReportError` that does nothing: for local runs and tests that don't check logging. */
export const ignoreErrors: ReportError = () => {}

/** Where the middleware keeps the reporter in Pages' per-request `data`. */
const DATA_KEY = 'reportError'

/**
 * The reporter for this request, from the Pages context's `data` (the middleware put it there),
 * or {@link ignoreErrors} when there is none (local runs, unit tests).
 */
export function reporterFrom(data: unknown): ReportError {
  const found = (data as Record<string, unknown> | undefined)?.[DATA_KEY]
  return typeof found === 'function' ? (found as ReportError) : ignoreErrors
}

/** Puts a reporter into Pages' per-request `data`, for {@link reporterFrom}. */
export function attachReporter(data: Record<string, unknown>, report: ReportError): void {
  data[DATA_KEY] = report
}

/** The fixed route name for a path (see {@link ROUTE_NAMES}). Anything unknown is `/api/other`. */
export function routeName(pathname: string): ErrorLine['route'] {
  if (pathname.startsWith('/api/tmdb/')) return '/api/tmdb/*'
  const trimmed = pathname.replace(/\/+$/, '')
  return (ROUTE_NAMES as readonly string[]).includes(trimmed)
    ? (trimmed as ErrorLine['route'])
    : '/api/other'
}

/**
 * An error's class name, if it looks like one (`TypeError`, `TimeoutError`). Anything else,
 * including a thrown string, is `null`: the message is never used.
 */
export function errorName(error: unknown): string | null {
  const name = error instanceof Error ? error.name : null
  return name && /^\w{1,40}$/.test(name) ? name : null
}

/** The log Worker as the Function sees it through the ERROR_LOG service binding. */
export type ErrorLogBinding = { report(line: ErrorLine): Promise<void> }

/** Reads files from this deploy's static assets (Pages' `env.ASSETS`). */
export type AssetsBinding = { fetch(input: Request | string | URL): Promise<Response> }

// The deployed version, read once per isolate from dist/version.json (written by the build).
let versionPromise: Promise<string> | undefined

/** Forgets the cached version (tests only). */
export function resetVersionCache(): void {
  versionPromise = undefined
}

/**
 * This deploy's version, from `/version.json` in its own static assets. Read only on the error
 * path and cached, so normal requests never pay for it. Any failure gives `unknown`.
 */
function deployedVersion(assets: AssetsBinding | undefined, requestUrl: string): Promise<string> {
  versionPromise ??= (async () => {
    if (!assets) return 'unknown'
    const res = await assets.fetch(new URL('/version.json', requestUrl))
    // Checked against the line's own rule, so a bad file gives `unknown` instead of a dropped line.
    const { version } = z.object({ version: errorLineSchema.shape.version }).parse(await res.json())
    return version
  })().catch(() => 'unknown')
  return versionPromise
}

/** What {@link logServerError} needs about one failed request. */
export type FailedRequest = {
  request: Request
  /** A clone of the answer the client got, so its error code can be read here. */
  response: Response
  /** The handler's note, if it left one. */
  note?: ErrorNote
  binding?: ErrorLogBinding
  assets?: AssetsBinding
}

/**
 * Builds the line for one failed request, prints it (for the real-time tail) and sends it to the
 * log Worker. Meant for `waitUntil`, so the client never waits for it. It never throws: a missing
 * or failing binding, or a line that fails the schema, is dropped (the same fail-open rule as the
 * rate limiter).
 */
export async function logServerError(failed: FailedRequest): Promise<void> {
  try {
    const { request, response, note } = failed
    // The short code from the JSON error body, if the answer has one.
    const body = (await response.json().catch(() => null)) as { error?: unknown } | null
    const method = request.method.toUpperCase()
    const parsed = errorLineSchema.safeParse({
      event: 'server_error',
      v: 1,
      route: routeName(new URL(request.url).pathname),
      method: errorLineSchema.shape.method.options.includes(method as never) ? method : 'OTHER',
      status: response.status,
      code:
        typeof body?.error === 'string' && /^[a-z_]{1,40}$/.test(body.error) ? body.error : null,
      cause: note?.cause ?? (response.status >= 500 ? 'status_5xx' : 'uncaught'),
      errorName: errorName(note?.error),
      upstreamStatus: note?.upstreamStatus ?? null,
      version: await deployedVersion(failed.assets, request.url),
    } satisfies Record<keyof ErrorLine, unknown>)
    if (!parsed.success) return
    console.log(JSON.stringify(parsed.data))
    await failed.binding?.report(parsed.data)
  } catch {
    // Logging must never break anything.
  }
}

/**
 * Checks a line again on the log Worker's side of the binding (workers/error-log/) and returns
 * it as one JSON string, or null when it isn't a valid line. Oversized or extra fields fail here.
 */
export function acceptLine(line: unknown): string | null {
  const parsed = errorLineSchema.safeParse(line)
  return parsed.success ? JSON.stringify(parsed.data) : null
}
