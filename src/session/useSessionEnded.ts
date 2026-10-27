// Notices when the server has ended a passkey session (issue #18, ADR-0031), so the screen stops
// looking signed in. Used by AppSessionProvider, which does the signing out; the route guards
// (RequireAccount, IndexRoute) then send the person to Sign in, and back here afterwards.
import { useEffect } from 'react'
import { onSessionEnded } from '@/adapters/cloudflare/sessionEnded'
import type { Session } from '@/adapters/SessionProvider'
import { notify, SESSION_ENDED } from '@/notify'

/**
 * While a passkey account is signed in, waits for an accounts API call to answer 401, then says
 * so once and calls `end`.
 * @param end - Switches the app to signed out. Keep it stable (useCallback), or the listener is
 *   replaced on every render.
 */
export function useSessionEnded(session: Session, end: () => void) {
  // Only passkey sessions live on the server; the demo and practice accounts can't end this way.
  const passkey = session.kind === 'account' && session.account.method === 'passkey'
  useEffect(() => {
    if (!passkey) return
    // Several requests can fail together (e.g. Home loads the lists and the Top Ten at once):
    // one message and one sign-out is enough.
    let ended = false
    return onSessionEnded(() => {
      if (ended) return
      ended = true
      notify.error(SESSION_ENDED)
      end()
    })
  }, [passkey, end])
}
