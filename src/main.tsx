// The app's entry point: sets up data caching, the session and the router, then renders.
// index.html loads this file.
// First, so Zod is configured before any schema runs (see the file).
import './zodConfig'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AppToaster } from './components/layout/AppToaster'
import { FilmTextures } from './components/layout/FilmTextures'
import { applySeasonalFavicon } from './components/layout/seasonalLogos'
import { createCloudflareSessionProvider } from './adapters/cloudflare/CloudflareSessionProvider'
import { createMockSessionProvider } from './adapters/local/MockSessionProvider'
import { shouldRetry } from './api/retry'
import { reloadOnStaleChunk } from './reloadOnStaleChunk'
import { AppSessionProvider } from './session/AppSessionProvider'
import { routes } from './router'
import { startApp } from './startup'
import { initTheme } from './theme'
import './index.css'

// A tab left open across a deploy reloads once to get the new pages, instead of erroring.
reloadOnStaleChunk()

// A holiday's tab icon, when one is in season (e.g. Halloween all October).
applySeasonalFavicon()

// The chosen theme's fonts, and remembering a theme picked by a `?theme=` link (ADR-0056).
initTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')

// Shared cache for every data request. Retry a failed request once, but never a rate-limit 429
// (see api/retry.ts); don't re-fetch just because the window regained focus (movie data rarely
// changes).
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry, refetchOnWindowFocus: false } },
})
const router = createBrowserRouter(routes)
// Resolves once the router has loaded the first page's code (pages are lazy, router.tsx). Until
// then RouterProvider would render an empty frame, which at `/` would replace the pre-rendered
// landing page with a blank one for a moment (ADR-0057). The router settles even when a load
// fails (it then shows the error page), so this never rejects.
const routerReady = new Promise<void>((resolve) => {
  if (router.state.initialized) return resolve()
  const unsubscribe = router.subscribe((state) => {
    if (!state.initialized) return
    unsubscribe()
    resolve()
  })
})
// Resolves just after the browser's next paint: a frame callback runs right before a paint, and a
// timer set from it runs after.
const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
// Resolves once the pre-rendered page has painted in its own fonts (ADR-0057). On a fast
// connection the code can arrive before the headline's font: the app would then replace the
// headline before it ever showed, and its copy would count as the Largest Contentful Paint, tying
// that to the JavaScript. A paint first (so layout has asked for the fonts), then the fonts, then
// a paint with them. On a slow connection the fonts are long in by now (they load ahead of the
// scripts), and where #root is hidden no fonts are pending, so it costs a frame or two.
const shellPainted = (async () => {
  await nextPaint()
  await document.fonts.ready
  await nextPaint()
})()
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
// shows "can't reach your account" with a retry instead (issue #19, startup.tsx). createRoot
// replaces whatever #root holds (the pre-rendered landing page) on that first render.
await startApp(
  createRoot(root),
  sessionProvider,
  (initialSession) => (
    // StrictMode runs extra checks in development only (e.g. effects run twice to expose bugs).
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AppSessionProvider provider={sessionProvider} initialSession={initialSession}>
          {/* Rendered once here so every layout gets the textures. */}
          <FilmTextures>
            <RouterProvider router={router} />
          </FilmTextures>
          {/* Outside the router, so toasts stay up across route changes (src/notify.ts). */}
          <AppToaster />
        </AppSessionProvider>
      </QueryClientProvider>
    </StrictMode>
  ),
  Promise.all([routerReady, shellPainted]),
)
