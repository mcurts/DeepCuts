// The landing page's three small illustrations, one per feature (ADR-0035, ADR-0040 §6a): ranked
// numerals beside posters, two overlapping ADMIT ONE stubs, and three posters with a match stamp.
//
// Inline SVG drawn only with theme tokens (`fill-*`, `stroke-*`), so it follows the theme and
// needs no image files. It sits in a halftone "well" (FeaturePanel's content). Purely decorative
// (`aria-hidden`): the panel's heading and copy carry the meaning (ADR-0009).
import type { PanelId } from '@/config/panels'

// Shared look for the stand-in posters: raised ink with a line border, square like the boxes.
const poster = 'fill-surface-raised stroke-border-strong'

/** The illustration for one feature, in its halftone well (about 166px tall). */
export function PanelArt({ id }: { id: PanelId }) {
  return (
    <div className="grid h-42 place-items-center border-2 border-border bg-surface halftone px-4">
      <svg aria-hidden="true" viewBox="0 0 240 132" className="h-full max-h-36 w-full max-w-80">
        {id === 'top-ten' && <RankedList />}
        {id === 'watchlist' && <TicketStubs />}
        {id === 'discovery' && <PicksRow />}
      </svg>
    </div>
  )
}

// Three ranked rows: a big numeral, a poster and two text bars. Number one is in mustard.
function RankedList() {
  return (
    <g>
      {[0, 1, 2].map((i) => {
        const y = 6 + i * 42
        return (
          <g key={i}>
            <text
              x="16"
              y={y + 30}
              textAnchor="middle"
              className={`font-display text-4xl ${i === 0 ? 'fill-accent' : 'fill-fg-muted'}`}
            >
              {i + 1}
            </text>
            <rect x="38" y={y} width="24" height="34" className={poster} strokeWidth="2" />
            <rect x="74" y={y + 8} width={150 - i * 26} height="8" className="fill-fg/70" />
            <rect x="74" y={y + 22} width={90 - i * 14} height="6" className="fill-fg-muted/50" />
          </g>
        )
      })}
    </g>
  )
}

// One stub: a ticket with a dashed perforation near its right end and ADMIT ONE printed on it.
function Stub({ x, y, rotate, tone }: { x: number; y: number; rotate: number; tone: string }) {
  return (
    <g transform={`rotate(${rotate} ${x + 70} ${y + 26})`}>
      <rect x={x} y={y} width="140" height="52" className={tone} />
      <line
        x1={x + 110}
        x2={x + 110}
        y1={y + 4}
        y2={y + 48}
        strokeDasharray="4 4"
        strokeWidth="2"
        className="stroke-surface/60"
      />
      <text
        x={x + 55}
        y={y + 33}
        textAnchor="middle"
        className="fill-fg-on-accent font-display text-base tracking-widest"
      >
        ADMIT ONE
      </text>
    </g>
  )
}

// Two overlapping ticket stubs, bone behind and mustard in front: films saved for later.
function TicketStubs() {
  return (
    <g>
      <Stub x={34} y={24} rotate={-8} tone="fill-fg" />
      <Stub x={66} y={58} rotate={5} tone="fill-accent" />
    </g>
  )
}

// Three posters; the middle one is blood red and stamped with its match.
function PicksRow() {
  return (
    <g>
      <rect x="22" y="34" width="56" height="84" className={poster} strokeWidth="2" />
      <rect x="162" y="34" width="56" height="84" className={poster} strokeWidth="2" />
      <rect x="92" y="26" width="56" height="92" className="fill-highlight" />
      <g transform="rotate(-12 120 40)">
        <circle cx="120" cy="40" r="24" strokeWidth="3" className="fill-accent stroke-surface" />
        <text
          x="120"
          y="42"
          textAnchor="middle"
          className="fill-fg-on-accent font-display text-base"
        >
          92%
        </text>
        <text
          x="120"
          y="53"
          textAnchor="middle"
          fontSize="8"
          className="fill-fg-on-accent font-display"
        >
          MATCH
        </text>
      </g>
    </g>
  )
}
