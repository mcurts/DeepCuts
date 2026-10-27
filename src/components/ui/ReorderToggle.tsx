// The pieces a reorder mode shows (ADR-0041): the "Reorder"/"Done" button and the polite live
// region. Their state, and Escape to leave, live in useReorderMode.ts. Shared by Home's Top Ten
// shelf and the watchlist on My Lists, so both behave the same.
import type { RefObject } from 'react'

/**
 * The "Reorder"/"Done" button. Its label says what pressing it does next, and focus stays on it,
 * so "Done" is right where "Reorder" was.
 */
export function ReorderToggle({
  active,
  onPress,
  ref,
}: {
  active: boolean
  onPress: () => void
  ref?: RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onPress}
      className="flex min-h-11 items-center justify-center rounded-button border-2 border-button-secondary-border bg-button-secondary-bg px-5 font-display text-base tracking-widest text-button-secondary-fg case-display hover:border-accent"
    >
      {active ? 'Done' : 'Reorder'}
    </button>
  )
}

/** The live region for a reorder mode: always in the page, so its changes are announced (WCAG 4.1.3). */
export function ReorderStatus({ message }: { message: string }) {
  return (
    <p role="status" className="sr-only">
      {message}
    </p>
  )
}
