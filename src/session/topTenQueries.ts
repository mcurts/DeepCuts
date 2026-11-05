// Top Ten reads and writes through TanStack Query.
//
// Same shape as tagQueries.ts: the cached list's key includes the session scope (signed out, or
// which account), so switching accounts never shows someone else's Top Ten. After a change the
// store's answer *is* the new list, so it goes straight into the cache with no re-fetch.
// Reordering updates the cache first, so a film moves the moment it's pressed.
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TopTenFullError } from '@/domain/topTen'
import { useSession } from './SessionContext'
import { tagScope } from './tagQueries'
import { useOrderMutation } from './useOrderMutation'

/** The query options for the current session's Top Ten, ready for `useQuery`. */
function useTopTenQuery() {
  const { topTen, session } = useSession()
  return queryOptions({
    queryKey: ['topTen', tagScope(session)],
    queryFn: () => topTen.list(),
  })
}

/** The current session's Top Ten, in ranked order: `useTopTen().data` is `[id, …]` once loaded. */
export function useTopTen() {
  return useQuery(useTopTenQuery())
}

/**
 * Adds a film to, or removes it from, the Top Ten: `useChangeTopTen().mutate({ tmdbId, on })`.
 * Afterwards the cached list is the store's answer. A full list rejects with `TopTenFullError`;
 * the list is then re-fetched, because it must have filled up elsewhere (another tab or device).
 */
export function useChangeTopTen() {
  const { topTen } = useSession()
  const queryClient = useQueryClient()
  const { queryKey } = useTopTenQuery()
  return useMutation({
    mutationFn: ({ tmdbId, on }: { tmdbId: number; on: boolean }) =>
      on ? topTen.add(tmdbId) : topTen.remove(tmdbId),
    onSuccess: (list) => queryClient.setQueryData(queryKey, list),
    onError: (error) => {
      if (error instanceof TopTenFullError) return queryClient.invalidateQueries({ queryKey })
    },
  })
}

/**
 * Saves a new order for the Top Ten: `useReorderTopTen().mutate(order)`. Optimistic,
 * with a rollback or a re-fetch on failure (useOrderMutation).
 */
export function useReorderTopTen() {
  const { topTen } = useSession()
  const { queryKey } = useTopTenQuery()
  return useOrderMutation(queryKey, (order) => topTen.reorder(order), 'Your Top Ten')
}
