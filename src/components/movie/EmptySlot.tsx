// An empty place on a shelf, drawn as a dashed outline the size of a VHS box (ADR-0040 §9): the
// next open Top Ten slot, or an empty watchlist or Discovery shelf. It can carry the one action
// that fills it (Home's slots put the cursor in the header's search, focusHeaderSearch).
import type { ReactNode } from 'react'

/**
 * A dashed, box-shaped slot with a big mark (e.g. "#4"), a title and a note. With `onPress` the
 * whole slot is one button, at least as tall as a VHS box, so it's an easy target.
 */
export function EmptySlot({
  mark,
  title,
  note,
  onPress,
}: {
  mark?: string
  title: string
  note?: ReactNode
  onPress?: () => void
}) {
  const body = (
    <>
      {/* The design draws the mark in the outline's color, but at 2.2:1 that fails even the 3:1
          for large text, so it's in the muted text color (dust, 7:1). */}
      {mark && (
        <span aria-hidden="true" className="font-display text-7xl leading-none text-fg-muted">
          {mark}
        </span>
      )}
      <span className="font-display text-xl tracking-widest case-display">{title}</span>
      {note && <span className="font-label text-sm text-fg-muted">{note}</span>}
    </>
  )
  // The VHS box's own proportions (1:1.7, --vhs-aspect in VhsBox.css), so the slot lines up with
  // its row.
  const shape =
    'flex aspect-[1/1.7] w-full flex-col items-center justify-center gap-2 border-3 border-dashed border-border-strong p-3 text-center'
  return onPress ? (
    <button type="button" onClick={onPress} className={`${shape} text-fg hover:border-accent`}>
      {body}
    </button>
  ) : (
    <div className={`${shape} text-fg`}>{body}</div>
  )
}
