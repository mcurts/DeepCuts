// Tests for the rate limit's bucket choice and its fail-open and 429 behaviour (rateLimit.ts).
import { describe, expect, it, vi } from 'vitest'
import { bucketFor, rateLimit, type RateLimiterBinding } from './rateLimit.ts'

const req = (path: string, method = 'GET') =>
  new Request(`https://example.test${path}`, { method, headers: { 'CF-Connecting-IP': '1.2.3.4' } })

describe('bucketFor', () => {
  it('puts film data in its own bucket', () => {
    expect(bucketFor(req('/api/tmdb/movie/927'))).toBe('tmdb')
  })

  it('keeps sign-in and account changes in the tight bucket', () => {
    expect(bucketFor(req('/api/auth/login', 'POST'))).toBe('auth')
  })

  it('keeps the session check and tag calls in the general bucket', () => {
    expect(bucketFor(req('/api/auth/session'))).toBe('api')
    expect(bucketFor(req('/api/tags/liked'))).toBe('api')
  })
})

describe('rateLimit', () => {
  it('asks the limiter with the client IP and the request bucket', async () => {
    const check = vi.fn().mockResolvedValue({ allowed: true })
    expect(await rateLimit(req('/api/tmdb/movie/1'), { check })).toBeNull()
    expect(check).toHaveBeenCalledWith('1.2.3.4', 'tmdb')
  })

  it('answers 429 with Retry-After when over the limit', async () => {
    const limiter: RateLimiterBinding = { check: async () => ({ allowed: false }) }
    const res = await rateLimit(req('/api/tmdb/movie/1'), limiter)
    expect(res?.status).toBe(429)
    expect(res?.headers.get('Retry-After')).toBe('60')
  })

  it('fails open and reports when the limiter errors', async () => {
    const report = vi.fn()
    const limiter: RateLimiterBinding = { check: () => Promise.reject(new Error('down')) }
    expect(await rateLimit(req('/api/tmdb/movie/1'), limiter, report)).toBeNull()
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ cause: 'rate_limiter_unavailable' }),
    )
  })
})
