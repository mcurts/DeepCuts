// The heading block at the top of every main page: an optional label, the poster-style headline
// and a lede (ADR-0040).
import { Eyebrow } from './Eyebrow'

// Headline sizes from the dossier's scale (ADR-0040 §3) on Tailwind's: the landing page's poster
// headline (about 64-124px there), Home's (48-88px) and every other page's.
const SIZES = {
  poster: 'text-6xl md:text-8xl lg:text-9xl',
  hero: 'text-5xl md:text-7xl',
  page: 'text-5xl',
} as const

/**
 * Label + display headline + lede, used at the top of every main page.
 * @param highlight - Words that end the headline in blood red with a hard shadow ("close at
 *   hand" on Home). Large text only: blood on ink is about 3.3:1, which passes only at this size.
 * @param size - `poster` for the landing page's headline (the highlight on its own line), `hero`
 *   for Home's, `page` for every other page.
 */
export function PageHeading({
  eyebrow,
  title,
  highlight,
  lede,
  size = 'page',
}: {
  eyebrow?: string
  title: string
  highlight?: string
  lede?: string
  size?: 'poster' | 'hero' | 'page'
}) {
  return (
    <div className="mt-2 mb-8">
      {eyebrow && <Eyebrow tone="contextual">{eyebrow}</Eyebrow>}
      {/* Each page has exactly one <h1>; useRouteFocus moves focus to it after navigation. The
          highlight is part of the same heading, so it reads as one sentence. */}
      <h1
        className={`font-display leading-none tracking-wide text-balance wrap-anywhere case-display ${SIZES[size]}`}
      >
        {title}
        {highlight && (
          <>
            {' '}
            <span className={`text-highlight text-shadow-hard ${size === 'poster' ? 'block' : ''}`}>
              {highlight}
            </span>
          </>
        )}
      </h1>
      {/* As wide as the headline and the content below it (owner, 2026-10-26): a narrower measure
          left Home's one-line lede wrapping before its last word. text-pretty keeps a lone last
          word off its own line where it does wrap. */}
      {lede && <p className="mt-4 text-lg text-pretty text-fg-soft">{lede}</p>}
    </div>
  )
}
