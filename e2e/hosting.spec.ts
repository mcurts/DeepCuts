// End-to-end checks that only apply to the hosted runtime (ADR-0029, Stage 4): run by
// `npm run e2e:cf` against `wrangler pages dev`, never against `vite preview`.
import { expect, test } from '@playwright/test'
import { contentSecurityPolicy } from '../server/securityHeaders.ts'

test('static files get HSTS and the same CSP as vite preview (H6)', async ({ request }) => {
  const h = (await request.get('/')).headers()
  expect(h['strict-transport-security']).toBe('max-age=31536000; includeSubDomains')
  expect(h['content-security-policy']).toBe(contentSecurityPolicy)
})

test('hashed assets are cached for a year (H6)', async ({ page, request }) => {
  await page.goto('/')
  const src = await page
    .locator('script[type="module"][src^="/assets/"]')
    .first()
    .getAttribute('src')
  expect(src).toBeTruthy()
  const h = (await request.get(src ?? '')).headers()
  expect(h['cache-control']).toBe('public, max-age=31536000, immutable')
})

test('a missing asset is a 404 that is never cached, not the app page (#17)', async ({
  request,
}) => {
  // An old deploy's chunk name. Pages answers unknown page URLs with index.html (see "deep links"
  // below); public/assets/404.html makes /assets/* the exception.
  const res = await request.get('/assets/SearchPage-gone1234.js')
  expect(res.status()).toBe(404)
  expect(await res.text()).not.toContain('id="root"')
  // Not the year-long cache real assets get: a rollback can bring the name back.
  expect(res.headers()['cache-control']).toBe('no-store')
})

test('API answers carry the security headers too (Functions middleware)', async ({ request }) => {
  const h = (await request.get('/api/tmdb/account')).headers()
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['content-security-policy']).toBe(contentSecurityPolicy)
})

test('deep links load the app (H7)', async ({ page }) => {
  for (const path of ['/movie/603', '/lists', '/account']) {
    const res = await page.goto(path)
    expect(res?.status(), path).toBe(200)
    await expect(page.locator('#root')).not.toBeEmpty()
  }
})

test('the API answers only on the site address (host pin)', async ({ request }) => {
  // An old deploy's own address, as Cloudflare would route it. Localhost (every other test here)
  // is allowed; so is the site, here the stand-in host `npm run preview:cf` sets (ADR-0047).
  const wrong = await request.get('/api/auth/session', {
    headers: { Host: 'a1b2c3d4.deep-cuts.pages.dev' },
  })
  expect(wrong.status()).toBe(421)
  expect(await wrong.json()).toEqual({ error: 'wrong_host' })
  const site = await request.get('/api/auth/session', {
    headers: { Host: 'deep-cuts.example' },
  })
  // Reached the handler: signed out, so a 200 with no user (not refused by the pin).
  expect(site.status()).toBe(200)
  expect(await site.json()).toBeNull()
})

test('unknown API paths are a JSON 404, not the app page', async ({ request }) => {
  const res = await request.get('/api/nope')
  expect(res.status()).toBe(404)
  expect(await res.json()).toEqual({ error: 'not_found' })
})

test('with no token the proxy answers 503, never live TMDB', async ({ request }) => {
  const res = await request.get('/api/tmdb/genre/movie/list')
  expect(res.status()).toBe(503)
  expect(await res.json()).toEqual({ error: 'tmdb_token_missing' })
})

test('the API refuses data-changing requests from other origins (CSRF)', async ({ request }) => {
  const res = await request.post('/api/tags/import', {
    headers: { Origin: 'https://evil.example' },
    data: { records: [] },
  })
  expect(res.status()).toBe(403)
  expect(await res.json()).toEqual({ error: 'bad_origin' })
})
