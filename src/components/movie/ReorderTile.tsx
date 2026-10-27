// One Top Ten film while the shelf is in reorder mode (ADR-0041): its VHS box with the rank tab,
// its title, and two buttons that move it one place earlier or later. The box can also be dragged
// onto another film; while a film is dragged over it, the box shows the open-slot outline
// (EmptySlot's dashed border, in the accent color) with the rank the film would take there.
//
// The buttons are the main way to reorder: they work with a keyboard, a screen reader and touch
// at 320px. Dragging is an extra for the mouse (and touch browsers with native drag and drop),
// so the drag and drop targets take no focus. The tile isn't a link in this mode, so pressing
// it can never mean both "open the film" and "pick it up".
import { useRef } from 'react'
import { useDrag, useDrop, type DropItem } from 'react-aria-components'
import type { MovieSummary } from '@/api/tmdb'
import { genreTone } from '@/domain/genres'
import { Icon } from '@/components/ui/Icon'
import { VhsBox } from './VhsBox'

/** The drag data type for a Top Ten film, so drops from elsewhere (text, files) are ignored. */
const DRAG_TYPE = 'application/x-deep-cuts-top-ten'

/** Reads the dragged film's id from a drop, or undefined when it isn't a Top Ten film. */
async function droppedFilm(items: DropItem[]): Promise<number | undefined> {
  for (const item of items) {
    if (item.kind === 'text' && item.types.has(DRAG_TYPE)) {
      const id = Number(await item.getText(DRAG_TYPE))
      if (Number.isInteger(id)) return id
    }
  }
  return undefined
}

/**
 * A Top Ten film in reorder mode.
 * @param rank - Its place, 1 first.
 * @param total - How many films the list holds, so the last one has no "later" button.
 * @param onMove - Moves this film to a new rank; called with `rank - 1` or `rank + 1`.
 * @param onDropFilm - Another film was dropped on this one: move that film to this rank.
 */
export function ReorderTile({
  movie,
  rank,
  total,
  onMove,
  onDropFilm,
  onDragChange,
  isDragged = false,
}: {
  movie: Pick<MovieSummary, 'id' | 'title' | 'poster_path' | 'release_date' | 'genre_ids'>
  rank: number
  total: number
  onMove: (toRank: number) => void
  onDropFilm: (tmdbId: number) => void
  /** Told when this film starts (`true`) and stops (`false`) being dragged. */
  onDragChange?: (dragging: boolean) => void
  /** Whether this film is the one being dragged. */
  isDragged?: boolean
}) {
  const dropRef = useRef<HTMLDivElement>(null)
  // `hasDragButton`/`hasDropButton` with no such buttons rendered: only the native mouse and touch
  // drag events are wired up. The keyboard and screen-reader path is the move buttons instead.
  const { dragProps } = useDrag({
    getItems: () => [{ [DRAG_TYPE]: String(movie.id) }],
    getAllowedDropOperations: () => ['move'],
    hasDragButton: true,
    onDragStart: () => onDragChange?.(true),
    onDragEnd: () => onDragChange?.(false),
  })
  const { dropProps, isDropTarget } = useDrop({
    ref: dropRef,
    hasDropButton: true,
    // A film can't be dropped on itself.
    isDisabled: isDragged,
    getDropOperation: (types) => (types.has(DRAG_TYPE) ? 'move' : 'cancel'),
    onDrop: (e) => {
      void droppedFilm(e.items).then((id) => {
        if (id !== undefined && id !== movie.id) onDropFilm(id)
      })
    },
  })

  return (
    <div style={genreTone(movie.genre_ids)} className="flex min-w-0 flex-1 flex-col">
      <div
        ref={dropRef}
        {...dropProps}
        {...dragProps}
        // The box itself is decorative (VhsBox hides it from screen readers); the title and
        // the buttons below carry everything.
        className={`relative cursor-grab active:cursor-grabbing ${isDragged ? 'opacity-40' : ''}`}
      >
        <VhsBox movie={movie} badge={{ kind: 'rank', rank }} />
        {isDropTarget && <DropSlot rank={rank} />}
      </div>
      {/* The rank first, as on the linked tile, so the title reads "#1 The Thing". */}
      <h3 title={movie.title} className="mt-4 line-clamp-2 min-h-14 text-lg font-bold">
        <span className="sr-only">#{rank} </span>
        {movie.title}
      </h3>
      {/* "Earlier" then "later", side by side under the film, matching the shelf's reading order.
          (Spread to the tile's edges, one film's "later" sat beside the next film's "earlier"
          and read as a pair.) The first film has no "earlier" button and the last no "later";
          an empty square keeps the other button in place. */}
      <div className="mt-2 flex gap-2">
        {rank > 1 ? (
          <MoveButton
            direction="earlier"
            label={`Move ${movie.title} earlier`}
            onPress={() => onMove(rank - 1)}
          />
        ) : (
          <span className="size-11" />
        )}
        {rank < total && (
          <MoveButton
            direction="later"
            label={`Move ${movie.title} later`}
            onPress={() => onMove(rank + 1)}
          />
        )}
      </div>
    </div>
  )
}

/**
 * What a tile shows while a dragged film is over it: the open-slot look (EmptySlot's dashed
 * border and big mark, in the accent color), saying the rank the film will take if dropped.
 * Covers the box; decorative, because only pointer users see a drag.
 */
export function DropSlot({ rank }: { rank: number }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 border-3 border-dashed border-accent bg-surface p-3 text-center"
    >
      <span className="font-display text-7xl leading-none text-fg">#{rank}</span>
      <span className="font-label text-sm text-fg-muted">Drop to move here</span>
    </div>
  )
}

/** A 44px square arrow button (WCAG 2.5.8 and ADR-0009's 44px targets). */
function MoveButton({
  direction,
  label,
  onPress,
}: {
  direction: 'earlier' | 'later'
  label: string
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      // The shelf finds the button again after the move, to keep focus on it.
      data-move={direction}
      onClick={onPress}
      className="flex size-11 items-center justify-center rounded-button border-2 border-button-secondary-border bg-button-secondary-bg text-button-secondary-fg hover:border-accent"
    >
      <Icon name={direction === 'earlier' ? 'back' : 'forward'} />
    </button>
  )
}
