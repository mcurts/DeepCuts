// The Deep Cuts wordmark (ADR-0040): two skewed blocks, "DEEP" in bone on blood and "CUTS" in ink
// on bone. Drawn inline from the owner's artwork (docs repo: design/triple-feature/deep-cuts-logo.svg),
// with the letters as vector paths, so it looks identical before any font loads and stays sharp
// at any size.
//
// Holidays: from time to time the logo swaps in seasonal artwork (e.g. all of October for
// Halloween). Each holiday is one entry in SEASONAL_LOGOS (seasonalLogos.ts), with its own date
// window, artwork component and favicon; the rest of the year shows the standard wordmark.
//
// Tagline: any costume can carry "The B-sides of cinema" (config/brand.ts) under the artwork. It's
// live text in the label face, in the logo's bone white; a holiday stylesheet can recolor it for
// its lit state by setting `--logo-tagline` (HalloweenLogo.css turns it orange, like CUTS).

import { TAGLINE } from '@/config/brand'
import { currentSeason } from '@/domain/seasons'
import { CUTS, DEEP, type LogoAlign, type LogoArtProps } from './logoGlyphs'
import { SEASONAL_LOGOS } from './seasonalLogos'

type LogoProps = {
  className?: string
  decorative?: boolean
  /** The day to pick artwork for. Defaults to today; stories and tests pass a fixed date. */
  date?: Date
  /**
   * The edge of the header the logo sits against. Holiday artwork can be bigger than the
   * wordmark; it grows away from this edge so it never runs off the screen. Defaults to `start`.
   */
  align?: LogoAlign
  /**
   * Show the tagline under the artwork, as the artwork's next sibling, so the parent lays the
   * two out (the header's Home link stacks them). Off by default: only the main header has room.
   */
  tagline?: boolean
  /** Placement classes for the tagline, e.g. which breakpoints show it. */
  taglineClassName?: string
}

/**
 * The Deep Cuts wordmark, or holiday artwork when one is in season. Colors come from the brand
 * token tier, the artwork's exact values (ADR-0023), so the logo never changes with the page
 * accent. Size it by height; the width follows. Pass `decorative` when a link around it already
 * says "Deep Cuts". Every variant keeps the accessible name "Deep Cuts": the brand doesn't change,
 * only its costume.
 */
export function Logo({
  className,
  decorative = false,
  date = new Date(),
  align = 'start',
  tagline = false,
  taglineClassName = '',
}: LogoProps) {
  const Art = currentSeason(SEASONAL_LOGOS, date)?.Art ?? StandardLogo
  return (
    <>
      <Art
        className={className}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : 'Deep Cuts'}
        aria-hidden={decorative || undefined}
        data-align={align}
      />
      {tagline && (
        // The theme's tagline color unless the costume's lit state sets `--logo-tagline`. Hidden from assistive
        // tech with the artwork when decorative: the link around it already names the brand.
        <span
          aria-hidden={decorative || undefined}
          className={`logo-tagline font-label text-xs leading-none tracking-wider ${taglineClassName}`}
          style={{ color: 'var(--logo-tagline, var(--dc-brand-logo-tagline))' }}
        >
          {TAGLINE}
        </span>
      )}
    </>
  )
}

/** The year-round wordmark (ADR-0040). */
function StandardLogo(props: LogoArtProps) {
  return (
    <svg viewBox="0 0 502 128" {...props}>
      {/* The whole mark leans 8° to the right, like a poster headline. */}
      <g transform="translate(18 2) skewX(-8)">
        <rect width="238" height="124" style={{ fill: 'var(--dc-brand-logo-primary)' }} />
        <rect x="238" width="244" height="124" style={{ fill: 'var(--dc-brand-logo-secondary)' }} />
        <g fillRule="evenodd" style={{ fill: 'var(--dc-brand-logo-on-primary)' }}>
          {DEEP.map(([x, d]) => (
            <path key={x} transform={`translate(${x} 12)`} d={d} />
          ))}
        </g>
        <g fillRule="evenodd" style={{ fill: 'var(--dc-brand-logo-on-secondary)' }}>
          {CUTS.map(([x, d]) => (
            <path key={x} transform={`translate(${x} 12)`} d={d} />
          ))}
        </g>
      </g>
    </svg>
  )
}
