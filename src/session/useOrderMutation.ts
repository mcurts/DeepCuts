// Saving a new order for a ranked list, shared by the Top Ten and the watchlist.
//
// Optimistic: the cached list becomes the new order at once, so a film moves the moment it's
// pressed, and is put back if the save fails, with a toast saying so. If the list changed
// elsewhere (`ListChangedError`), it's re-fetched instead, so the screen shows what's stored.
// Quick presses queue up (one mutation scope per list), and only the last answer is written to
// the cache, so the films don't jump back while saves catch up.
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { ListChangedError, type RankedList } from '@/domain/ranking'
import { notify } from '@/notify'

/**
 * A mutation that saves a new order: `useOrderMutation(…).mutate(order)`.
 * @param queryKey - The cached list this order replaces.
 * @param save - Stores the order and returns the stored list.
 * @param name - The list in messages, e.g. "Your Top Ten".
 */
export function useOrderMutation(
  queryKey: QueryKey,
  save: (order: RankedList) => Promise<RankedList>,
  name: string,
) {
  const queryClient = useQueryClient()
  const mutationKey = ['reorder', ...queryKey]
  return useMutation({
    mutationKey,
    // Every reorder of this list runs one after another, so an older order can't land last.
    scope: { id: JSON.stringify(mutationKey) },
    mutationFn: save,
    onMutate: async (order) => {
      // Stop a re-fetch in flight from overwriting the new order with the old one.
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<RankedList>(queryKey)
      queryClient.setQueryData(queryKey, order)
      return { previous }
    },
    onSuccess: (list) => {
      // Later presses are still saving: their order is already in the cache, so leave it.
      if (queryClient.isMutating({ mutationKey }) > 1) return
      queryClient.setQueryData(queryKey, list)
    },
    onError: (error, _order, context) => {
      if (error instanceof ListChangedError) {
        notify.error(`${name} changed somewhere else. Here’s the latest order.`)
        return queryClient.invalidateQueries({ queryKey })
      }
      queryClient.setQueryData(queryKey, context?.previous)
      notify.error('Your new order wasn’t saved. Try again.')
    },
  })
}
