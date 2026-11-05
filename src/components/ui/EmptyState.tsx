// A dashed box for wherever there's nothing to show yet.
import type { ReactNode } from 'react'

/** A calm boxed message for empty lists, errors and no-result states. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="my-5 border-2 border-dashed border-border-strong p-5 font-label text-base text-content-soft">
      {children}
    </p>
  )
}
