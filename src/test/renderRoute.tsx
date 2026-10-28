// Test helper: renders the real app at a URL, with its own fresh data cache, so a test can
// navigate and click like a person would. Options swap in feature flags or a custom session.
//
// Tests start signed in to the demo account, because almost every page needs an account
// (ADR-0034). Pass `initialSession: SIGNED_OUT` for the landing page and the sign-in flows.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Account, Session, SessionProvider } from '@/adapters/SessionProvider'
import { retryOptions } from '@/api/retry'
import { AppToaster } from '@/components/layout/AppToaster'
import { AppSessionProvider } from '@/session/AppSessionProvider'
import { FEATURES, type Features } from '@/config/features'
import { createRoutes } from '@/router'

/** The demo account, as the local mock signs it in (its lists live under `account-demo-tags`). */
export const DEMO: Account = { id: 'demo', name: 'Mike Curts', method: 'demo' }
const SIGNED_IN: Session = { kind: 'account', account: DEMO }

interface Options {
  features?: Partial<Features>
  /** A custom session adapter, e.g. one whose sign-in fails. */
  sessionProvider?: SessionProvider
  /** Defaults to signed in to the demo account. */
  initialSession?: Session
}

export function renderRoute(path: string, options: Options = {}) {
  const routes = createRoutes({ ...FEATURES, ...options.features })
  // The app's own retry rules (src/api/retry.ts), so screens behave here as they do live (a loop
  // that only showed with them once reached production). Only the wait before a retry is cut, so
  // a failure still settles quickly.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { ...retryOptions, retryDelay: 0 } },
  })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return {
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AppSessionProvider
          {...(options.sessionProvider && { provider: options.sessionProvider })}
          initialSession={options.initialSession ?? SIGNED_IN}
        >
          <RouterProvider router={router} />
          {/* Toasts (src/notify.ts), as in main.tsx, so tests can find them by their text. */}
          <AppToaster />
        </AppSessionProvider>
      </QueryClientProvider>,
    ),
  }
}

/**
 * Waits for a toast (src/notify.ts) with this text, inside Sonner's "Notifications" region, so a
 * test checks it was shown as a toast and not anywhere else on the page.
 */
export async function findToast(text: string | RegExp) {
  const region = await screen.findByRole('region', { name: /^Notifications/ })
  return within(region).findByText(text)
}
