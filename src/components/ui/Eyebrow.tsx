// The small typewriter label above headings ("Feature Nº 1", "Your account").
import type { ReactNode } from 'react'

// Colors an eyebrow may use. `contextual` follows the page accent.
const TONES = {
  accent: 'text-content-accent',
  contextual: 'text-contextual',
  muted: 'text-content-muted',
} as const

/**
 * Small typewriter label above a heading: Special Elite, sentence case, widely spaced
 *. The tone carries no meaning on its own.
 * @param as - `h2` when the label is itself a section's heading (Home's sections), so the
 *   page's heading outline stays intact.
 */
export function Eyebrow({
  children,
  tone = 'accent',
  className = 'mb-2.5',
  as: Tag = 'p',
  id,
}: {
  children: ReactNode
  tone?: keyof typeof TONES
  className?: string
  as?: 'p' | 'h2'
  id?: string
}) {
  return (
    <Tag id={id} className={`font-label text-sm tracking-widest ${TONES[tone]} ${className}`}>
      {children}
    </Tag>
  )
}
