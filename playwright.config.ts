// Playwright configuration for the end-to-end tests in e2e/ (`npm run e2e`).
import { defineConfig, devices } from '@playwright/test'

// Three viewports: Reflow (320), mobile (390), desktop (1280).
export default defineConfig({
  testDir: 'e2e',
  // Hosting-only checks (HSTS, `_headers`, Functions) and real passkey accounts run against
  // wrangler instead (playwright.cf.config.ts, `npm run e2e:cf`).
  testIgnore: ['hosting.spec.ts', 'accounts.spec.ts'],
  fullyParallel: true,
  // On CI: fail if a test was left as `.only`, retry a flaky test once, and report in GitHub's format.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Keep a step-by-step trace of failed tests, for debugging (npx playwright show-trace).
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'reflow-320',
      use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 } },
    },
    {
      name: 'mobile-390',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  // Tests run against the production build, where the CSP is applied.
  // Same as CI everywhere: a fresh build every run, and no TMDB token, so a missing mock can
  // never fall through to live TMDB from a developer machine.
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: false,
    env: { TMDB_READ_TOKEN: '' },
  },
})
