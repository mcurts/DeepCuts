// End-to-end test of real accounts (ADR-0031, Stage 6 A6), run by `npm run e2e:cf` against
// `wrangler pages dev` with a local D1 database and the rate-limit Worker. Chromium's virtual
// authenticator (Chrome DevTools Protocol, `WebAuthn.addVirtualAuthenticator`) stands in for a
// phone or laptop: it creates and uses real passkeys, with user verification.
//
// One flow, start to finish: invite → register → reload (still signed in) → the session ends on
// the server mid-use → Sign in with the passkey → back on the same page, the lists still there →
// sign out. Then renaming and deleting an account, the "can't reach your account" screen when the
// session check fails, and axe on the account pages at all three widths.
import { execFileSync } from 'node:child_process'
import type { Page } from '@playwright/test'
import { expect, expectNoA11yViolations, test } from './fixtures'

// The flow shares one server-side rate limit (10 sign-in requests a minute), so run in order.
test.describe.configure({ mode: 'serial' })
// These tests start signed out: they register and sign in themselves.
test.use({ signedIn: false })

/** Creates a local invite with the real script and returns its path (`/register?invite=…`). */
function newInvitePath(): string {
  const out = execFileSync('node', ['scripts/invite.mjs'], { encoding: 'utf8' })
  const link = out.match(/http:\/\/localhost:8788(\/register\?invite=[\w-]{22})/)
  if (!link?.[1]) throw new Error(`No invite link in:\n${out}`)
  return link[1]
}

/** Gives the page a passkey-capable "device" (Chromium only). */
async function addAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
}

test('invite → register → reload → session ends → sign in with the passkey → sign out', async ({
  page,
}) => {
  await addAuthenticator(page)

  // Register from an invite link. The code is filled in, then removed from the address bar.
  await page.goto(newInvitePath())
  await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible()
  await expect(page).toHaveURL(/\/register$/)
  await expect(page.getByText(/No passkey or real account is created/)).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Name' }).fill('Ada Lovelace')
  await page.getByRole('button', { name: 'Create passkey' }).click()
  await expect(page).not.toHaveURL(/\/register/)

  // A real session: it survives a reload, and the Account page shows a passkey account.
  await page.goto('/account')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Ada Lovelace' })).toBeVisible()
  await expect(page.getByText('Signed in with a passkey')).toBeVisible()

  // Tag a film through the app's own API call (same origin, the session cookie rides along).
  const put = await page.evaluate(() =>
    fetch('/api/tags', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: 1091, tag: 'liked' }),
    }).then((r) => r.status),
  )
  expect(put).toBe(200)

  // The cookie is invisible to the page's JavaScript (HttpOnly).
  expect(await page.evaluate(() => document.cookie)).not.toContain('dc_session')

  // The session ends on the server mid-use (issue #18): as after 30 idle days, or a sign-out on
  // another device, the browser's cookie no longer opens it. Saving a tag then lands on Sign in.
  await page.goto('/movie/1091')
  const tags = page.getByRole('group', { name: 'Your tags' })
  await expect(tags).toBeVisible()
  await page.context().clearCookies()
  await tags.getByRole('button', { name: 'More like this' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByText('You were signed out. Sign in again')).toBeVisible()

  // Sign in with the passkey (one button, no username): back on the same film.
  await page.getByRole('button', { name: /Sign in with a passkey/ }).click()
  await expect(page).toHaveURL(/\/movie\/1091$/)
  const session = await page.request.get('/api/auth/session')
  expect(await session.json()).toMatchObject({ name: 'Ada Lovelace' })

  // The lists are still there (the save that hit the ended session changed nothing).
  const saved = await (await page.request.get('/api/tags')).json()
  expect(saved.records).toEqual([expect.objectContaining({ tmdbId: 1091, tag: 'liked' })])

  // Reorders persist in D1 (ADR-0041): the watchlist's saved order and the Top Ten's ranks.
  const api = (method: string, path: string, body: unknown) =>
    page.evaluate(
      ([m, p, b]) =>
        fetch(p, {
          method: m,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(b),
        }).then((r) => r.status),
      [method, path, body] as const,
    )
  for (const tmdbId of [348, 790]) {
    expect(await api('PUT', '/api/tags', { tmdbId, tag: 'watchlist' })).toBe(200)
    expect(await api('PUT', '/api/top-ten', { tmdbId })).toBe(200)
  }
  expect(await api('PATCH', '/api/tags/order', { tag: 'watchlist', ids: [348, 790] })).toBe(200)
  expect(await api('PATCH', '/api/top-ten', { ids: [790, 348] })).toBe(200)
  // A stale order (a film missing) is refused.
  expect(await api('PATCH', '/api/top-ten', { ids: [790] })).toBe(409)
  await page.reload()
  expect((await (await page.request.get('/api/tags')).json()).watchlistOrder).toEqual([348, 790])
  expect((await (await page.request.get('/api/top-ten')).json()).films).toEqual([790, 348])

  // Sign out from the header's account menu (desktop width, one press), then the session is gone.
  // Chosen, not ended by the server: it lands on the landing page, not on Sign in.
  await page.goto('/account')
  await page.getByRole('banner').getByRole('button', { name: 'Account menu for Ada' }).click()
  await expect(page.getByRole('menuitem', { name: 'Account settings' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/$/)
  expect(await (await page.request.get('/api/auth/session')).json()).toBeNull()
})

test('a used invite is refused on the invite field', async ({ page }) => {
  await addAuthenticator(page)
  const invite = newInvitePath()
  await page.goto(invite)
  await page.getByRole('textbox', { name: 'Name' }).fill('First')
  await page.getByRole('button', { name: 'Create passkey' }).click()
  await expect(page).not.toHaveURL(/\/register/)
  await page.context().clearCookies()

  await page.goto(invite)
  await page.getByRole('textbox', { name: 'Name' }).fill('Second')
  await page.getByRole('button', { name: 'Create passkey' }).click()
  await expect(page.getByRole('textbox', { name: 'Invite code' })).toHaveAccessibleDescription(
    /may have expired or been used already/,
  )
})

test.describe('account settings', () => {
  // Its own rate-limit bucket: with the flow above, this file makes more account changes than
  // the 10-a-minute auth limit allows one client (server/rateLimit.ts). The limiter keys on
  // CF-Connecting-IP, which `wrangler pages dev` passes through; on Cloudflare a client can't set
  // it. 203.0.113.0/24 is the documentation-only range.
  test.use({ extraHTTPHeaders: { 'CF-Connecting-IP': '203.0.113.7' } })
  test('a passkey account can change its name and delete itself (ADR-0031 A2b)', async ({
    page,
  }) => {
    await addAuthenticator(page)
    await page.goto(newInvitePath())
    await page.getByRole('textbox', { name: 'Name' }).fill('Grace Hopper')
    await page.getByRole('button', { name: 'Create passkey' }).click()
    await expect(page).not.toHaveURL(/\/register/)

    // Change name: an empty name is refused on the field. Fixing it and clicking Save once with
    // the mouse saves it (issue #60), on the server, so it survives a reload.
    await page.goto('/account')
    const name = page.getByRole('textbox', { name: 'Name' })
    await name.fill('')
    await page.getByRole('button', { name: 'Save name' }).click()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await name.fill('Grace B. Hopper')
    await page.getByRole('button', { name: 'Save name' }).click()
    await expect(page.getByText('Name saved.')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Grace B. Hopper' })).toBeVisible()

    // Delete asks first; Cancel keeps the account.
    const remove = page.getByRole('button', { name: 'Delete account' })
    await remove.click()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(remove).toBeFocused()
    await remove.click()
    await page.getByRole('button', { name: 'Yes, delete my account' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Your account was deleted.')).toBeVisible()
    expect(await (await page.request.get('/api/auth/session')).json()).toBeNull()
  })
})

test('when the session check fails, the app says so and Try again recovers (issue #19)', async ({
  page,
}) => {
  // The accounts server answers with an error instead of "signed in" or "signed out".
  await page.route('**/api/auth/session', (route) => route.fulfill({ status: 500, json: {} }))
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Can’t reach your account' }),
  ).toBeVisible()
  await expectNoA11yViolations(page)

  // The server is back: Try again starts the app (signed out here, so the landing page).
  await page.unroute('**/api/auth/session')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible()
})

for (const [width, height] of [
  [320, 640],
  [390, 844],
  [1280, 800],
] as const) {
  test(`register and sign-in pages pass axe at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/register')
    await expect(page.getByRole('heading', { level: 1, name: 'Create an account' })).toBeVisible()
    await expectNoA11yViolations(page)
    await page.goto('/sign-in')
    await expect(page.getByRole('button', { name: /Sign in with a passkey/ })).toBeVisible()
    await expectNoA11yViolations(page)
  })
}
