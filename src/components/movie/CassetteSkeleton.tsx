// A cassette tile's placeholder while its film loads: the VHS box's shape in raised
// ink with a halftone screen, and bars where the caption will be. It takes the same room as the
// CassetteCard that replaces it, so a shelf or list holds still as films arrive. Used by Home's
// shelves and My Lists, which also show CassetteSkeletonRow while a whole list is loading.
import { SHELF_GRID } from './ShelfSection'

/**
 * A box-shaped placeholder for one film, as wide as its container (put it in a `flex` grid cell,
 * like CassetteCard). Decorative: hidden from screen readers, which hear the film when it
 * arrives instead (and any "loading" message the page gives).
 */
export function CassetteSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
      {/* The VHS box's own aspect ratio (1:1.7, --vhs-aspect in VhsBox.css). */}
      <div className="aspect-[1/1.7] w-full bg-background-raised halftone" />
      {/* The caption's room: CassetteCard's title, year · genre and credit lines (their min
          heights add up to this), so the row doesn't shrink when the film replaces it. */}
      <div className="mt-4 min-h-36 space-y-2">
        <div className="h-5 w-4/5 bg-background-raised" />
        <div className="h-4 w-3/5 bg-background-raised" />
        <div className="h-3 w-1/2 bg-background-raised" />
      </div>
    </div>
  )
}

/**
 * One row of placeholders for a list that hasn't loaded yet, at any width: how many films it
 * holds isn't known, so it takes one row, the least a shelf or list takes. Five fill the widest
 * row (the 1200px column); the grid's later rows are zero-height and clipped, so a phone shows two.
 */
export function CassetteSkeletonRow() {
  return (
    <ul
      aria-hidden="true"
      data-loading-section="list"
      className={`${SHELF_GRID} auto-rows-[0] grid-rows-[auto] gap-y-0! overflow-hidden`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="flex">
          <CassetteSkeleton />
        </li>
      ))}
    </ul>
  )
}
