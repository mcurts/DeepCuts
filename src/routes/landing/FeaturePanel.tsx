// One feature on the landing page's bill, "Tonight's program" (ADR-0035, ADR-0040 §6a): a
// "Feature Nº n" label, the feature's heading, its illustration and a line of copy. Home shows
// the same three ideas as shelves (ShelfSection), in the same order.
import type { ReactNode } from 'react'
import { Eyebrow } from '@/components/ui/Eyebrow'
import type { PanelDef } from '@/config/panels'

/**
 * A program panel: raised ink, a line border, the label and an `h3`, then its content (the
 * illustration and copy). Put it in a grid cell: `h-full` lines panels in one row up to the same
 * height.
 * @param feature - Its number on the bill, shown as "Feature Nº 1".
 */
export function FeaturePanel({
  panel,
  feature,
  children,
}: {
  panel: PanelDef
  feature: number
  children: ReactNode
}) {
  const headingId = `panel-${panel.id}`
  return (
    <section
      aria-labelledby={headingId}
      className="flex h-full min-w-0 flex-col rounded-card border-2 border-card-border bg-card-bg p-7"
    >
      <Eyebrow className="mb-1">Feature Nº {feature}</Eyebrow>
      <h3
        id={headingId}
        className="mb-5 font-display text-4xl leading-none tracking-wide case-display"
      >
        {panel.title}
      </h3>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  )
}
