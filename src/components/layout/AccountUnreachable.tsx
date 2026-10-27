// The "can't reach your account" screen (issue #19): shown instead of the app when the startup
// session check times out or the accounts server answers with an error, so a signed-in person is
// never shown as signed out, and the page is never left blank. It renders outside the router and
// the session (main.tsx, startup.tsx), so it uses no links, hooks or session data: only a retry
// that runs the session check again. Mobile-first (ADR-0021); built from EmptyState and the
// existing button tokens.
import { useState } from 'react'
import { Button } from 'react-aria-components'
import { EmptyState } from '@/components/ui/EmptyState'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Logo } from './Logo'

/**
 * The full-page "can't reach your account" message with a Try again button.
 * @param onRetry - Runs the session check again. Resolves `true` when it worked (the app then
 *   replaces this screen) and `false` when it still can't reach the server, so this says so.
 */
export function AccountUnreachable({ onRetry }: { onRetry: () => Promise<boolean> }) {
  const [pending, setPending] = useState(false)
  // How many retries have failed, so a repeat failure is announced again (the status text
  // changes) instead of staying silent.
  const [failures, setFailures] = useState(0)

  async function retry() {
    setPending(true)
    const ok = await onRetry()
    // On success this screen is replaced by the app, so there's nothing left to update.
    if (ok) return
    setFailures((n) => n + 1)
    setPending(false)
  }

  // Read out by screen readers when it changes (role="status").
  const status = pending
    ? 'Trying again…'
    : failures === 0
      ? ''
      : `Still no answer${failures > 1 ? ` (${failures} tries)` : ''}. Try again in a minute.`

  return (
    <main id="main" className="mx-auto grid w-full max-w-md content-start gap-4 px-5 py-10">
      {/* React 19 moves <title> into the document head. */}
      <title>Can’t reach your account · Deep Cuts</title>
      <Logo className="h-9 w-auto" />
      <div>
        <Eyebrow>Your account</Eyebrow>
        <h1 className="font-display text-4xl leading-none tracking-wide case-display">
          Can’t reach your account
        </h1>
      </div>
      <EmptyState>
        Deep Cuts couldn’t check whether you’re signed in. Your lists are safe. Check your
        connection, then try again.
      </EmptyState>
      <Button
        onPress={retry}
        isPending={pending}
        className="flex min-h-12 w-full items-center justify-center rounded-button bg-button-primary-bg font-display text-base tracking-widest text-button-primary-fg case-display hover:bg-button-primary-bg-hover data-pending:opacity-70"
      >
        Try again
      </Button>
      <p role="status" className="text-sm text-fg-muted empty:hidden">
        {status}
      </p>
    </main>
  )
}
