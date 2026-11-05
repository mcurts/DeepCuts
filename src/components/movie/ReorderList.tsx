// A ranked list in reorder mode: Home's Top Ten and the watchlist on My Lists. Each
// film is a ReorderTile with "move earlier" and "move later" buttons, and can be dragged onto
// another film.
//
// Loaded on demand the first time someone presses "Reorder", so the drag-and-drop code stays out
// of the first visit's bundle. The page owns the toggle and the live region (useReorderMode);
// this component works out each new order, hands it to `onReorder` (an optimistic save,
// useOrderMutation) and keeps keyboard focus on the button that was pressed while its film moves.
import { useQueries } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState } from 'react'
import { movieQueries } from '@/api/queries'
import { summaryOf } from '@/api/tmdb'
import { ReorderTile } from './ReorderTile'
import { SHELF_GRID } from './ShelfSection'
import { moveInList, type RankedList } from '@/domain/ranking'

/** Which button to focus again once a move has shown on screen. */
interface Refocus {
  tmdbId: number
  button: 'earlier' | 'later'
  /** The order the move made; focus moves only once the list shows it. */
  order: RankedList
}

/**
 * A ranked list as reorderable tiles.
 * @param ids - The whole list, in order. Each film's tile appears once its details have loaded
 *   (cached for a day, shared with the rest of the app); the ranks always come from `ids`.
 * @param announce - Says something through the page's polite live region.
 * @param onReorder - Saves a new order (the whole list).
 */
export function ReorderList({
  ids,
  announce,
  onReorder,
}: {
  ids: RankedList
  announce: (message: string) => void
  onReorder: (order: RankedList) => void
}) {
  const details = useQueries({ queries: ids.map((id) => movieQueries.detail(id)) })
  const films = ids.flatMap((_, i) => {
    const movie = details[i]?.data
    return movie ? [{ movie: summaryOf(movie), rank: i + 1 }] : []
  })
  const list = useRef<HTMLOListElement>(null)
  const [dragged, setDragged] = useState<number>()
  // A ref, not state: it only waits for the list to change, and never needs a render of its own.
  const refocus = useRef<Refocus>(undefined)

  /** Moves a film to `toRank`, saves the new order and says where it landed. */
  function move(tmdbId: number, toRank: number, button?: Refocus['button']) {
    const order = moveInList(ids, tmdbId, toRank - 1)
    if (order === ids) return
    onReorder(order)
    const title = films.find((f) => f.movie.id === tmdbId)?.movie.title ?? 'The film'
    announce(`${title} moved to #${order.indexOf(tmdbId) + 1}.`)
    if (button) refocus.current = { tmdbId, button, order }
  }

  // React moves a tile's element to its new place, and a moved element loses keyboard focus. So
  // once the list shows the new order, focus the same button on the moved film, or its other
  // button when that one is gone (a film moved to #1 has no "earlier" button).
  useLayoutEffect(() => {
    const pending = refocus.current
    if (!pending || pending.order.join() !== ids.join()) return
    const tile = list.current?.querySelector(`[data-film="${pending.tmdbId}"]`)
    const button =
      tile?.querySelector<HTMLElement>(`[data-move="${pending.button}"]`) ??
      tile?.querySelector<HTMLElement>('[data-move]')
    button?.focus()
    refocus.current = undefined
  }, [ids])

  return (
    <ol ref={list} className={SHELF_GRID}>
      {films.map(({ movie, rank }) => (
        <li key={movie.id} data-film={movie.id} className="flex">
          <ReorderTile
            movie={movie}
            rank={rank}
            total={ids.length}
            onMove={(toRank) => move(movie.id, toRank, toRank < rank ? 'earlier' : 'later')}
            onDropFilm={(tmdbId) => move(tmdbId, rank)}
            onDragChange={(dragging) => setDragged(dragging ? movie.id : undefined)}
            isDragged={dragged === movie.id}
          />
        </li>
      ))}
    </ol>
  )
}
