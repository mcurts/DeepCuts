// Guards the rate-limit budget (ADR-0029, ADR-0032): a heavy profile's first Home load must fit
// inside the per-client API limit, with room to spare for clicking around straight afterwards.
//
// A reload in the same minute costs nothing: the proxy lets the browser keep its answers for longer
// than the limiter's period (server/http.ts). A reload that skips the browser's cache (a hard
// reload, DevTools' "Disable cache", Lighthouse's storage reset) pays again and goes over; the app
// then waits out the limit instead of re-asking (src/api/retry.ts, e2e/rate-limit.spec.ts).
//
// The numbers come from the real sources (the caps in useRecommendations.ts and the limit in the
// rate-limit Worker's wrangler.toml), so raising a cap or lowering the limit fails this test
// instead of quietly cutting the feed short in production.
import { describe, expect, it } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- the Worker's config lives outside src/, so @/ can't reach it
import rateLimitConfig from '../../workers/rate-limit/wrangler.toml?raw'
// eslint-disable-next-line no-restricted-imports -- server/ code is outside src/, so @/ can't reach it
import { json } from '../../server/http'
import { KEYWORD_SEARCHES } from '@/domain/scorer'
import { TOP_TEN_SIZE } from '@/domain/topTen'
import { HOME_PICKS, LIMITS, MAX_SERIES, RERANK } from './useRecommendations'

// Home's Discovery shelf: each pick needs its details for the credit lines. Counted in full: most
// are already loaded by the re-rank, but an explore slot can come from outside it.
const HOME_CARDS = HOME_PICKS
// Home's Top Ten shelf: one details call per ranked film, which may not be tagged. The scorer
// reads the same cached details for the Top Ten's taste (ADR-0043), so that adds nothing. (The watchlist
// shelf shows the films the scorer already loads, LIMITS.watchlist, so it adds nothing.)
const TOP_TEN = TOP_TEN_SIZE
// Other calls a first load can make: the popular feed, the session check, and the account's
// tag records (cached for 30 s, so one call, plus one spare for a refresh).
const OTHER_CALLS = 4
// Room left for what someone does in the same minute: opening a film costs at most one
// where-to-watch call, so this covers a few dozen clicks.
const HEADROOM = 30

// The API_LIMITER's `limit` from the Worker's config, e.g. `simple = { limit = 120, period = 60 }`.
function apiLimit(toml: string): number {
  const block = toml.split('[[ratelimits]]').find((b) => b.includes('"API_LIMITER"'))
  const match = block?.match(/limit\s*=\s*(\d+)\s*,\s*period\s*=\s*60\b/)
  if (!match?.[1]) throw new Error('API_LIMITER with a 60 s period not found in wrangler.toml')
  return Number(match[1])
}

// One details call per tagged film, one per liked series, one per keyword search (ADR-0038), one
// per re-rank candidate, plus the shelves and other calls above.
const tagged = LIMITS.liked + LIMITS.watchlist + LIMITS.disliked
const worstCase =
  tagged + MAX_SERIES + KEYWORD_SEARCHES + RERANK + HOME_CARDS + TOP_TEN + OTHER_CALLS

describe('first Home load vs the rate limit', () => {
  it('reads the API limit from the Worker config', () => {
    expect(apiLimit(rateLimitConfig)).toBe(120)
  })

  it('fits a heavy profile, with headroom', () => {
    expect(worstCase).toBe(87)
    expect(worstCase + HEADROOM).toBeLessThanOrEqual(apiLimit(rateLimitConfig))
  })

  it('lets a reload in the same minute reuse the answers instead of paying again', () => {
    // The browser keeps a proxy answer longer than the limiter counts a request.
    const maxAge = Number(
      /max-age=(\d+)/.exec(json(200, {}).headers.get('Cache-Control') ?? '')?.[1],
    )
    expect(maxAge).toBeGreaterThanOrEqual(60)
  })

  it('goes over the limit on a reload that skips the cache: the case the retry rules cover', () => {
    // Documents the known gap (tracked as its own issue): two cold loads in one minute.
    expect(worstCase * 2).toBeGreaterThan(apiLimit(rateLimitConfig))
  })
})
