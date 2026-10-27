// The Sign-in page (/sign-in, ADR-0025): lists every sign-in method the session provider offers
// (today only the demo account), links to registration (ADR-0031), then returns to the page
// sign-in started from.
import { useState } from 'react'
import { Button } from 'react-aria-components'
import { Link, Navigate, useNavigate } from 'react-router'
import type { SignInMethodId } from '@/adapters/SessionProvider'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Icon } from '@/components/ui/Icon'
import { useReturnPath } from './useReturnPath'
import { useRouteFocus } from '@/hooks/useRouteFocus'
import { notify, notifySignedIn } from '@/notify'
import { useSession } from '@/session/SessionContext'
import { AuthLayout } from './AuthLayout'

/** The sign-in page (ADR-0025, approved design): every method the session adapter offers. */
export function SignInPage() {
  useRouteFocus()
  const { session, signInMethods, signIn } = useSession()
  const navigate = useNavigate()
  const from = useReturnPath()
  // Which method is signing in right now (disables the buttons).
  const [pending, setPending] = useState<SignInMethodId | null>(null)

  // Arriving already signed in goes to the account page. (Not after signing in here: then the
  // page returns to where sign-in started, and `pending` stays set until it does.)
  if (session.kind === 'account' && pending === null) return <Navigate to="/account" replace />

  // Signs in, then goes back where sign-in started; the toast confirms who's signed in and stays
  // up across that navigation. On failure nothing changes and an error toast says so.
  async function start(method: SignInMethodId) {
    setPending(method)
    try {
      notifySignedIn(await signIn(method))
      navigate(from, { replace: true })
    } catch {
      notify.error('Sign-in didn’t finish. Nothing was changed. Try again.')
      setPending(null)
    }
  }

  return (
    <AuthLayout title="Sign in">
      <div>
        <Eyebrow>Your account</Eyebrow>
        <h1 className="font-display text-4xl leading-none tracking-wide case-display">
          Sign in to Deep Cuts
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Keep your lists in your account instead of a single browser.
        </p>
      </div>

      {/* One button per sign-in method. */}
      <ul className="grid gap-3">
        {signInMethods.map((m) => (
          <li key={m.id}>
            <Button
              onPress={() => start(m.id)}
              isPending={pending !== null}
              className="flex min-h-13 w-full items-center gap-3 rounded-button border-2 border-button-secondary-border bg-button-secondary-bg px-3.5 text-left text-sm font-bold hover:border-accent data-pending:opacity-70"
            >
              <span className="grid size-8 shrink-0 place-items-center bg-surface-overlay text-accent">
                <Icon name="user" className="size-4.5" />
              </span>
              <span>
                {m.label}
                <small className="block text-sm font-normal text-fg-muted">{m.description}</small>
              </span>
            </Button>
          </li>
        ))}
      </ul>
      <p role="status" className="text-sm text-fg-muted empty:hidden">
        {pending ? 'Signing you in…' : ''}
      </p>

      <p className="text-sm text-fg-muted">
        New here? {/* Passes `from` along, so registering also returns where sign-in started. */}
        <Link to="/register" state={{ from }} className="text-accent underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
