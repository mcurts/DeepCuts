// Tests for sessions: signed out reads nothing and saves nothing; each account has its
// own lists; and the query cache follows the current session.
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalTagRepository } from '@/adapters/local/LocalTagRepository'
import { createMockSessionProvider } from '@/adapters/local/MockSessionProvider'

const accountTags = () => createLocalTagRepository(undefined, undefined, 'account-demo-tags')
import { AppSessionProvider } from './AppSessionProvider'
import { useSession } from './SessionContext'
import { useSetTag, useTagQueries } from './tagQueries'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <AppSessionProvider>{children}</AppSessionProvider>
    </QueryClientProvider>
  )
}

function useHarness() {
  const session = useSession()
  const setTag = useSetTag()
  const queries = useTagQueries()
  const liked = useQuery(queries.list('liked'))
  const movie5 = useQuery(queries.forMovie(5))
  const excluded = useQuery(queries.feedExclusions())
  return { ...session, setTag, liked: liked.data, movie5: movie5.data, excluded: excluded.data }
}

const renderHarness = () => renderHook(useHarness, { wrapper })

// Reset through the adapters: direct storage access is lint-banned outside src/adapters/local/.
beforeEach(async () => {
  await createMockSessionProvider().signOut()
  await accountTags().clear()
})
afterEach(() => vi.restoreAllMocks())

describe('session', () => {
  it('starts signed out, with empty lists, and refuses to save anything', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { result } = renderHarness()
    expect(result.current.session).toEqual({ kind: 'signedOut' })
    await waitFor(() => expect(result.current.liked).toEqual([]))
    await expect(
      act(() => result.current.setTag.mutateAsync({ tmdbId: 5, tag: 'liked', on: true })),
    ).rejects.toThrow('Sign in to save films.')
    expect(setItem).not.toHaveBeenCalled()
  })

  it('signing in opens that account’s own lists; nothing moves in', async () => {
    await accountTags().setTag(4, 'liked', true)
    const { result } = renderHarness()
    await act(() => result.current.signIn('demo'))
    expect(result.current.session).toMatchObject({
      kind: 'account',
      account: { name: 'Mike Curts' },
    })
    await waitFor(() => expect(result.current.liked).toEqual([4]))
  })

  it('a dislike updates the movie tags and the feed exclusions', async () => {
    const { result } = renderHarness()
    await act(() => result.current.signIn('demo'))
    await act(() => result.current.setTag.mutateAsync({ tmdbId: 5, tag: 'disliked', on: true }))
    await waitFor(() => expect(result.current.excluded).toEqual(new Set([5])))
    expect(result.current.movie5).toEqual(new Set(['disliked']))
  })

  it('the account keeps its lists through sign out and back in', async () => {
    const { result } = renderHarness()
    await act(() => result.current.signIn('demo'))
    await act(() => result.current.setTag.mutateAsync({ tmdbId: 8, tag: 'liked', on: true }))
    await act(() => result.current.signOut())
    expect(result.current.session).toEqual({ kind: 'signedOut' })
    await waitFor(() => expect(result.current.liked).toEqual([]))
    await act(() => result.current.signIn('demo'))
    await waitFor(() => expect(result.current.liked).toEqual([8]))
  })

  it('useSession outside the provider fails loudly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(useSession)).toThrow(/AppSessionProvider/)
  })
})
