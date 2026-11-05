// The Top Ten notice: the line Detail shows instead of the Top Ten sticker when the
// list is full, "Your Top Ten is full." (A film already in the list gets TopTenPick instead.)
//
// It only shows a message; DetailTopTen decides when. Choosing a film to replace comes with the
// Top Ten management screen.
import type { ReactNode, Ref } from 'react'
import { Icon } from '@/components/ui/Icon'

/**
 * A short Top Ten message.
 * @param children - The message.
 * @param ref - The message itself, so the caller can move focus to it (it's focusable only from
 *   code, `tabIndex={-1}`); a screen reader then reads the message.
 */
export function TopTenNotice({
  children,
  className = '',
  ref,
}: {
  children: ReactNode
  className?: string
  ref?: Ref<HTMLParagraphElement>
}) {
  return (
    <p
      ref={ref}
      tabIndex={-1}
      className={`flex min-h-11 items-center gap-2 font-bold ${className}`}
    >
      {/* The star is the Top Ten's color: decorative, always next to the words. */}
      <Icon name="star" className="size-5 shrink-0 text-favourite" />
      {children}
    </p>
  )
}
