// "Why this pick?" under a Discovery pick (ADR-0040 §8): a short button that opens a small bubble
// with the full reason ("Same director and writer as The Thing", pickReason.ts).
//
// The full sentence took too much room on phone tiles, so it lives behind a short, fixed label
// (owner, 2026-10-26). Tap, click or Enter opens it; Escape or tapping away closes it. A popover
// rather than a hover tooltip because touch has no hover, and the app is mobile-first (ADR-0021).
// The whole tile is a link, so this button sits just after it, above the quick actions: a button
// inside a link isn't allowed. React Aria's DialogTrigger gives it focus handling and Escape.
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { Icon } from '@/components/ui/Icon'

/**
 * The "Why this pick?" button and its bubble.
 * @param reason - The full sentence from the scorer's facts.
 * @param title - The film's title, so each button's name says which pick it explains.
 */
export function PickReason({ reason, title }: { reason: string; title: string }) {
  return (
    <DialogTrigger>
      {/* 44px tall at least, for touch, like the quick actions below it. The dotted underline
          and the icon say it opens something. */}
      <Button className="mt-2 flex min-h-11 cursor-pointer items-center gap-1 self-start font-label text-sm text-accent underline decoration-dotted underline-offset-4 hover:decoration-solid">
        {/* Every tile's button reads the same, so screen readers also hear which film. The space
            sits outside the hidden span: name computation drops a span's leading space. */}
        Why this pick? <span className="sr-only">({title})</span>
        <Icon name="info" className="size-4 shrink-0" />
      </Button>
      <Popover
        placement="bottom start"
        offset={4}
        className="max-w-64 rounded-popover border-2 border-popover-border bg-popover-bg p-3 shadow-popover data-entering:animate-pop-in data-exiting:animate-pop-out"
      >
        <Dialog aria-label={`Why ${title} was picked`} className="text-sm text-fg outline-none">
          {reason}
        </Dialog>
      </Popover>
    </DialogTrigger>
  )
}
