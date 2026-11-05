// Reorder mode for a ranked shelf: on or off, what the live region says, and Escape to
// leave. Shared by Home's Top Ten shelf and the watchlist on My Lists, with the button and live
// region in ReorderToggle.tsx.
import { useEffect, useRef, useState } from 'react'

/**
 * State for one shelf's reorder mode.
 * @param canReorder - Whether there's anything to reorder (two or more films). When it turns
 *   false mid-reorder (a film removed in another tab), the mode simply ends.
 * @param list - What's being reordered, for the opening announcement, e.g. "your Top Ten".
 * @returns `active`; `toggle()`; `message` and `announce()` for the live region; `toggleRef`
 *   for the button; `scopeRef` for the element within which Escape leaves the mode.
 */
export function useReorderMode(canReorder: boolean, list: string) {
  const [reordering, setReordering] = useState(false)
  // What the polite live region last said: entering and leaving the mode, and each move.
  const [message, setMessage] = useState('')
  const active = reordering && canReorder
  const toggleRef = useRef<HTMLButtonElement>(null)
  const scopeRef = useRef<HTMLElement>(null)

  function toggle() {
    setReordering(!active)
    setMessage(
      active
        ? 'Done reordering.'
        : `Reordering ${list}. Use each film’s Move earlier and Move later buttons, or drag a film onto another. Press Escape when done.`,
    )
  }

  // Escape leaves the mode from anywhere inside the shelf (WAI-ARIA's usual "exit" key). Focus
  // goes to the toggle, because the move button it was on is about to disappear. A native
  // listener on the shelf, so only presses inside it count (Escape in the header search doesn't).
  useEffect(() => {
    const scope = scopeRef.current
    if (!active || !scope) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      setReordering(false)
      setMessage('Done reordering.')
      toggleRef.current?.focus()
    }
    scope.addEventListener('keydown', onKeyDown)
    return () => scope.removeEventListener('keydown', onKeyDown)
  }, [active])

  return { active, toggle, message, announce: setMessage, toggleRef, scopeRef }
}
