// End-to-end checks for the pre-rendered landing page (ADR-0057): the built index.html shows the
// signed-out landing page before any JavaScript runs, hides it wherever the visit will show
// something else, and the app takes over from it without moving anything on screen.
import { expect, test } from './fixtures'

const headline = { level: 1, name: 'Your movies, close at hand' } as const

// Before the app runs: its scripts never arrive, but the boot scripts in <head> still run, as on
// a slow connection before the bundle has downloaded.
test.describe('before the app runs', () => {
  test.beforeEach(({ page }) => page.route('**/assets/*.js', (route) => route.abort()))

  test.describe('signed out', () => {
    test.use({ signedIn: false })

    test('/ shows the landing page from the HTML alone', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', headline)).toBeVisible()
      await expect(page.getByRole('link', { name: 'Get your ticket' })).toBeVisible()
    })

    test('any other address hides it (the server sends every page the same file)', async ({
      page,
    }) => {
      await page.goto('/sign-in')
      await expect(page.getByRole('heading', headline)).toBeHidden()
    })
  })

  test('a signed-in device hides it, since / will be Home', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', headline)).toBeHidden()
  })
})

test.describe('signed out, with JavaScript', () => {
  test.use({ signedIn: false })

  test('the app replaces the pre-rendered page without a layout shift', async ({ page }) => {
    // Adds up every layout shift from the start of the load, as Lighthouse's CLS does.
    await page.addInitScript(() => {
      const w = window as unknown as { cls: number }
      w.cls = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          w.cls += (entry as unknown as { value: number }).value
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto('/')
    // The app has taken over once the pre-rendered wrapper (prerender.tsx) is gone from #root.
    await expect(page.locator('#root > .contents')).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', headline)).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { cls: number }).cls)).toBeLessThan(0.01)
  })
})
