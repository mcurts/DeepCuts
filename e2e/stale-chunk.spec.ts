// A tab left open across a deploy (GitHub issue #17): its pages' chunks have new names, so the old
// ones are gone. The app should reload once and recover, not show "Something went wrong".
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.use({ signedIn: false })

// Answers requests for the Sign in page's chunk the way a deploy leaves them: a 404 (what
// public/assets/404.html gives on Cloudflare Pages). `times` limits how many requests fail.
const removeSignInChunk = (page: Page, times?: number) =>
  page.route(
    /\/assets\/SignInPage-[\w-]+\.js$/,
    (route) => route.fulfill({ status: 404, contentType: 'text/html', body: 'Not found.' }),
    { times },
  )

test('a missing page chunk reloads once and the page then loads', async ({ page }) => {
  await removeSignInChunk(page, 1)
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('Something went wrong')).toHaveCount(0)
})

test('a chunk still missing after the reload shows the error page, not a loop', async ({
  page,
}) => {
  await removeSignInChunk(page)
  let loads = 0
  page.on('load', () => loads++)
  await page.goto('/sign-in')
  // The first visit plus one reload. The error page may flash before the reload, so wait for the
  // second load before looking for it.
  await expect.poll(() => loads).toBe(2)
  await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible()
})
