// Tag reads and writes through TanStack Query.
//
// TanStack Query caches each read under a "query key" and re-fetches when that key is
// invalidated. Keys include a scope (signed out, or which account), so switching accounts never
// shows the other store's cached tags.
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { Session } from '@/adapters/SessionProvider'
import type { TagRepository } from '@/adapters/TagRepository'
import { restoreSteps, type SystemTag } from '@/domain/tagRules'
import { useSession } from './SessionContext'
import { useOrderMutation } from './useOrderMutation'

/**
 * The tag queries for one store, ready to pass to `useQuery`.
 * Every key starts with `['tags', scope]`, so a single invalidation refreshes them all.
 */
export function tagQueries(repo: TagRepository, scope: string) {
  return {
    /** The tags on one film (Detail page, Search rows). */
    forMovie: (tmdbId: number) =>
      queryOptions({
        queryKey: ['tags', scope, 'movie', tmdbId],
        queryFn: () => repo.getTags(tmdbId),
      }),
    /** The film ids on one list, newest first; the watchlist in its saved order. */
    list: (tag: SystemTag) =>
      queryOptions({ queryKey: ['tags', scope, 'list', tag], queryFn: () => repo.list(tag) }),
    /** Every tag record, e.g. to count the films someone has tagged. */
    all: () => queryOptions({ queryKey: ['tags', scope, 'all'], queryFn: () => repo.exportAll() }),
    /** Film ids to keep out of feeds (disliked films). */
    feedExclusions: () =>
      queryOptions({
        queryKey: ['tags', scope, 'feedExclusions'],
        queryFn: () => repo.feedExclusions(),
      }),
  }
}

/** The cache scope for a session's tags: `signedOut`, or one per account (e.g. `passkey:abc`). */
export const tagScope = (session: Session) =>
  session.kind === 'account' ? `${session.account.method}:${session.account.id}` : session.kind

/** The tag queries for the current session's store. */
export function useTagQueries() {
  const { tags, session } = useSession()
  return tagQueries(tags, tagScope(session))
}

/**
 * Turns a tag on or off: `useSetTag().mutate({ tmdbId, tag, on })`.
 * Afterwards the film's tags update at once, and every other tag query re-fetches, because one
 * change can move a film between lists (e.g. Dislike removes Like).
 */
export function useSetTag() {
  const { tags, session } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ tmdbId, tag, on }: { tmdbId: number; tag: SystemTag; on: boolean }) =>
      tags.setTag(tmdbId, tag, on),
    onSuccess: (next, { tmdbId }) => {
      // Show the new tags on this film straight away, without waiting for a re-fetch…
      queryClient.setQueryData(tagQueries(tags, tagScope(session)).forMovie(tmdbId).queryKey, next)
      // …then refresh lists, counts and exclusions. Returning the promise keeps the mutation
      // "pending" until that's done.
      const scope = tagScope(session)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tags', scope] }),
        // Invalidating only re-fetches what's on screen. Detail is its own route, so Home's lists
        // aren't, and Home would build Discovery from the old ones and hold that shelf, tagged
        // film and all, before their re-fetch landed. So fetch the lists, counts and exclusions
        // now, while Save is still pending. Per-film tags are skipped: there can be dozens
        // cached, and each refreshes when its page opens.
        queryClient.refetchQueries({
          queryKey: ['tags', scope],
          type: 'inactive',
          predicate: (query) => query.queryKey[2] !== 'movie',
        }),
      ])
    },
  })
}

/**
 * Saves a new order for the watchlist: `useReorderWatchlist().mutate(order)`.
 * Optimistic, with a rollback or a re-fetch on failure (useOrderMutation). Home's watchlist shelf
 * and the scorer read the same cached list, so they follow the new order at once.
 */
export function useReorderWatchlist() {
  const { tags } = useSession()
  const { queryKey } = useTagQueries().list('watchlist')
  return useOrderMutation(queryKey, (order) => tags.reorder('watchlist', order), 'Your watchlist')
}

/**
 * One-tap tagging with undo, for Discovery's quick actions: `const undo = await quickTag(id, tag)`
 * turns the tag on (with the usual rules) and returns a function that puts back exactly the tags
 * the film had before (restoreSteps), once; calling it again does nothing (unless the last try
 * failed, so it can be retried). Both refresh every tag
 * query, like useSetTag. Either rejects if the store does, leaving the film's tags as they were.
 */
export function useQuickTag() {
  const { tags, session } = useSession()
  const queryClient = useQueryClient()
  const scope = tagScope(session)
  return useCallback(
    async (tmdbId: number, tag: SystemTag): Promise<() => Promise<void>> => {
      const refresh = () => queryClient.invalidateQueries({ queryKey: ['tags', scope] })
      const before = await tags.getTags(tmdbId)
      const after = await tags.setTag(tmdbId, tag, true)
      await refresh()
      let undone = false
      return async () => {
        if (undone) return
        undone = true
        try {
          for (const step of restoreSteps(after, before)) {
            await tags.setTag(tmdbId, step.tag, step.on)
          }
        } catch (error) {
          undone = false
          throw error
        }
        await refresh()
      }
    },
    [tags, scope, queryClient],
  )
}
