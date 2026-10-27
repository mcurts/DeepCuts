// The app's entry point: sets up data caching, the session and the router, then renders.
// index.html loads this file.
// First, so Zod is configured before any schema runs (see the file).
import './zodConfig'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppToaster } from './components/layout/AppToaster'
import { applySeasonalFavicon } from './components/layout/seasonalLogos'
import { createCloudflareSessionProvider } from './adapters/cloudflare/CloudflareSessionProvider'
import { createMockSessionProvider } from './adapters/local/MockSessionProvider'
import { shouldRetry } from './api/retry'
import { reloadOnStaleChunk } from './reloadOnStaleChunk'
import { AppSessionProvider } from './session/AppSessionProvider'
import { routes } from './router'
import { startApp } from './startup'
import './index.css'

// A tab left open across a deploy reloads once to get the new pages, instead of erroring.
reloadOnStaleChunk()

// A holiday's tab icon, when one is in season (e.g. Halloween all October).
applySeasonalFavicon()

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

// Shared cache for every data request. Retry a failed request once, but never a rate-limit 429
// (see api/retry.ts); don't re-fetch just because the window regained focus (movie data rarely
// changes).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry, refetchOnWindowFocus: false } },
})
const router = createBrowserRouter(routes)
// Which accounts the app uses (ADR-0031): with the build flag VITE_ACCOUNTS=cloudflare (not a
// secret; set by `npm run preview:cf` and for the hosted build), real passkey accounts on the
// server; otherwise the local mock, so `npm run dev` needs no setup.
// Imported statically, so its code downloads with the entry instead of in a second round trip
// before the first paint (ADR-0055). The flag is a build-time constant, so a mock build drops the
// Cloudflare provider and still never ships the passkey library.
const sessionProvider =
  import.meta.env.VITE_ACCOUNTS === 'cloudflare'
    ? createCloudflareSessionProvider()
    : createMockSessionProvider()
// Read the saved session before the first render, so the app never flashes a guest state for
// someone who is signed in. If it can't be read (the accounts server timed out or failed), this
// shows "can't reach your account" with a retry instead (issue #19, startup.tsx).
await startApp(createRoot(root), sessionProvider, (initialSession) => (
  // StrictMode runs extra checks in development only (e.g. effects run twice to expose bugs).
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppSessionProvider provider={sessionProvider} initialSession={initialSession}>
        {/* Triple Feature texture (ADR-0040, index.css): faint scratches behind every page and
            film grain over it. Both are decoration only, pinned to the window, and let every
            click through. Rendered once here so every layout gets them. */}
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 film-scratch" />
        <RouterProvider router={router} />
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-60 film-grain" />
        {/* Outside the router, so toasts stay up across route changes (src/notify.ts). */}
        <AppToaster />
      </AppSessionProvider>
    </QueryClientProvider>
  </StrictMode>
))
