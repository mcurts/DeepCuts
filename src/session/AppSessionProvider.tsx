// Provides the session to the whole app (ADR-0016, ADR-0025, ADR-0034).
//
// It owns two things: the session provider (who is signed in) and the current session. From the
// session it picks the tag store and the Top Ten store (ADR-0036), which always live together: a passkey account's lists live on the server (ADR-0031), the
// demo and practice accounts' lists in this browser, and signed out there is an empty store that
// refuses writes. Nothing moves between stores: there is no guest or device profile to move from.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createCloudflareTagRepository } from '@/adapters/cloudflare/CloudflareTagRepository'
import { createCloudflareTopTenRepository } from '@/adapters/cloudflare/CloudflareTopTenRepository'
import { createMockSessionProvider } from '@/adapters/local/MockSessionProvider'
import { createLocalTagRepository } from '@/adapters/local/LocalTagRepository'
import { createLocalTopTenRepository } from '@/adapters/local/LocalTopTenRepository'
import { saveSignedInHint } from '@/adapters/local/signedInHint'
import { SIGNED_OUT, type Session, type SessionProvider } from '@/adapters/SessionProvider'
import { signedOutTags, signedOutTopTen } from '@/adapters/signedOutTags'
import type { TagRepository } from '@/adapters/TagRepository'
import type { TopTenRepository } from '@/adapters/TopTenRepository'
import { SessionContext, type SessionValue } from './SessionContext'
import { useSessionEnded } from './useSessionEnded'

interface Props {
  children: ReactNode
  /** Resolved before the first render (see main.tsx), so the tree never renders without a session. */
  initialSession?: Session
  /** Defaults to the local mock provider; tests inject one that fails, for example. */
  provider?: SessionProvider
  /** Opens a demo or practice account's tag store in this browser, under `key`. */
  createLocalTags?: (key: string) => TagRepository
  /** Opens a passkey account's tag store on the server (ADR-0031); tests inject a fake. */
  createRemoteTags?: () => TagRepository
  /** Opens a demo or practice account's Top Ten in this browser, under `key`. */
  createLocalTopTen?: (key: string) => TopTenRepository
  /** Opens a passkey account's Top Ten on the server; tests inject a fake. */
  createRemoteTopTen?: () => TopTenRepository
}

// Each on-device account's tags and Top Ten live under their own storage keys.
const accountKey = (id: string) => `account-${id}-tags`
const topTenKey = (id: string) => `account-${id}-top-ten`
const openLocal = (key: string) => createLocalTagRepository(undefined, undefined, key)
const openLocalTopTen = (key: string) => createLocalTopTenRepository(key)

/** Wrap the app in this so every screen can call `useSession()`. */
export function AppSessionProvider({
  children,
  initialSession = SIGNED_OUT,
  provider: injected,
  createLocalTags = openLocal,
  createRemoteTags = createCloudflareTagRepository,
  createLocalTopTen = openLocalTopTen,
  createRemoteTopTen = createCloudflareTopTenRepository,
}: Props) {
  const queryClient = useQueryClient()
  // Created once and kept for the life of the app.
  const [provider] = useState(() => injected ?? createMockSessionProvider())
  const [session, setSession] = useState(initialSession)
  // True once the server ended the passkey session (issue #18), until the next sign-in or
  // sign-out. The route guards read it to send the person to Sign in rather than the landing page.
  const [sessionEnded, setSessionEnded] = useState(false)
  const endSession = useCallback(() => {
    setSessionEnded(true)
    setSession(SIGNED_OUT)
  }, [])
  useSessionEnded(session, endSession)
  // Tells the next visit's boot script whether to hide the pre-rendered landing page (ADR-0057).
  // Every route to a session change (sign-in, sign-out, the server ending it) passes through here.
  const signedIn = session.kind === 'account'
  useEffect(() => saveSignedInHint(signedIn), [signedIn])

  const value = useMemo<SessionValue>(() => {
    // The tag store for the current session.
    const tags =
      session.kind === 'signedOut'
        ? signedOutTags
        : session.account.method === 'passkey'
          ? createRemoteTags()
          : createLocalTags(accountKey(session.account.id))
    // The Top Ten lives wherever the tags do.
    const topTen =
      session.kind === 'signedOut'
        ? signedOutTopTen
        : session.account.method === 'passkey'
          ? createRemoteTopTen()
          : createLocalTopTen(topTenKey(session.account.id))

    // Switches to the next session, and resolves with it. Cached tag and Top Ten queries belong
    // to the old stores, so they're all refreshed (their keys include the account id, see
    // tagQueries.ts).
    async function become(next: Session) {
      setSession(next)
      setSessionEnded(false)
      await queryClient.invalidateQueries({ queryKey: ['tags'] })
      await queryClient.invalidateQueries({ queryKey: ['topTen'] })
      return next
    }

    return {
      session,
      sessionEnded,
      tags,
      topTen,
      signInMethods: provider.signInMethods(),
      signIn: async (method) => become(await provider.signIn(method)),
      register: async (details) => become(await provider.register(details)),
      // The account keeps its lists; this device is signed out.
      signOut: async () => {
        await become(await provider.signOut())
      },
      practiceRegistration: provider.practiceRegistration,
      rename: provider.rename
        ? async (name) => setSession((await provider.rename?.(name)) ?? session)
        : undefined,
      deleteAccount: provider.deleteAccount
        ? async () => {
            await become((await provider.deleteAccount?.()) ?? SIGNED_OUT)
          }
        : undefined,
    }
  }, [
    session,
    sessionEnded,
    provider,
    createLocalTags,
    createRemoteTags,
    createLocalTopTen,
    createRemoteTopTen,
    queryClient,
  ])

  return <SessionContext value={value}>{children}</SessionContext>
}
