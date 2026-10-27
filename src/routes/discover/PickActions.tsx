// The quick-action strip under a Discovery pick (issue #76; owner picked layout A with stamps,
// 2026-10-15): three buttons in one row, Want / Like / Nope (ADR-0050), that tag the film at once without
// opening Detail. Once one is used, the strip becomes an Undo button (the box shows the stamp,
// CassetteCard). It sits after the tile's link, never inside it, so there's no interactive
// element nested in another, and the keyboard goes tile link → its actions → the next tile.
import { useEffect, useRef, type CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { QUICK_ACTIONS, quickAction, type QuickAction } from '@/components/movie/quickActions'
import { tagColor } from '@/components/movie/tagDisplay'

/**
 * Quick actions for one pick.
 * @param stamped - The action just done on it, if any: shows Undo instead of the strip.
 * @param busy - A change is saving: presses are ignored. (aria-disabled, not disabled, so the
 *   pressed button keeps keyboard focus.)
 * @param onAct - Called with the pressed action's tag.
 * @param onUndo - Called by the Undo button.
 */
export function PickActions({
  title,
  stamped,
  busy = false,
  onAct,
  onUndo,
}: {
  title: string
  stamped?: QuickAction['tag'] | undefined
  busy?: boolean
  onAct: (tag: QuickAction['tag']) => void
  onUndo: () => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const last = useRef(stamped)

  // When the strip and Undo swap, the pressed button disappears; put focus on what replaced it
  // (Undo, or after an undo the button that was pressed). Only when focus was here (or was lost
  // with the old button), so undoing from the toast doesn't pull focus back to the shelf.
  useEffect(() => {
    const previous = last.current
    last.current = stamped
    const el = root.current
    if (previous === stamped || !el) return
    const active = document.activeElement
    if (active && active !== document.body && !el.contains(active)) return
    const target = stamped
      ? el.querySelector<HTMLElement>('[data-undo]')
      : el.querySelector<HTMLElement>(`[data-tag="${previous}"]`)
    target?.focus()
  }, [stamped])

  return (
    <div ref={root} className="mt-3">
      {stamped ? (
        <button
          type="button"
          data-undo=""
          onClick={() => !busy && onUndo()}
          aria-disabled={busy || undefined}
          className="min-h-11 w-full animate-pop-in border-2 border-dashed border-accent text-sm font-bold text-accent hover:bg-accent hover:text-fg-on-accent aria-disabled:cursor-wait"
        >
          Undo{' '}
          <span className="sr-only">
            {quickAction(stamped).label} for {title}
          </span>
        </button>
      ) : (
        <div role="group" aria-label={`Quick actions for ${title}`} className="flex animate-pop-in">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.tag}
              type="button"
              data-tag={action.tag}
              onClick={() => !busy && onAct(action.tag)}
              aria-disabled={busy || undefined}
              // The visible label is short; the accessible name and the tooltip are in full.
              aria-label={`${action.label} ${title}`}
              title={action.label}
              style={tagColor(action.tag) as CSSProperties}
              // Each button draws all four borders, and the second and third overlap the one before by a
              // border's width, so the strip still reads as one row with single 2px dividers. The
              // hovered or focused button is lifted above its neighbours, so its whole outline shows
              // in the tag's colour (with shared dividers, its left edge was the previous button's).
              className="relative flex min-h-11 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-tag-toggle border-2 border-tag-toggle-border bg-tag-toggle-bg px-0.5 text-xs font-bold text-tag-toggle-fg not-first:-ml-0.5 hover:z-10 hover:border-(--tag) focus-visible:z-10 aria-disabled:cursor-wait aria-disabled:opacity-60"
            >
              <Icon name={action.icon} className="size-5 shrink-0 text-(--tag)" />
              <span aria-hidden="true">{action.short}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
