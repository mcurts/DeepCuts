// Runs before every unit test file (vite.config.ts → test.setupFiles).
// Adds DOM matchers (toBeInTheDocument…), starts the fake TMDB server, and resets state between
// tests so they can't affect each other.
import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { toast } from 'sonner'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { createLocalTagRepository } from '@/adapters/local/LocalTagRepository'
import { createLocalTopTenRepository } from '@/adapters/local/LocalTopTenRepository'
import { createMockSessionProvider } from '@/adapters/local/MockSessionProvider'
import { server } from './msw/server'

// findBy*/waitFor wait up to 3s instead of 1s. The first test in a file also loads its lazy page
// (route code splitting) and the fake TMDB answer; under coverage, with files running in
// parallel, that sometimes took over a second and failed a correct test.
configure({ asyncUtilTimeout: 3000 })

// Any request without a fake handler fails the test, so tests can never reach the real TMDB.
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(async () => {
  // Toasts live in Sonner's global store, and a new <Toaster> replays every one still active, so
  // dismiss them or the next test would see this test's toasts.
  toast.dismiss()
  cleanup()
  server.resetHandlers()
  // Accounts, their tags and their Top Ten must not leak between tests (reset through the adapters).
  // Server tests run in plain Node, which has no browser storage.
  if (typeof window === 'undefined') return
  await createMockSessionProvider().signOut()
  await createLocalTagRepository(undefined, undefined, 'account-demo-tags').clear()
  const topTen = createLocalTopTenRepository('account-demo-top-ten')
  for (const id of await topTen.list()) await topTen.remove(id)
})
afterAll(() => server.close())
