// What the built app does when the API's per-client rate limit (ADR-0029) refuses some requests.
// Unit tests copy the app's retry rules into their own data cache; this runs the production build,
// so it checks the rules main.tsx actually sets (src/api/retry.ts).
//
// The case it guards: a reload that skips the browser's cache goes over the limit (feedBudget.test.ts).
// Each refused film used to be asked for again every time Home re-rendered, 781 times in 45 s on
// the live site, which kept the client over the limit and the shelves jumping.
import { movieFixture } from '../src/test/msw/fixtures'
import { expect, test } from './fixtures'

// The films The Thing recommends: the Discovery scorer loads their details for its re-rank.
const candidates = new Set(movieFixture.recommendations.results.map((m) => String(m.id)))

// Signed in to the demo account with The Thing in its Top Ten, so the scorer has candidates to
// load. Seeded through the new browser context's storage, as e2e/fixtures.ts signs in.
test.use({
  storageState: async ({ baseURL }, use) => {
    await use({
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL ?? 'http://localhost').origin,
          localStorage: [
            {
              name: 'deepcuts:v1:account',
              value: JSON.stringify({ id: 'demo', name: 'Mike Curts', method: 'demo' }),
            },
            { name: 'deepcuts:v1:signed-in', value: 'true' },
            { name: 'deepcuts:v1:account-demo-top-ten', value: JSON.stringify([1091]) },
          ],
        },
      ],
    })
  },
})

test('Home asks once for films the limiter refused, and waits out the limit', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1280', 'Request counts are the same at every width')
  // Every candidate's details are refused, as the limiter answers (server/rateLimit.ts).
  const asks = new Map<string, number>()
  await page.route(/\/api\/tmdb\/movie\/(\d+)(\?.*)?$/, (route) => {
    const id = /movie\/(\d+)/.exec(route.request().url())?.[1] ?? ''
    if (!candidates.has(id)) return route.fallback()
    asks.set(id, (asks.get(id) ?? 0) + 1)
    return route.fulfill({
      status: 429,
      headers: { 'Retry-After': '60' },
      json: { error: 'rate_limited' },
    })
  })

  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 2, name: 'Your Top Ten of All Time' }),
  ).toBeVisible()
  await expect.poll(() => asks.size).toBeGreaterThan(0)
  // Long enough for a loop to show itself; far shorter than the minute before the one retry.
  await page.waitForTimeout(3000)
  expect(Math.max(...asks.values())).toBe(1)
})
