// `/` (ADR-0035): the landing page when signed out, Home when signed in. Both show the same three
// panels (Top Ten, Watchlist, Discovery); the landing explains them, Home fills them.
import { useState } from 'react'
import { Navigate } from 'react-router'
import { useSession } from '@/session/SessionContext'
import { HomePage } from './discover/DiscoverPage'
import { LandingPage } from './landing/LandingPage'

/** Picks the page for `/` from the session. */
export function IndexRoute() {
  const { session, sessionEnded } = useSession()
  // Whether Home was showing when this route mounted. If the server then ends the session
  // (issue #18), Home goes to Sign in and returns here, like the guarded pages (RequireAccount).
  // A later visit to `/` while signed out mounts afresh and shows the landing page as usual.
  const [startedSignedIn] = useState(session.kind === 'account')
  if (session.kind !== 'account' && startedSignedIn && sessionEnded)
    return <Navigate to="/sign-in" replace state={{ from: '/' }} />
  return session.kind === 'account' ? <HomePage /> : <LandingPage />
}
