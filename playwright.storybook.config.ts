// Playwright configuration for the Storybook accessibility gate:
// builds Storybook, serves it, and runs axe on every story (storybook-tests/a11y.spec.ts).
// Run with `npm run storybook:test`.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'storybook-tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:6007' },
  webServer: {
    command: 'npm run build-storybook && node scripts/serve-static.mjs storybook-static 6007',
    port: 6007,
    reuseExistingServer: false,
    // Like the E2E tests: no TMDB token, so nothing can reach the real API.
    env: { TMDB_READ_TOKEN: '' },
  },
})
