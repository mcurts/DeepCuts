// The Top Ten sticker on Detail, drawn as a "staff pick" shelf talker: the card a
// rental clerk taped under a favourite tape. Its look lives in TopTenSticker.css.
//
// Two states, two components sharing that look:
// - TopTenSticker: the "Your pick? Add to Top 10" button, while the film isn't in the list.
// - TopTenPick:    "Your pick: #4 in Top 10" once it is, with a small Remove button beside it.
// Neither knows anything about Top Ten data. DetailTopTen decides which to show and what a press
// does, so either design can be replaced without touching any Top Ten logic.
import type { Ref } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import './TopTenSticker.css'

/**
 * The "Add to Top 10" shelf-talker button.
 * @param onPress - Called when it's pressed (not while `pending`).
 * @param pending - True while the add is being saved: the sticker fades and ignores presses.
 * @param ref - Lets the caller move focus here (e.g. after the film is removed again).
 */
export function TopTenSticker({
  onPress,
  pending = false,
  className = '',
  ref,
}: {
  onPress: () => void
  pending?: boolean
  className?: string
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <Button
      ref={ref}
      // Not `isDisabled`: disabling would drop keyboard focus mid-save. A press while pending is
      // ignored here instead (the same pattern as Detail's Save button).
      aria-disabled={pending}
      onPress={() => {
        if (!pending) onPress()
      }}
      data-top-ten-sticker=""
      className={`top-ten-sticker ${className}`}
    >
      <StickerFace kicker="Your pick?" title="Add to Top 10" />
    </Button>
  )
}

/**
 * The shelf talker once the film is in the Top Ten: its rank, and a Remove button.
 * @param rank - The film's place in the list, from 1.
 * @param onRemove - Called when Remove is pressed (not while `pending`).
 * @param pending - True while the removal is being saved: Remove fades and ignores presses.
 * @param ref - The sticker itself, so the caller can move focus to it after an add (it's
 *   focusable only from code, `tabIndex={-1}`); a screen reader then reads "Your pick: #4 in Top
 *   10".
 */
export function TopTenPick({
  rank,
  onRemove,
  pending = false,
  className = '',
  ref,
}: {
  rank: number
  onRemove: () => void
  pending?: boolean
  className?: string
  ref?: Ref<HTMLParagraphElement>
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-1 ${className}`}>
      <p
        ref={ref}
        tabIndex={-1}
        data-top-ten-pick=""
        className="top-ten-sticker top-ten-sticker--pick"
      >
        <StickerFace kicker="Your pick:" title={`#${rank} in Top 10`} />
      </p>
      <Button
        // Visible text "Remove" starts the accessible name, as WCAG 2.5.3 asks.
        aria-label="Remove from Top Ten"
        aria-disabled={pending}
        onPress={() => {
          if (!pending) onRemove()
        }}
        className="inline-flex min-h-11 items-center text-sm text-content-muted underline underline-offset-4 hover:text-content aria-disabled:opacity-70"
      >
        Remove
      </Button>
    </div>
  )
}

/** The card, the strip of tape and the two printed lines, shared by both states. */
function StickerFace({ kicker, title }: { kicker: string; title: string }) {
  return (
    <>
      <span className="top-ten-sticker__card" aria-hidden="true" />
      <span className="top-ten-sticker__tape" aria-hidden="true" />
      {/* The visible text is the accessible name. The space between the two lines keeps the
          words apart in that name (the column layout hides it on screen). */}
      <span className="top-ten-sticker__label">
        <span className="top-ten-sticker__kicker">{kicker}</span>{' '}
        <span className="top-ten-sticker__title">
          <Icon name="star" className="size-5" />
          {title}
        </span>
      </span>
    </>
  )
}
