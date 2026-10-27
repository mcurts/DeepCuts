// The Halloween logo, shown every October (Logo.tsx, SEASONAL_LOGOS). The owner's artwork
// (docs repo: design/halloween/deep-cuts-halloween-original.svg) drawn as data: the standard wordmark
// ringed by jack-o'-lanterns under a crescent moon (the
// artwork's bats are left out, owner 2026-10-13). At rest the wordmark keeps its usual
// colors and the faces are dark; on hover, or while the link around it has keyboard focus, the
// blocks turn purple and orange and the faces light up and flicker (HalloweenLogo.css).
//
// The SVG's box is the wordmark's, the same as the standard logo, so swapping costumes never
// moves a header; the decorations hang outside it (HalloweenLogo.css sizes and places them). Colors are the `brand.halloween` tokens; the letters are the shared wordmark glyphs.

import { useId } from 'react'
import { CUTS, DEEP, type LogoArtProps } from './logoGlyphs'
import './HalloweenLogo.css'

/** Pumpkin colorways, matching the `brand.halloween.pumpkin.*` tokens. */
type Palette = 'rust' | 'gourd' | 'orange' | 'ember'

/**
 * One jack-o'-lantern: three overlapping ellipses (two outer lobes and a middle one), a stem and
 * a carved face, tilted around its centre. The face is drawn twice when lit: blurred for the glow,
 * then sharp on top. Each pumpkin flickers on its own timing so they never pulse in step.
 */
type Pumpkin = {
  palette: Palette
  /** Centre of the pumpkin, in the artwork's coordinates. */
  at: [number, number]
  /** Degrees, clockwise. */
  tilt: number
  /** Outer-lobe radii, the middle lobe's x radius, how far the outer lobes sit from the centre,
   * and the outline width. */
  size: { rx: number; rxMid: number; ry: number; spread: number; outline: number }
  stem: string
  /**
   * The flicker's duration and delay, as utility classes, so pumpkins flicker out of step. Classes,
   * not a `style` attribute: the CSP blocks inline styles in the pre-rendered HTML (ADR-0057).
   */
  flicker: string
  /** Eyes, (sometimes) a nose, and the mouth, as polygon points. */
  face: string[]
}

/** Pumpkins drawn behind the wordmark, peeking out from above and the sides. */
const BEHIND: Pumpkin[] = [
  {
    palette: 'rust',
    at: [-18, 64],
    tilt: -8,
    size: { rx: 15.1, rxMid: 11.4, ry: 22, spread: 10.9, outline: 1.2 },
    stem: 'M-20.5 45Q-22 37 -18 33Q-15 30 -11 33Q-16 36 -15 45Z',
    flicker: '[animation-duration:1.9s] [animation-delay:-0.70s]',
    face: [
      '-34.6,57.4 -21.6,61.4 -23.2,63.1 -33.1,60.0',
      '-1.4,57.4 -14.4,61.4 -12.8,63.1 -2.9,60.0',
      '-38.3,63.1 -28.9,69.7 -18.0,71.5 -7.1,69.7 2.3,63.1 -6.0,72.8 -10.2,71.9 -11.8,75.0 -15.4,73.2 -18.0,75.9 -20.6,73.2 -24.2,75.0 -25.8,71.9 -30.0,72.8',
    ],
  },
  {
    palette: 'gourd',
    at: [64, -8],
    tilt: -4,
    size: { rx: 15.1, rxMid: 11.4, ry: 20, spread: 10.9, outline: 1.2 },
    stem: 'M61.5 -25Q60 -33 64 -37Q67 -40 71 -37Q66 -34 67 -25Z',
    flicker: '[animation-duration:2.3s] [animation-delay:-0.85s]',
    face: [
      '47.9,-16.8 61.4,-12.0 54.6,-7.6',
      '80.1,-16.8 66.6,-12.0 73.4,-7.6',
      '62.7,-7.2 65.3,-7.2 64.0,-4.8',
      '46.8,-5.2 56.2,-2.8 71.8,-2.8 81.2,-5.2 76.0,1.2 70.2,0.0 68.4,5.2 66.1,0.4 61.9,0.4 59.6,5.2 57.8,0.0 52.0,1.2',
    ],
  },
  {
    palette: 'rust',
    at: [372, -4],
    tilt: 5,
    size: { rx: 13.3, rxMid: 10.1, ry: 18, spread: 9.7, outline: 1 },
    stem: 'M369.5 -19Q368 -27 372 -31Q375 -34 379 -31Q374 -28 375 -19Z',
    flicker: '[animation-duration:1.6s] [animation-delay:-0.59s]',
    face: [
      '357.3,-9.4 368.8,-6.2 367.4,-4.7 358.7,-7.2',
      '386.7,-9.4 375.2,-6.2 376.6,-4.7 385.3,-7.2',
      '354.1,-4.7 362.3,0.7 372.0,2.1 381.7,0.7 389.9,-4.7 382.6,3.2 378.9,2.5 377.5,5.0 374.3,3.6 372.0,5.7 369.7,3.6 366.5,5.0 365.1,2.5 361.4,3.2',
    ],
  },
  {
    palette: 'gourd',
    at: [528, 50],
    tilt: 7,
    size: { rx: 15.7, rxMid: 11.9, ry: 22, spread: 11.3, outline: 1.2 },
    stem: 'M525.5 31Q524 23 528 19Q531 16 535 19Q530 22 531 31Z',
    flicker: '[animation-duration:2.0s] [animation-delay:-0.74s]',
    face: [
      '511.3,40.3 525.3,45.6 518.3,50.4',
      '544.7,40.3 530.7,45.6 537.7,50.4',
      '526.6,50.9 529.4,50.9 528.0,53.5',
      '510.2,53.1 519.9,55.7 536.1,55.7 545.8,53.1 540.4,60.1 534.5,58.8 532.6,64.5 530.2,59.2 525.8,59.2 523.4,64.5 521.5,58.8 515.6,60.1',
    ],
  },
]

/** Pumpkins drawn in front of the wordmark, piled along the bottom and the right-hand end. */
const IN_FRONT: Pumpkin[] = [
  {
    palette: 'orange',
    at: [-30, 100],
    tilt: -10,
    size: { rx: 13.3, rxMid: 10.1, ry: 18, spread: 9.7, outline: 1 },
    stem: 'M-32.5 85Q-34 77 -30 73Q-27 70 -23 73Q-28 76 -27 85Z',
    flicker: '[animation-duration:1.7s] [animation-delay:-0.63s]',
    face: [
      '-44.3,92.1 -32.3,96.4 -38.3,100.4',
      '-15.7,92.1 -27.7,96.4 -21.7,100.4',
      '-31.1,100.7 -28.9,100.7 -30.0,102.9',
      '-45.2,102.5 -36.9,104.7 -23.1,104.7 -14.8,102.5 -19.4,108.3 -24.5,107.2 -26.1,111.9 -28.2,107.6 -31.8,107.6 -33.9,111.9 -35.5,107.2 -40.6,108.3',
    ],
  },
  {
    palette: 'orange',
    at: [536, 98],
    tilt: 9,
    size: { rx: 12.2, rxMid: 9.2, ry: 16, spread: 8.8, outline: 1 },
    stem: 'M533.5 85Q532 77 536 73Q539 70 543 73Q538 76 539 85Z',
    flicker: '[animation-duration:2.2s] [animation-delay:-0.81s]',
    face: [
      '522.6,93.2 533.1,96.1 531.8,97.4 523.8,95.1',
      '549.4,93.2 538.9,96.1 540.2,97.4 548.2,95.1',
      '519.6,97.4 527.2,102.2 536.0,103.4 544.8,102.2 552.4,97.4 545.7,104.4 542.3,103.8 541.0,106.0 538.1,104.7 536.0,106.6 533.9,104.7 531.0,106.0 529.7,103.8 526.3,104.4',
    ],
  },
  {
    palette: 'ember',
    at: [4, 128],
    tilt: -3,
    size: { rx: 24.4, rxMid: 18.5, ry: 31, spread: 17.6, outline: 1.9 },
    stem: 'M1.5 100Q0 92 4 88Q7 85 11 88Q6 91 7 100Z',
    flicker: '[animation-duration:1.8s] [animation-delay:-0.67s]',
    face: [
      '-23.7,116.8 -1.0,124.9 -15.3,127.4',
      '31.7,116.8 9.0,124.9 23.3,127.4',
      '-27.1,129.9 -17.8,134.8 -13.6,131.7 -8.6,136.4 -3.6,132.3 1.5,137.0 6.5,132.3 11.6,137.0 16.6,132.3 21.6,136.4 25.8,131.7 35.1,129.9 27.5,140.4 22.5,137.3 19.1,144.1 13.2,141.0 9.0,147.2 4.0,142.9 -1.0,147.2 -5.2,141.0 -11.1,144.1 -14.5,137.3 -19.5,140.4',
    ],
  },
  {
    palette: 'ember',
    at: [500, 126],
    tilt: 4,
    size: { rx: 21.5, rxMid: 16.3, ry: 28, spread: 15.5, outline: 1.7 },
    stem: 'M497.5 101Q496 93 500 89Q503 86 507 89Q502 92 503 101Z',
    flicker: '[animation-duration:2.1s] [animation-delay:-0.78s]',
    face: [
      '475.6,115.9 495.6,123.2 483.0,125.4',
      '524.4,115.9 504.4,123.2 517.0,125.4',
      '472.6,127.7 480.8,132.2 484.5,129.4 488.9,133.6 493.3,129.9 497.8,134.1 502.2,129.9 506.7,134.1 511.1,129.9 515.5,133.6 519.2,129.4 527.4,127.7 520.7,137.2 516.3,134.4 513.3,140.6 508.1,137.8 504.4,143.4 500.0,139.4 495.6,143.4 491.9,137.8 486.7,140.6 483.7,134.4 479.3,137.2',
    ],
  },
  {
    palette: 'rust',
    at: [-50, 146],
    tilt: -6,
    size: { rx: 11, rxMid: 8.4, ry: 14, spread: 8, outline: 1 },
    stem: 'M-52.5 135Q-54 127 -50 123Q-47 120 -43 123Q-48 126 -47 135Z',
    flicker: '[animation-duration:1.4s] [animation-delay:-0.52s]',
    face: [
      '-62.2,141.8 -52.7,144.3 -53.8,145.4 -61.0,143.5',
      '-37.8,141.8 -47.3,144.3 -46.2,145.4 -39.0,143.5',
      '-64.8,145.4 -58.0,149.6 -50.0,150.8 -42.0,149.6 -35.2,145.4 -41.3,151.6 -44.3,151.0 -45.4,153.0 -48.1,151.9 -50.0,153.6 -51.9,151.9 -54.6,153.0 -55.7,151.0 -58.7,151.6',
    ],
  },
  {
    palette: 'gourd',
    at: [64, 148],
    tilt: 5,
    size: { rx: 12.8, rxMid: 9.7, ry: 16, spread: 9.2, outline: 1 },
    stem: 'M61.5 135Q60 127 64 123Q67 120 71 123Q66 126 67 135Z',
    flicker: '[animation-duration:1.5s] [animation-delay:-0.55s]',
    face: [
      '50.4,141.0 61.8,144.8 56.1,148.3',
      '77.6,141.0 66.2,144.8 71.9,148.3',
      '62.9,148.6 65.1,148.6 64.0,150.6',
      '49.5,150.2 57.4,152.2 70.6,152.2 78.5,150.2 74.1,155.4 69.3,154.4 67.7,158.6 65.8,154.7 62.2,154.7 60.3,158.6 58.7,154.4 53.9,155.4',
    ],
  },
  {
    palette: 'rust',
    at: [556, 146],
    tilt: -5,
    size: { rx: 13.3, rxMid: 10.1, ry: 17, spread: 9.7, outline: 1 },
    stem: 'M553.5 132Q552 124 556 120Q559 117 563 120Q558 123 559 132Z',
    flicker: '[animation-duration:1.3s] [animation-delay:-0.48s]',
    face: [
      '541.7,138.5 553.7,142.6 547.7,146.3',
      '570.3,138.5 558.3,142.6 564.3,146.3',
      '554.9,146.7 557.1,146.7 556.0,148.7',
      '540.8,148.4 549.1,150.4 562.9,150.4 571.2,148.4 566.6,153.8 561.5,152.8 559.9,157.2 557.8,153.1 554.2,153.1 552.1,157.2 550.5,152.8 545.4,153.8',
    ],
  },
  {
    palette: 'gourd',
    at: [452, 152],
    tilt: 6,
    size: { rx: 9.9, rxMid: 7.5, ry: 12, spread: 7.1, outline: 1 },
    stem: 'M449.5 143Q448 135 452 131Q455 128 459 131Q454 134 455 143Z',
    flicker: '[animation-duration:1.7s] [animation-delay:-0.63s]',
    face: [
      '441.1,148.4 449.6,150.6 448.6,151.5 442.1,149.8',
      '462.9,148.4 454.4,150.6 455.4,151.5 461.9,149.8',
      '438.7,151.5 444.9,155.1 452.0,156.1 459.1,155.1 465.3,151.5 459.8,156.8 457.1,156.3 456.1,158.0 453.7,157.0 452.0,158.5 450.3,157.0 447.9,158.0 446.9,156.3 444.2,156.8',
    ],
  },
  {
    palette: 'orange',
    at: [470, -16],
    tilt: 3,
    size: { rx: 14.5, rxMid: 11, ry: 19, spread: 10.5, outline: 1.1 },
    stem: 'M467.5 -32Q466 -40 470 -44Q473 -47 477 -44Q472 -41 473 -32Z',
    flicker: '[animation-duration:2.4s] [animation-delay:-0.89s]',
    face: [
      '453.5,-22.8 467.0,-17.9 458.5,-16.4',
      '486.5,-22.8 473.0,-17.9 481.5,-16.4',
      '451.5,-14.9 457.0,-11.8 459.5,-13.7 462.5,-10.9 465.5,-13.3 468.5,-10.5 471.5,-13.3 474.5,-10.5 477.5,-13.3 480.5,-10.9 483.0,-13.7 488.5,-14.9 484.0,-8.4 481.0,-10.3 479.0,-6.1 475.5,-8.0 473.0,-4.2 470.0,-6.9 467.0,-4.2 464.5,-8.0 461.0,-6.1 459.0,-10.3 456.0,-8.4',
    ],
  },
  {
    palette: 'rust',
    at: [436, -4],
    tilt: -7,
    size: { rx: 8.1, rxMid: 6.2, ry: 10, spread: 5.9, outline: 1 },
    stem: 'M433.5 -11Q432 -19 436 -23Q439 -26 443 -23Q438 -20 439 -11Z',
    flicker: '[animation-duration:1.2s] [animation-delay:-0.44s]',
    face: [
      '427.3,-8.4 434.6,-6.0 431.0,-3.8',
      '444.7,-8.4 437.4,-6.0 441.0,-3.8',
      '435.3,-3.6 436.7,-3.6 436.0,-2.4',
      '426.8,-2.6 431.8,-1.4 440.2,-1.4 445.2,-2.6 442.4,0.6 439.4,0.0 438.4,2.6 437.1,0.2 434.9,0.2 433.6,2.6 432.6,0.0 429.6,0.6',
    ],
  },
]

/**
 * The Deep Cuts wordmark in its Halloween costume. Takes the same props as every logo variant
 * (Logo.tsx sets the accessible name, or hides it when decorative).
 */
export function HalloweenLogo({ className, ...props }: LogoArtProps) {
  // Unique ids so two logos on one page never share a filter or mask. React's ids contain
  // characters that aren't safe inside `url(#…)`, so keep only letters and digits.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const glow = `halloween-glow-${uid}`
  const crescent = `halloween-crescent-${uid}`

  return (
    <svg
      viewBox="0 0 502 128"
      {...props}
      className={['halloween-logo', className].filter(Boolean).join(' ')}
    >
      <defs>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        {/* The crescent is a full moon with a second circle masked out, so it shows the real
            page behind it in any theme (the original painted the cut in a fixed color). It sits
            22 units lower than in the original, so it stays on screen with the logo nudged up. */}
        <mask id={crescent} maskUnits="userSpaceOnUse" x="-48" y="-50" width="40" height="40">
          <rect x="-48" y="-50" width="40" height="40" fill="white" />
          <circle cx="-18" cy="-36" r="18" fill="black" />
        </mask>
      </defs>

      <circle
        className="halloween-logo__moon"
        cx="-28"
        cy="-30"
        r="20"
        mask={`url(#${crescent})`}
      />

      {BEHIND.map((pumpkin) => (
        <JackOLantern key={pumpkin.at.join()} pumpkin={pumpkin} glow={glow} />
      ))}

      {/* The standard wordmark (Logo.tsx), with classes so the costume can relight it. */}
      <g transform="translate(18 2) skewX(-8)">
        <rect className="halloween-logo__deep" width="238" height="124" />
        <rect className="halloween-logo__cuts" x="238" width="244" height="124" />
        <g className="halloween-logo__deep-letters" fillRule="evenodd">
          {DEEP.map(([x, d]) => (
            <path key={x} transform={`translate(${x} 12)`} d={d} />
          ))}
        </g>
        <g className="halloween-logo__cuts-letters" fillRule="evenodd">
          {CUTS.map(([x, d]) => (
            <path key={x} transform={`translate(${x} 12)`} d={d} />
          ))}
        </g>
      </g>

      {IN_FRONT.map((pumpkin) => (
        <JackOLantern key={pumpkin.at.join()} pumpkin={pumpkin} glow={glow} />
      ))}
    </svg>
  )
}

/** One pumpkin from BEHIND or IN_FRONT; `glow` is the id of the blur filter for its lit face. */
function JackOLantern({ pumpkin, glow }: { pumpkin: Pumpkin; glow: string }) {
  const { palette, at, tilt, size, stem, flicker, face } = pumpkin
  const [cx, cy] = at
  const lobe = { cy, ry: size.ry, strokeWidth: size.outline }
  const carving = face.map((points) => <polygon key={points} points={points} />)
  return (
    <g
      className={`halloween-logo__pumpkin halloween-logo__pumpkin--${palette}`}
      transform={`rotate(${tilt} ${cx} ${cy})`}
    >
      <path className="halloween-logo__stem" d={stem} />
      <ellipse className="halloween-logo__skin" cx={cx - size.spread} rx={size.rx} {...lobe} />
      <ellipse className="halloween-logo__skin" cx={cx + size.spread} rx={size.rx} {...lobe} />
      <ellipse className="halloween-logo__rib" cx={cx} rx={size.rxMid} {...lobe} />
      <g className={`halloween-logo__glow ${flicker}`} filter={`url(#${glow})`}>
        {carving}
      </g>
      <g className={`halloween-logo__face ${flicker}`}>{carving}</g>
    </g>
  )
}
