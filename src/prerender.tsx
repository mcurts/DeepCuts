// Build-time entry (ADR-0057): renders the signed-out landing page at `/` to HTML, which
// scripts/prerender.mjs writes into dist/index.html's #root. A first visit then paints the page
// straight from the HTML, before any JavaScript has loaded; the app replaces it with the same
// markup once it starts (main.tsx). Never shipped to the browser: `npm run build` bundles it for
// Node on its own (scripts/prerender.mjs).
//
// It must render what the app's first render at `/` shows a signed-out visitor, so the swap can't
// be seen: the same shell (AppLayout), page (LandingPage) and textures (FilmTextures) as main.tsx.
// public/shell-boot.js hides it before the first paint wherever the app will show something else.
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { SIGNED_OUT } from './adapters/SessionProvider'
import { signedOutTags, signedOutTopTen } from './adapters/signedOutTags'
import { FilmTextures } from './components/layout/FilmTextures'
import { AppLayout } from './routes/AppLayout'
import { LandingPage } from './routes/landing/LandingPage'
import { SessionContext, type SessionValue } from './session/SessionContext'

// A signed-out session that can't do anything: nothing is clicked before the app takes over.
const notYet = () => Promise.reject(new Error('Not available while pre-rendering'))
const signedOut: SessionValue = {
  session: SIGNED_OUT,
  sessionEnded: false,
  tags: signedOutTags,
  topTen: signedOutTopTen,
  signInMethods: [],
  signIn: notYet,
  register: notYet,
  signOut: notYet,
  practiceRegistration: false,
  rename: undefined,
  deleteAccount: undefined,
}

/**
 * The landing page's HTML, for #root. `display: contents`, so the wrapper adds no box and the
 * layout matches the app's own render exactly; hidden when the boot script sets
 * `data-shell="off"`.
 */
export function renderLanding(): string {
  const html = renderToString(
    <div className="contents in-data-[shell=off]:hidden">
      <SessionContext value={signedOut}>
        <FilmTextures>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<LandingPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </FilmTextures>
      </SessionContext>
    </div>,
  )
  // The page's <title> is already in index.html's <head>; the copy React leaves inline isn't
  // needed until the app sets it.
  return html.replace(/<title>[^<]*<\/title>/, '')
}
