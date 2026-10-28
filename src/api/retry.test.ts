// Tests for the retry rules: one retry for any failure, a 429 only after the server's wait, and no
// re-send of a failed request when another part of the page starts using it.
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { TagApiError } from '@/adapters/cloudflare/CloudflareTagRepository'
import { retryDelay, retryOptions } from './retry'
import { TmdbError } from './tmdb'

describe('retryDelay', () => {
  it('waits as long as the server asked before retrying a 429', () => {
    expect(retryDelay(0, new TmdbError(429, 30))).toBe(30_000)
  })

  it('waits the limiter’s whole minute for a 429 that names no wait, from either API', () => {
    expect(retryDelay(0, new TmdbError(429))).toBe(60_000)
    expect(retryDelay(0, new TagApiError(429))).toBe(60_000)
  })

  it('backs off as usual for anything else', () => {
    expect(retryDelay(0, new TmdbError(502))).toBe(1000)
    expect(retryDelay(1, new TypeError('Failed to fetch'))).toBe(2000)
    expect(retryDelay(10, null)).toBe(30_000)
    expect(retryDelay(0, 'boom')).toBe(1000)
  })
})

describe('retryOptions', () => {
  it('retries a failure once', () => {
    expect(retryOptions.retry).toBe(1)
  })

  it('does not re-send a failed request when a new part of the page starts using it', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { ...retryOptions, retry: false } },
    })
    const queryFn = vi.fn(() => Promise.reject(new TmdbError(429)))
    const options = { queryKey: ['film', 1], queryFn }
    await client.fetchQuery(options).catch(() => undefined)
    // A shelf re-rendering subscribes to the same film again.
    const unsubscribe = new QueryObserver(client, options).subscribe(() => undefined)
    unsubscribe()
    expect(queryFn).toHaveBeenCalledTimes(1)
  })
})
