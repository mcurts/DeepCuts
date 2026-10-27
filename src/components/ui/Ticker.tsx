// The ticker band under the header on Home and the landing page (ADR-0040): a mustard strip of
// live, real information (counts, the top pick, what each feature does), never filler.
//
// It is still by default. It only scrolls once a mouse pointer has rested on it for three seconds
// (so it never moves on its own or on touch), and eases back to the start when the pointer leaves.
// Reduced motion keeps it still. Screen readers get the items once, as a list; the scrolling copy
// is hidden from them. While its items load, the band can keep its room (`loading`), so the page
// below doesn't drop when they arrive; they then fade in. A band that has its items from the start
// (the landing page, or Home with its lists cached) shows them at once.
import { useEffect, useRef, useState, type PointerEvent } from 'react'

/** How long the pointer must rest on the band before it starts scrolling (design §5). */
export const TICKER_HOVER_DELAY = 3000

// Copies of the item list in each half of the track. The loop scrolls by exactly one half, so each
// half must be at least as wide as the band; three copies cover a 1440px window even for a short
// list.
const COPIES = 3

/**
 * A full-bleed ticker band. Pass the items in order of importance: on touch screens it never
 * scrolls, so the start of the list is what people see.
 * @param loading - The items are still loading: with none yet, show the empty band rather than
 *   nothing, so the page doesn't jump down when they arrive. With no items and not loading, there
 *   is no band.
 */
export function Ticker({ items, loading = false }: { items: string[]; loading?: boolean }) {
  const track = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const [playing, setPlaying] = useState(false)
  // Whether it started empty: only items that arrive into the empty band fade in.
  const [startedEmpty] = useState(items.length === 0)
  // A pending start must not fire after the band has gone.
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const start = (e: PointerEvent) => {
    // Touch and pen "hovers" are taps; only a resting mouse starts the scroll.
    if (e.pointerType !== 'mouse') return
    timer.current = window.setTimeout(() => setPlaying(true), TICKER_HOVER_DELAY)
  }
  const stop = () => {
    window.clearTimeout(timer.current)
    const el = track.current
    if (!playing || !el) return
    // Removing the animation would snap the text back. Instead, freeze it where it is, then let
    // the transition carry it back to the start.
    el.style.transform = getComputedStyle(el).transform
    setPlaying(false)
    requestAnimationFrame(() => {
      el.style.transform = ''
    })
  }

  const band =
    'mx-[calc(50%-50vw)] -mt-5 mb-8 overflow-hidden border-y-3 border-surface bg-accent py-2 font-display text-lg tracking-widest whitespace-nowrap text-fg-on-accent case-display md:-mt-6'
  if (items.length === 0) {
    // The empty band: one line's height (a no-break space), nothing to read.
    return loading ? (
      <div aria-hidden="true" data-ticker-loading="" className={band}>
        {'\u00a0'}
      </div>
    ) : null
  }
  const loop = Array.from({ length: COPIES * 2 }, () => items).flat()

  return (
    // Full window width from inside the page's centred column: the band is pulled out to both
    // window edges (the layout clips any scrollbar overshoot), and up against the header. It is
    // always the first thing in AppLayout's <main>, so the negative top margin cancels main's top
    // padding (pt-5, md:pt-6). A plain block, not a landmark: it sums up the page below it.
    <div onPointerEnter={start} onPointerLeave={stop} className={band}>
      <ul className="sr-only">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div
        ref={track}
        aria-hidden="true"
        data-playing={playing || undefined}
        // Fades in when it arrives into the empty band (`startedEmpty`). Never while playing:
        // both set `animation`, and the scroll must win.
        className={`inline-block transition-transform duration-(--motion-turn-duration) ease-(--motion-turn-easing) data-playing:animate-ticker data-playing:transition-none motion-reduce:animate-none ${
          startedEmpty && !playing ? 'motion-safe:animate-fade-in' : ''
        }`}
      >
        {loop.map((item, i) => (
          <span key={i} className="px-4">
            {item}
            <span className="pl-8">★</span>
          </span>
        ))}
      </div>
    </div>
  )
}
