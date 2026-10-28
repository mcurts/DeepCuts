// When and how soon a failed data request is tried again (React Query's defaults, main.tsx).
//
// Most failures (a network blip, a slow TMDB answer) are retried once, straight away. A 429 means
// this client is over the per-client rate limit (ADR-0029): an immediate retry would only count
// against the limit again, so it is retried once, after the wait the server asks for
// (`Retry-After`). Until then the film keeps its loading placeholder, so the page holds still.
//
// A failed request is never re-sent just because another part of the page starts using it
// (`retryOnMount: false`). Home's shelves and the Discovery scorer subscribe and unsubscribe to
// film details as other films arrive; when the limiter refused some, each re-subscription sent
// them again, which kept the client over the limit and the page re-rendering (a live Home sent
// one film 781 times in 45 s).

/** How many times a failed request is retried. */
const MAX_RETRIES = 1

/** How long to wait before retrying a 429 that names no wait: the limiter's whole period. */
const RATE_LIMIT_WAIT_MS = 60_000

/**
 * How long to wait before a retry, in ms. A 429 waits as long as the server asked
 * (`retryAfter`, in seconds, on `TmdbError`), else the limiter's period. Anything else uses React
 * Query's usual backoff (1 s, doubling, at most 30 s).
 * @param failureCount - How many times the request has already failed.
 * @param error - What it failed with. The app's API errors (`TmdbError`, `TagApiError`) carry the
 *   HTTP `status`; anything else (e.g. a network error) has none.
 */
export function retryDelay(failureCount: number, error: unknown): number {
  const { status, retryAfter: seconds } = (error ?? {}) as {
    status?: unknown
    retryAfter?: unknown
  }
  if (status === 429) {
    return typeof seconds === 'number' ? seconds * 1000 : RATE_LIMIT_WAIT_MS
  }
  return Math.min(1000 * 2 ** failureCount, 30_000)
}

/** The app's retry rules for every data request, as React Query defaults (main.tsx). */
export const retryOptions = { retry: MAX_RETRIES, retryDelay, retryOnMount: false }
