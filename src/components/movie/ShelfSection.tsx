// One of Home's three full-width shelves (ADR-0040 §6b): the section-header pattern (a "Feature
// Nº n" label over the heading, a mustard dashed rule, and something on the right), then the
// films in a grid that fills the row with VHS boxes and wraps as the list grows.
import type { ReactNode, RefObject } from 'react'
import { Link } from 'react-router'
import { Eyebrow } from '@/components/ui/Eyebrow'

/**
 * The shelf's film grid: as many boxes per row as fit at 128px or more on phones (two at 320 and
 * 390px) and 192px or more from `sm` (three at 768px, five in the 1200px column). Use it on the
 * `<ul>`/`<ol>` of a shelf, one `flex` item per film.
 */
export const SHELF_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(--spacing(32),1fr))] gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(--spacing(48),1fr))] sm:gap-x-7'

/**
 * A shelf on Home: a labelled `<section>` with the header pattern, then its content.
 * @param feature - Its number on the bill, shown as "Feature Nº 1".
 * @param to - Where the heading leads, when the shelf previews a longer list (the watchlist):
 *   the heading itself is the link (owner, 2026-10-13), not a separate "See all".
 * @param ref - The `<section>`, e.g. so a reorder mode can listen for Escape inside it.
 * @param icon - A decorative icon before the heading that ties the shelf to its tag elsewhere in
 *   the app: the watchlist's bookmark, the Top Ten's star.
 * @param meta - What sits at the right of the header: a count or a line of copy. Below `sm` it
 *   wraps under the heading and the dashed rule hides.
 */
export function ShelfSection({
  id,
  feature,
  title,
  to,
  icon,
  meta,
  children,
  ref,
}: {
  id: string
  feature: number
  title: string
  to?: string
  icon?: ReactNode
  meta?: ReactNode
  children: ReactNode
  ref?: RefObject<HTMLElement | null>
}) {
  const headingId = `shelf-${id}`
  return (
    <section ref={ref} aria-labelledby={headingId} className="mt-12 first-of-type:mt-0">
      <div className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <Eyebrow className="mb-1">Feature Nº {feature}</Eyebrow>
          <h2
            id={headingId}
            className="flex items-center gap-3 font-display text-5xl leading-none tracking-wide case-display"
          >
            {icon}
            {to ? (
              <Link to={to} className="underline-offset-8 hover:text-accent hover:underline">
                {title}
              </Link>
            ) : (
              title
            )}
          </h2>
        </div>
        {/* Decorative: the rule only fills the row between the heading and the meta. */}
        <span aria-hidden="true" className="mb-3 hidden dashed-rule min-w-20 flex-1 sm:block" />
        {meta && <div className="basis-full sm:mb-1.5 sm:basis-auto">{meta}</div>}
      </div>
      {children}
    </section>
  )
}
