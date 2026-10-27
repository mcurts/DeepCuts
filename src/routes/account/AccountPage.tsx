// The Account page (/account), signed in only (ADR-0034): the account, its tagged-film count, and
// sign out (with a confirm step). A passkey account can also change its name and delete itself
// (AccountSettings.tsx, ADR-0031).
//
// Phones reach it from the header chip. From `md` the header's account menu covers the lists and
// sign out, so there this page is just "Account settings" (who you are, change name, delete), and
// the menu links it for passkey accounts only (owner decision 2026-10-12).
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import { SIGNED_IN_WITH, type Account } from '@/adapters/SessionProvider'
import { Avatar } from '@/components/layout/AccountChip'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Icon } from '@/components/ui/Icon'
import { SIGN_OUT_MESSAGES, withToast } from '@/notify'
import { useSession } from '@/session/SessionContext'
import { AccountSettings } from './AccountSettings'
import { useTagQueries } from '@/session/tagQueries'

/**
 * The signed-in account (ADR-0025, ADR-0034). Copy never implies cross-device sync for the
 * on-device demo and practice accounts (ADR-0013).
 */
export function AccountPage() {
  const { session } = useSession()
  // The route guard (RequireAccount) sends signed-out visitors to sign in before this renders.
  return session.kind === 'account' ? <SignedIn account={session.account} /> : null
}

// Signed in: who you are, how many films you've tagged, and sign out.
function SignedIn({ account }: { account: Account }) {
  const { signOut } = useSession()
  // Distinct films (a film with two tags counts once).
  const films = new Set(useQuery(useTagQueries().all()).data?.map((r) => r.tmdbId)).size
  // Sign out takes two presses ("Sign out", then "Yes, sign out"), so it can't happen by accident.
  const [confirming, setConfirming] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const askRef = useRef<HTMLButtonElement>(null)
  // After "Sign out", focus moves to the confirm button the press revealed.
  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
  }, [confirming])

  // Once signed out, the route guard (RequireAccount) takes this page to the landing page; the
  // toast confirms it there.
  async function confirmSignOut() {
    await withToast(signOut, SIGN_OUT_MESSAGES)
  }

  return (
    <>
      <title>Account · Deep Cuts</title>
      <Eyebrow>Your account</Eyebrow>
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={account.name} large />
        <div>
          <h1 className="font-display text-3xl leading-tight tracking-wide case-display">
            {account.name}
          </h1>
          <p className="text-sm text-fg-muted">{SIGNED_IN_WITH[account.method]}</p>
        </div>
      </div>

      <div className="grid items-stretch gap-3 md:grid-cols-2">
        {/* Phones only: from `md` the account menu shows the count and links My Lists. */}
        <section
          aria-labelledby="lists-heading"
          className="grid content-start gap-2.5 rounded-card border-2 border-card-border bg-card-bg p-4 md:hidden"
        >
          <h2 id="lists-heading" className="font-display text-2xl tracking-wide case-display">
            Your lists
          </h2>
          <p className="text-sm text-fg-muted">
            {films} {films === 1 ? 'film' : 'films'} tagged across Want to see, More like this and
            Less like this.
          </p>
          {/* Demo and practice accounts live on this device only (ADR-0025, ADR-0031). */}
          {(account.method === 'demo' || account.method === 'practice') && (
            <p className="text-sm text-fg-muted">
              Practice account: lists are kept on this device. A real account will sync them between
              devices.
            </p>
          )}
          <Link
            to="/lists"
            className="flex min-h-11 w-fit items-center gap-1.5 text-sm font-bold text-accent"
          >
            Open My Lists <Icon name="arrow" className="size-4" />
          </Link>
        </section>

        {/* Phones only: from `md` Sign out is in the account menu. */}
        <section
          aria-labelledby="signout-heading"
          className="grid content-start gap-2.5 rounded-card border-2 border-card-border bg-card-bg p-4 md:hidden"
        >
          <h2 id="signout-heading" className="font-display text-2xl tracking-wide case-display">
            Sign out
          </h2>
          <p className="text-sm text-fg-muted">
            Your lists stay in your account. You’ll return to the welcome page.
          </p>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                ref={confirmRef}
                onPress={confirmSignOut}
                className="flex h-11 items-center rounded-button border-2 border-button-secondary-border bg-button-secondary-bg px-3.5 font-display text-base tracking-widest text-button-secondary-fg case-display"
              >
                Yes, sign out
              </Button>
              <Button
                onPress={() => {
                  setConfirming(false)
                  // Return focus to "Sign out" once it's back on screen (next frame).
                  requestAnimationFrame(() => askRef.current?.focus())
                }}
                className="flex h-11 items-center px-2 text-sm font-bold text-accent"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              ref={askRef}
              onPress={() => setConfirming(true)}
              className="flex h-11 w-36 items-center justify-center rounded-button border-2 border-button-secondary-border bg-button-secondary-bg font-display text-base tracking-widest text-button-secondary-fg case-display"
            >
              Sign out
            </Button>
          )}
        </section>

        {/* Passkey accounts can be renamed and deleted (ADR-0031 A2b). */}
        {account.method === 'passkey' && <AccountSettings name={account.name} />}
      </div>
    </>
  )
}
