// Starts the app once the session is known (issue #19, ADR-0055). main.tsx calls this before the
// first paint, so the app never flashes a signed-out state for someone who is signed in. When the
// session check fails (it timed out, or the accounts server answered with an error), it shows the
// "can't reach your account" screen with a retry instead of a blank page or the signed-out landing
// page.
//
// It also waits for the first page's code (`ready`), so the first render is the whole page: at `/`
// it replaces the pre-rendered landing page in index.html (ADR-0057) in one step, never with an
// empty frame in between.
import { StrictMode, type ReactNode } from 'react'
import type { Root } from 'react-dom/client'
import type { Session, SessionProvider } from '@/adapters/SessionProvider'
import { AccountUnreachable } from '@/components/layout/AccountUnreachable'

/**
 * Reads the session and renders the app into `root`; if the session can't be read, renders the
 * "can't reach your account" screen, whose Try again button reads it again.
 * @param renderApp - Builds the whole app for the session that was read.
 * @param ready - Resolves when the app can render its first page in full (main.tsx: the router has
 *   loaded the page's code). Waited for alongside the session, not after it. Must not reject.
 * @returns Resolves once something is on screen.
 */
export async function startApp(
  root: Root,
  provider: SessionProvider,
  renderApp: (session: Session) => ReactNode,
  ready: Promise<unknown> = Promise.resolve(),
): Promise<void> {
  // One attempt: true when the app rendered, false when the session couldn't be read.
  async function attempt() {
    try {
      const [session] = await Promise.all([provider.getSession(), ready])
      root.render(renderApp(session))
      return true
    } catch {
      return false
    }
  }
  if (await attempt()) return
  root.render(
    <StrictMode>
      <AccountUnreachable onRetry={attempt} />
    </StrictMode>,
  )
}
