// The heading block shared by the onboarding steps.
import type { ReactNode } from 'react'
import { Eyebrow } from '@/components/ui/Eyebrow'

/** Eyebrow + large heading shared by the onboarding steps. */
export function Prompt({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    // Fades in each time a step appears (off under reduced motion).
    <div className="animate-enter">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="max-w-md font-display text-5xl leading-none tracking-wide text-balance case-display md:text-6xl">
        {title}
      </h1>
      {children}
    </div>
  )
}
