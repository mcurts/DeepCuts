// The VHS box poster: a film drawn as a 3D cardboard video sleeve, with the poster on the front,
// a printed spine, the cassette in the open end, and the VHS genre sticker on the cover.
// Design approved 2026-10-09 (tuned in the dev-only lab, /lab/vhs).
//
// The look is the co-located stylesheet VhsBox.css, and so is the motion for the keyboard and
// touch. The mouse motion is a small per-frame animation here (see below), which
// the CSS turns into angles. Purely decorative: the title, year and genre are always written
// next to the box, so it's hidden from screen readers. Colors come from the vhs-box component
// tokens and the film's genre tone (`--tone`, set by genreTone() on a parent).
//
// A box can carry one badge (ADR-0040), stuck on its cover so it turns with the box (owner,
// 2026-10-13): a mustard rank tab (Top Ten), an ADMIT ONE ticket (the watchlist), a blood-red
// match sticker (Discovery), or the stamp a Discovery quick action leaves (issue #76). Badges are decoration too: the caption under the box says the same.
import { useEffect, useRef, type CSSProperties } from 'react'
import { imageUrl, releaseYear, type MovieSummary } from '@/api/tmdb'
import { MATCH_CLASSES, matchStep } from '@/domain/matchColor'
import type { SystemTag } from '@/domain/tagRules'
import { GenreSticker } from './GenreSticker'
import { LoadingImage } from '@/components/ui/LoadingImage'
import { tagColor } from './tagDisplay'
import './VhsBox.css'

/**
 * How quickly the mouse motion catches up, in ms: the time to cover 63% of the way to where the
 * pointer aims (95% takes three times as long, about 0.55s). Longer is smoother but lazier;
 * the owner found 150ms transitions jittery (2026-10-09).
 */
const SMOOTHING = 180

/** The one badge a box can carry: its Top Ten rank, a watchlist ticket, or a pick's match. */
export type VhsBadge =
  | { kind: 'rank'; rank: number }
  | { kind: 'ticket' }
  | { kind: 'match'; match: number }
  | { kind: 'stamp'; tag: SystemTag; label: string }

/**
 * A film as a 3D VHS box, as wide as its container.
 *
 * Put it inside the interactive element it belongs to (a link) and give that element
 * `data-vhs-target`: hovering it lets the mouse look around the box, and keyboard focus on it
 * turns the box to show its spine. On phones the box tilts as it scrolls past. Everything is
 * still under reduced motion.
 */
export function VhsBox({
  movie,
  badge,
}: {
  movie: Pick<MovieSummary, 'id' | 'title' | 'poster_path' | 'release_date' | 'genre_ids'>
  badge?: VhsBadge | undefined
}) {
  const scene = useRef<HTMLSpanElement>(null)

  // Mouse: look around the box. While the mouse is over the target, it carries
  // `data-vhs-active` and three CSS variables the styles turn into angles:
  //   --vhs-px, --vhs-py  where the pointer is over the box, -1 (left/top) to 1 (right/bottom),
  //                       measured against the box (the text below counts as its bottom edge)
  //   --vhs-h             how far into the hover pose it is, 0 (resting) to 1 (following)
  // Each frame moves the three a share of the way toward their targets (exponential smoothing),
  // so entering eases in, following glides instead of restarting a transition on every mouse
  // event (which looked jittery), and leaving eases back to rest. Written straight to the
  // element, not React state, so moving the mouse never re-renders. Native listeners: the box
  // itself is decorative and takes no events. Off under reduced motion.
  useEffect(() => {
    const box = scene.current
    const target = box?.closest<HTMLElement>('[data-vhs-target]')
    if (!box || !target) return
    // Asked on each hover, so a change to the setting applies at once. (matchMedia is missing in
    // some test environments; treat that as no preference.)
    const reducedMotion = () =>
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const clamp = (n: number) => Math.max(-1, Math.min(1, n))
    const now = { x: 0, y: 0, h: 0 }
    const goal = { x: 0, y: 0, h: 0 }
    let frame = 0
    let last = 0

    const write = () => {
      target.style.setProperty('--vhs-px', now.x.toFixed(3))
      target.style.setProperty('--vhs-py', now.y.toFixed(3))
      target.style.setProperty('--vhs-h', now.h.toFixed(3))
    }
    const step = (time: number) => {
      // The same smoothing at any frame rate: after SMOOTHING ms the box has moved 63% of the
      // way, after 3 × SMOOTHING about 95%.
      const share = 1 - Math.exp(-(last ? time - last : 16) / SMOOTHING)
      last = time
      now.x += (goal.x - now.x) * share
      now.y += (goal.y - now.y) * share
      now.h += (goal.h - now.h) * share
      const settled =
        Math.abs(goal.x - now.x) + Math.abs(goal.y - now.y) + Math.abs(goal.h - now.h) < 0.002
      if (settled) Object.assign(now, goal)
      write()
      if (!settled) {
        frame = requestAnimationFrame(step)
        return
      }
      frame = 0
      last = 0
      // Back at rest: hand the box back to the CSS (focus pose, scroll tilt, resting angle).
      if (goal.h === 0) target.removeAttribute('data-vhs-active')
    }
    const run = () => {
      if (!frame) frame = requestAnimationFrame(step)
    }
    const aim = (e: PointerEvent) => {
      const r = box.getBoundingClientRect()
      goal.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1)
      goal.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1)
    }

    const enter = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || reducedMotion()) return
      aim(e)
      // Coming from rest, start the lean where the pointer already is; --vhs-h does the easing.
      if (now.h === 0) Object.assign(now, { x: goal.x, y: goal.y })
      goal.h = 1
      write()
      target.setAttribute('data-vhs-active', '')
      run()
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || goal.h === 0) return
      aim(e)
      run()
    }
    const leave = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || goal.h === 0) return
      goal.h = 0
      run()
    }
    target.addEventListener('pointerenter', enter)
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(frame)
      target.removeEventListener('pointerenter', enter)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerleave', leave)
    }
  }, [])

  const poster = imageUrl(movie.poster_path, 'w342')
  const year = releaseYear(movie.release_date)

  return (
    <span ref={scene} aria-hidden="true" className="vhs-scene">
      <span className="vhs-box">
        <span className="vhs-face vhs-top" />
        <span className="vhs-face vhs-bottom" />
        {/* The open end: the cassette, with the title on its genre-colored label. */}
        <span className="vhs-face vhs-edge">
          <span className="vhs-edge-label">{movie.title}</span>
        </span>
        {/* The spine: genre band with the year ("’79"), the title, the store's barcode. */}
        <span className="vhs-face vhs-spine">
          {/* The poster's strip when it wraps around the spine (hidden unless --vhs-wrap is on;
              the same image as the cover's, so it loads once). */}
          {poster && <img src={poster} alt="" loading="lazy" className="vhs-spine-art" />}
          <span className="vhs-spine-band">{year && `’${year.slice(2)}`}</span>
          <span className="vhs-spine-title">{movie.title}</span>
          <span className="vhs-spine-label">
            <span className="vhs-barcode" />
          </span>
        </span>
        {/* The front cover: the title band (hidden at its default size of 0), the poster (or an
            empty placeholder) and the genre sticker. */}
        <span className="vhs-face vhs-front">
          <span className="vhs-band">
            <span className="vhs-band-title">{movie.title}</span>
          </span>
          {poster ? (
            <LoadingImage src={poster} alt="" loading="lazy" className="vhs-art" />
          ) : (
            <span className="vhs-art bg-poster-placeholder" />
          )}
          <GenreSticker
            genreIds={movie.genre_ids}
            seed={movie.id}
            className="vhs-pin-top absolute top-2.5 right-2.5 z-2"
          />
          {badge && <Badge badge={badge} />}
        </span>
      </span>
    </span>
  )
}

// The match sticker's outline: a 20-point starburst on a 100×100 grid, points at radius 50 and
// shallow notches at 43, so the middle stays roomy enough for "92%" and "MATCH".
const POINTS = 20
const STARBURST = Array.from({ length: POINTS * 2 }, (_, i) => {
  const r = i % 2 === 0 ? 50 : 43
  const a = (Math.PI * i) / POINTS
  return `${(50 + r * Math.sin(a)).toFixed(1)},${(50 - r * Math.cos(a)).toFixed(1)}`
}).join(' ')

/** The badge in front of the box (see VhsBadge). */
function Badge({ badge }: { badge: VhsBadge }) {
  switch (badge.kind) {
    case 'stamp':
      // A quick action's result, stamped across the dimmed cover in the tag's color: "On your
      // watchlist", "More like this", "Less like this". Ink on the tag colors passes 4.5:1 (they're the
      // pressed tag buttons' fills).
      return (
        <span
          className="absolute inset-0 z-2 grid animate-pop-in place-content-center bg-surface/60 p-3"
          style={tagColor(badge.tag) as CSSProperties}
        >
          <span className="-rotate-8 border-2 border-shadow bg-(--tag) px-2 py-1 text-center font-display text-xl leading-none text-fg-on-accent case-display shadow-stamp">
            {badge.label}
          </span>
        </span>
      )
    case 'rank':
      // A mustard tab against the cover's right edge, near the bottom (owner, 2026-10-13): clear
      // of the genre sticker at the top right.
      return (
        <span className="vhs-pin-bottom absolute right-0 bottom-3.5 z-2 bg-accent px-2 py-1 font-display text-3xl leading-none text-fg-on-accent shadow-stamp">
          #{badge.rank}
        </span>
      )
    case 'ticket':
      // A bone ticket stub, stuck on slightly crooked, with a perforated right edge.
      return (
        <span className="vhs-pin-top absolute top-3 left-3 z-2 -rotate-4 border-r-2 border-dashed border-fg-on-accent/40 bg-fg px-2 py-1 font-display text-xs tracking-widest text-fg-on-accent case-display shadow-stamp">
          Admit one
        </span>
      )
    case 'match': {
      // A starburst price sticker stuck on the cover's bottom-left corner, slightly crooked. Its
      // color steps from blood red to neon green with the match (owner, 2026-10-13; the
      // color.match tokens, each with text that passes 4.5:1).
      const colors = MATCH_CLASSES[matchStep(badge.match)]
      return (
        <span
          className={`vhs-pin-bottom absolute bottom-3 left-2 z-2 grid size-18 -rotate-12 place-content-center text-center font-display leading-none case-display sm:size-22 ${colors.text}`}
        >
          <svg viewBox="-4 -4 108 108" className="absolute inset-0 size-full overflow-visible">
            {/* The hard shadow: the same burst, offset down and right (elevation.stamp). */}
            <polygon points={STARBURST} transform="translate(4 4)" className="fill-shadow" />
            <polygon
              points={STARBURST}
              strokeWidth="4"
              strokeLinejoin="round"
              className={`${colors.fill} stroke-fg`}
            />
          </svg>
          <span className="relative text-xl sm:text-2xl">{badge.match}%</span>
          <span className="relative text-xs">Match</span>
        </span>
      )
    }
  }
}
