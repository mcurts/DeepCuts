// Shared setup for every E2E test: fake TMDB responses, a signed-in demo account by default
// (almost every page needs an account, ADR-0034), and two reusable checks (accessibility scan,
// no sideways scrolling).
//
// Tests of the signed-out experience opt out with `test.use({ signedIn: false })`.
import AxeBuilder from '@axe-core/playwright'
import { test as base, expect, type Page } from '@playwright/test'
import { movieFixture, providersFixture, searchFixture } from '../src/test/msw/fixtures'

// E2E never calls TMDB: the proxy is stubbed with the same fixtures as unit tests,
// and CDN images are aborted. Playwright tries the most recently added route first, so the
// catch-all below is registered first and only fires for requests no fixture matches.
export const test = base.extend<{ page: Page; signedIn: boolean }>({
  // Start signed in to the demo account (the local mock's stand-in account, ADR-0025).
  signedIn: [true, { option: true }],
  // Signed in by seeding the browser context's storage with what the mock provider stores when
  // you sign in. It's applied once, when the context is created, so a test that signs out and
  // reloads stays signed out.
  storageState: async ({ signedIn, baseURL, storageState }, use) => {
    if (!signedIn || !baseURL) return use(storageState)
    await use({
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [
            {
              name: 'deepcuts:v1:account',
              value: JSON.stringify({ id: 'demo', name: 'Mike Curts', method: 'demo' }),
            },
            // What the app records after any signed-in visit (ADR-0057), so the boot script
            // hides the pre-rendered landing page as it would for a returning visitor.
            { name: 'deepcuts:v1:signed-in', value: 'true' },
          ],
        },
      ],
    })
  },
  page: async ({ page }, use) => {
    await page.route('**/api/tmdb/**', (route) => {
      // Fail loudly instead of falling through to the real proxy (and live TMDB, when a
      // developer has a token in .env.local).
      throw new Error(`Unmocked TMDB request in E2E: ${route.request().url()}`)
    })
    await page.route('**/api/tmdb/search/movie**', (route) =>
      route.fulfill({ json: searchFixture }),
    )
    await page.route('**/api/tmdb/discover/movie**', (route) =>
      route.fulfill({ json: searchFixture }),
    )
    await page.route('**/api/tmdb/movie/*/watch/providers', (route) =>
      route.fulfill({ json: providersFixture }),
    )
    await page.route(/\/api\/tmdb\/movie\/\d+(\?.*)?$/, (route) =>
      route.fulfill({ json: movieFixture }),
    )
    await page.route('https://image.tmdb.org/**', (route) => route.abort())
    await use(page)
  },
})

export { expect }

/** Fails the test if axe finds any WCAG 2.2 A/AA violation on the page (ADR-0009). */
export async function expectNoA11yViolations(page: Page, disableRules: string[] = []) {
  // Let entrance animations finish first: mid-fade (Detail's animate-enter), text is partly
  // transparent and axe reports it as low contrast, which made the scan flaky. Only time-based
  // animations are awaited: endless ones (loading pulses) and scroll-driven ones (the VHS box's
  // tilt on phones, which only moves when the page scrolls) never finish on their own.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (a) =>
            a.timeline === document.timeline && a.effect?.getComputedTiming().endTime !== Infinity,
        )
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(disableRules)
    .analyze()
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([])
}

/** Fails the test if the page scrolls sideways (WCAG 1.4.10 reflow, ADR-0021). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}
