// Playwright configuration for the hosting E2E tests (`npm run e2e:cf`): the
// security checks run against the real Cloudflare runtime, locally, through `npm run preview:cf`
// (`wrangler pages dev` with the rate-limit Worker). Nothing is deployed.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  // The header/CSP/proxy checks, the hosting-only ones (HSTS, `_headers`, SPA routing), and real
  // passkey accounts against the local D1 database.
  testMatch: ['security.spec.ts', 'hosting.spec.ts', 'accounts.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:8788', trace: 'retain-on-failure' },
  // One width is enough: these tests check the server, not the layout.
  projects: [{ name: 'cloudflare', use: { ...devices['Desktop Chrome'] } }],
  // Same rules as the main E2E config: a fresh build every run and no TMDB token (the proxy
  // answers 503), so nothing can reach live TMDB. Built with real accounts on, and the local D1
  // database migrated first (`preview:accounts`).
  webServer: {
    command: 'npm run preview:accounts',
    port: 8788,
    reuseExistingServer: false,
    env: { PREVIEW_CF_NO_TOKEN: '1', VITE_ACCOUNTS: 'cloudflare' },
    timeout: 180_000,
  },
})
