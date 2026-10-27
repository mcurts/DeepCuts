// VHS box lab (/lab/vhs, dev server only): Discover's films as the real VHS box posters
// (VhsBox), with a control panel to try new values for the shape, finish and motion live.
//
// The design was tuned here and approved on 2026-10-09 (shape, finish and angles retuned on
// 2026-10-15); its values now live in
// src/components/movie/VhsBox.css and the vhs-box tokens. The lab stays as a tuning tool: it renders the
// real component and only overrides the `--vhs-*` CSS variables on its wrapper, so what you see
// here is exactly what Discover would show with those values. It isn't linked from the app,
// and the route only exists under `npm run dev` (see router.tsx), so it never ships.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { movieQueries } from '@/api/queries'
import { releaseYear, type MovieSummary } from '@/api/tmdb'
import { PageHeading } from '@/components/ui/PageHeading'
import { VhsBox } from '@/components/movie/VhsBox'
import { genreTone, primaryGenreName } from '@/domain/genres'
import './vhs-lab.css'

/** How the grain mixes with the poster (CSS mix-blend-mode). */
type GrainBlend = 'normal' | 'multiply' | 'overlay' | 'soft-light' | 'screen'
/** The grain's color: warm tan (approved), or plain grey, black or white specks. */
type GrainTint = 'warm' | 'grey' | 'black' | 'white'

/** Where the cover band sits. */
type BandPos = 'bottom' | 'top'
/** The cover band's colors: the film's genre print color, black card or bone card. */
type BandColor = 'genre' | 'black' | 'bone'

/** Each band color as the CSS variables VhsBox.css reads (genre: unset, the per-box default). */
const BAND_COLORS: Record<BandColor, Record<string, string | undefined>> = {
  genre: { '--vhs-band-bg': undefined, '--vhs-band-fg': undefined },
  black: {
    '--vhs-band-bg': 'var(--color-vhs-box-shell)',
    '--vhs-band-fg': 'var(--color-vhs-box-light)',
  },
  bone: {
    '--vhs-band-bg': 'var(--color-vhs-box-card)',
    '--vhs-band-fg': 'var(--color-vhs-box-ink)',
  },
}

/** Every knob on the control panel. Angles in degrees, lift in px. */
interface Settings {
  /** The cover's height as a multiple of its width (1.5 = the poster's 2:3, 1.83 = a sleeve). */
  aspect: number
  /** On a taller cover, how much of the difference the poster stretches (the rest is cropped). */
  stretch: number
  /** The title band's share of the extra height (0 = none, 1 = all of it), where it sits, its
   *  colors and its title size (a share of the box's width). */
  band: number
  /** Wrap the poster around the spine, and how dark the art on the spine is (0 to 1). */
  wrap: boolean
  spineTint: number
  /** Slide the wrapped art right, as a share of the box's width (trims its right edge). */
  artShift: number
  bandPos: BandPos
  bandColor: BandColor
  bandText: number
  /** The grain: its opacity, coarseness (SVG baseFrequency: lower is coarser), detail
   *  (octaves), tile size in px, blend into the poster and color. */
  grainAlpha: number
  grainFreq: number
  grainOctaves: number
  grainSize: number
  grainBlend: GrainBlend
  grainTint: GrainTint
  /** The soft light falloff over the cover (1 = the 2026-10-09 strength). */
  matte: number
  /** The pale rubbed edges on the cover (0 = none). */
  wear: number
  /** Depth as a share of the width. */
  depth: number
  restY: number
  restX: number
  /** Mouse: the turn (cursor at a side edge) and tilt (top/bottom edge), from face-on. */
  leanY: number
  leanX: number
  /** Keyboard focus: the fixed turn and tilt. */
  focusY: number
  focusX: number
  /** Touch: the tilt at the top and bottom of the screen while scrolling. */
  scrollX: number
  lift: number
  perspective: number
  /** Corner radius on the box's faces, in px. */
  radius: number
  /** The box's drop shadow: how far right and down it falls, in px. */
  shadowX: number
  shadowY: number
  /** Touch: tilt the boxes as they scroll past (phones only). */
  scroll: boolean
  /** Show the scroll tilt on this screen too, to try it with a mouse wheel. */
  scrollPreview: boolean
  /** Show every box in its keyboard-focus pose, to compare without tabbing. */
  freeze: boolean
}

// Starting values: the approved design (src/components/movie/VhsBox.css).
const DEFAULTS: Settings = {
  aspect: 1.7,
  stretch: 1,
  band: 0,
  wrap: true,
  spineTint: 0.6,
  artShift: 0.1,
  bandPos: 'bottom',
  bandColor: 'genre',
  bandText: 0.16,
  grainAlpha: 0.17,
  grainFreq: 0.45,
  grainOctaves: 3,
  grainSize: 80,
  grainBlend: 'normal',
  grainTint: 'warm',
  matte: 0.3,
  wear: 1.25,
  depth: 0.195,
  restY: 0,
  restX: 0,
  leanY: 35,
  leanX: 12,
  focusY: 24,
  focusX: 0,
  scrollX: 8,
  lift: 2,
  perspective: 1100,
  radius: 3,
  shadowX: 10,
  shadowY: 12,
  scroll: false,
  scrollPreview: false,
  freeze: false,
}

/** The real proportions of a VHS sleeve: 190 mm tall on a 104 mm face. */
const SLEEVE = 1.83

/** Each grain tint's RGB, 0 to 1, for the SVG's color matrix ('warm' is the approved tan). */
const TINTS: Record<GrainTint, [number, number, number]> = {
  warm: [0.55, 0.5, 0.42],
  grey: [0.5, 0.5, 0.5],
  black: [0, 0, 0],
  white: [1, 1, 1],
}

/**
 * The grain as a CSS url(): the same SVG noise VhsBox.css ships (fractal turbulence recolored
 * by a color matrix), built from the lab's settings. Only the lab builds it at runtime; the
 * approved values are written out in the stylesheet.
 */
function grainImage(s: Settings) {
  const [r, g, b] = TINTS[s.grainTint]
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${s.grainFreq}' numOctaves='${s.grainOctaves}' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 ${s.grainAlpha} 0'/>` +
    `</filter><rect width='120' height='120' filter='url(#n)'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/**
 * The lab page. On wide screens (lg) the control panel is a sticky sidebar beside the boxes, so
 * they stay in view while you tune; on narrower screens the panel sits above them.
 */
export function VhsLabPage() {
  const [s, setS] = useState<Settings>(DEFAULTS)
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setS((prev) => ({ ...prev, [key]: value }))
  // Which panel section has focus. While you adjust a Keyboard or Touch control, the boxes
  // preview that motion, since otherwise nothing on screen would change: the keyboard pose
  // needs a focused box (and focus is on the slider), and the scroll tilt only runs on phones.
  const [tuning, setTuning] = useState<Section | null>(null)
  const films = (useQuery(movieQueries.discover()).data?.results ?? []).slice(0, 15)

  // The knobs as the CSS variables the VHS box styles read.
  const vars = {
    '--vhs-aspect': s.aspect,
    '--vhs-stretch': s.stretch,
    '--vhs-band': s.band,
    '--vhs-wrap': s.wrap ? 1 : 0,
    '--vhs-spine-tint': s.spineTint,
    '--vhs-art-shift': s.artShift,
    '--vhs-scroll-anim': s.scroll ? 'vhs-shelf' : 'none',
    '--vhs-band-order': s.bandPos === 'top' ? -1 : 1,
    '--vhs-band-text': s.bandText,
    ...BAND_COLORS[s.bandColor],
    '--vhs-grain-image': grainImage(s),
    '--vhs-grain-size': `${s.grainSize}px`,
    '--vhs-grain-blend': s.grainBlend,
    '--vhs-matte': s.matte,
    '--vhs-wear': s.wear,
    '--vhs-depth': s.depth,
    '--vhs-rest-y': `${s.restY}deg`,
    '--vhs-rest-x': `${s.restX}deg`,
    '--vhs-lean-y': `${s.leanY}deg`,
    '--vhs-lean-x': `${s.leanX}deg`,
    '--vhs-focus-y': `${s.focusY}deg`,
    '--vhs-focus-x': `${s.focusX}deg`,
    '--vhs-scroll-x': `${s.scrollX}deg`,
    '--vhs-lift': `${-s.lift}px`,
    '--vhs-perspective': `${s.perspective}px`,
    '--vhs-radius': `${s.radius}px`,
    '--vhs-shadow-x': `${s.shadowX}px`,
    '--vhs-shadow-y': `${s.shadowY}px`,
  } as CSSProperties
  const freeze = s.freeze || tuning === 'keyboard'
  const scrollPreview = s.scroll && (s.scrollPreview || tuning === 'touch')

  return (
    <div
      className="vhs-lab"
      style={vars}
      data-scroll={s.scroll || undefined}
      data-scroll-preview={scrollPreview || undefined}
      data-freeze={freeze || undefined}
    >
      <title>VHS box lab · Deep Cuts</title>
      <PageHeading
        eyebrow="Design lab · dev only"
        title="VHS box posters"
        lede="The approved design, as Discover shows it. Move the mouse over a box to look around it, tab to one for the keyboard turn (Option+Tab in Safari), and scroll on a phone. Try new values here, then send me the settings line."
      />
      <div className="mt-4 grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <Controls s={s} set={set} reset={() => setS(DEFAULTS)} onTuning={setTuning} />
        <ul className="grid grid-cols-2 gap-x-4 gap-y-5.5 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
          {films.map((movie) => (
            <li key={movie.id} className="flex">
              <LabCard movie={movie} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** One film: Discover's tile, trimmed to the box, title and year · genre. */
function LabCard({ movie }: { movie: MovieSummary }) {
  const meta = [releaseYear(movie.release_date), primaryGenreName(movie.genre_ids)].filter(Boolean)
  return (
    <Link
      to={`/movie/${movie.id}`}
      style={genreTone(movie.genre_ids)}
      data-vhs-target=""
      className="group relative flex min-w-0 flex-1 flex-col focus-visible:shadow-none focus-visible:outline-none"
    >
      <VhsBox movie={movie} />
      <div className="mt-3 group-focus-visible:outline-3 group-focus-visible:outline-offset-3 group-focus-visible:outline-focus">
        <h3
          title={movie.title}
          className="mb-1 line-clamp-2 min-h-10 text-sm leading-snug font-bold"
        >
          {movie.title}
        </h3>
        <p className="min-h-5 text-sm text-fg-muted">{meta.join(' · ')}</p>
      </div>
    </Link>
  )
}

/** The panel's sections. Focus inside Keyboard or Touch previews that motion on the boxes. */
type Section = 'shape' | 'finish' | 'box' | 'mouse' | 'keyboard' | 'touch'

/** A slider: [setting, label, min, max, step, unit]. */
type Slider = [keyof Settings, string, number, number, number, string]

const SLIDERS: Record<Section, Slider[]> = {
  shape: [
    ['aspect', 'Height (× the width)', 1.5, 2.4, 0.01, ''],
    ['band', 'Title band (share of the extra height)', 0, 1, 0.05, ''],
    ['stretch', 'Stretch (the rest is cropped)', 0, 1, 0.05, ''],
    ['bandText', 'Band title size', 0.06, 0.3, 0.01, ''],
    ['spineTint', 'Spine darkening (when wrapped)', 0, 1, 0.05, ''],
    ['artShift', 'Shift the art right (when wrapped)', 0, 0.2, 0.01, ''],
  ],
  finish: [
    ['grainAlpha', 'Grain strength', 0, 1, 0.01, ''],
    ['grainFreq', 'Grain fineness (lower is coarser)', 0.2, 3, 0.05, ''],
    ['grainOctaves', 'Grain detail (octaves)', 1, 5, 1, ''],
    ['grainSize', 'Grain tile size', 30, 240, 5, 'px'],
    ['matte', 'Light falloff', 0, 4, 0.1, '×'],
    ['wear', 'Rubbed edges', 0, 6, 0.25, '×'],
  ],
  box: [
    ['depth', 'Depth (share of width)', 0.12, 0.35, 0.005, ''],
    ['restY', 'Turn at rest', 0, 20, 1, '°'],
    ['restX', 'Tilt at rest', -10, 10, 1, '°'],
    ['perspective', 'Perspective', 500, 2500, 50, 'px'],
    ['radius', 'Corner radius', 0, 10, 0.5, 'px'],
    ['shadowX', 'Shadow to the right', 0, 24, 1, 'px'],
    ['shadowY', 'Shadow downward', 0, 24, 1, 'px'],
  ],
  mouse: [
    ['leanY', 'Turn at the sides', 0, 40, 1, '°'],
    ['leanX', 'Tilt at top and bottom', 0, 25, 1, '°'],
    ['lift', 'Lift (also on focus)', 0, 20, 1, 'px'],
  ],
  keyboard: [
    ['focusY', 'Turn on focus', 0, 40, 1, '°'],
    ['focusX', 'Tilt on focus', -15, 15, 1, '°'],
  ],
  touch: [['scrollX', 'Tilt at the top and bottom of the screen', 0, 25, 1, '°']],
}

/**
 * The knobs, in sections, plus a one-line summary of the current settings to paste back to
 * Claude. On wide screens it's a sticky sidebar that scrolls on its own. The app's base styles
 * hide the focus ring on bare inputs, so every label wraps its input and carries
 * `focus-ring-within` to draw the ring around the whole control (index.css).
 * @param onTuning - Called with the section being adjusted (null once you've moved elsewhere).
 */
function Controls({
  s,
  set,
  reset,
  onTuning,
}: {
  s: Settings
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  reset: () => void
  onTuning: (section: Section | null) => void
}) {
  // Focus or a press in a section previews that section's motion; focus or a press anywhere
  // else stops it. Presses count separately because Safari doesn't focus sliders and checkboxes
  // on click. Native focusin/focusout/pointerdown bubble, so a few listeners cover every control.
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const el = form.current
    if (!el) return
    const sectionOf = (target: EventTarget | null) =>
      ((target as HTMLElement | null)?.closest<HTMLElement>('[data-section]')?.dataset.section as
        Section | undefined) ?? null
    const onIn = (e: FocusEvent) => onTuning(sectionOf(e.target))
    const onOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) onTuning(null)
    }
    const onPress = (e: Event) =>
      onTuning(el.contains(e.target as Node) ? sectionOf(e.target) : null)
    el.addEventListener('focusin', onIn)
    el.addEventListener('focusout', onOut)
    document.addEventListener('pointerdown', onPress)
    return () => {
      el.removeEventListener('focusin', onIn)
      el.removeEventListener('focusout', onOut)
      document.removeEventListener('pointerdown', onPress)
    }
  }, [onTuning])

  const summary = `shape=${s.aspect} band=${s.band}/${s.bandPos}/${s.bandColor}/${s.bandText} wrap=${s.wrap ? `on/${s.spineTint}/shift ${s.artShift}` : 'off'} stretch=${s.stretch} grain=${s.grainAlpha}/${s.grainFreq}/${s.grainOctaves}oct/${s.grainSize}px/${s.grainBlend}/${s.grainTint} matte=${s.matte} wear=${s.wear} depth=${s.depth} rest=${s.restY}°/${s.restX}° mouse=${s.leanY}°/${s.leanX}° focus=${s.focusY}°/${s.focusX}° scroll=${s.scroll ? `${s.scrollX}°` : 'off'} lift=${s.lift}px perspective=${s.perspective}px radius=${s.radius}px shadow=${s.shadowX}/${s.shadowY}px`

  // One section of the panel. Its `data-section` tells the listeners above which motion you're
  // tuning.
  const section = (id: Section, legend: string, hint: string, extra?: ReactNode) => (
    <fieldset
      data-section={id}
      className="flex flex-col gap-3 border-t border-border pt-4 text-sm first:border-t-0 first:pt-0"
    >
      <legend className="contents">
        <span className="font-bold">{legend}</span>
      </legend>
      <p className="-mt-2 text-fg-muted">{hint}</p>
      {extra}
      {SLIDERS[id].map(([key, label, min, max, step, unit]) => (
        <label key={key} className="focus-ring-within flex flex-col gap-1">
          <span className="flex justify-between gap-2">
            {label}
            <output className="text-fg-muted tabular-nums">
              {String(s[key])}
              {unit}
            </output>
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={Number(s[key])}
            onChange={(e) => set(key, Number(e.target.value) as never)}
            className="accent-slider-fill"
          />
        </label>
      ))}
    </fieldset>
  )

  // A checkbox row.
  const checkbox = (
    key: 'freeze' | 'scroll' | 'scrollPreview' | 'wrap',
    label: string,
    disabled = false,
  ) => (
    <label className="focus-ring-within flex items-center gap-2">
      <input
        type="checkbox"
        checked={s[key]}
        disabled={disabled}
        onChange={(e) => set(key, e.target.checked)}
        className="accent-slider-fill"
      />
      {label}
    </label>
  )

  // A dropdown row, for the grain's blend and color.
  const select = <K extends 'grainBlend' | 'grainTint' | 'bandPos' | 'bandColor'>(
    key: K,
    label: string,
    options: readonly Settings[K][],
  ) => (
    <label className="focus-ring-within flex items-center justify-between gap-2">
      {label}
      <select
        value={s[key]}
        onChange={(e) => set(key, e.target.value as Settings[K])}
        className="border border-border bg-surface px-2 py-1"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  )

  // The shape presets: the poster's own shape and a real sleeve's.
  const preset = (label: string, aspect: number) => (
    <button
      type="button"
      onClick={() => set('aspect', aspect)}
      aria-pressed={s.aspect === aspect}
      className="border-2 border-border px-2 py-1 aria-pressed:border-accent aria-pressed:text-accent"
    >
      {label}
    </button>
  )

  return (
    <form
      ref={form}
      className="flex flex-col gap-5 rounded-card border-2 border-card-border bg-card-bg p-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto"
      onSubmit={(e) => e.preventDefault()}
    >
      {section(
        'shape',
        'Shape',
        `Posters are 2:3 (1.5); a real VHS sleeve is ${SLEEVE}. On a taller box the extra height goes to a title band first (at 1 the poster keeps its own shape), and whatever's left is stretched or cropped from the sides. Wrapping spreads the poster across the spine too, so it needs less stretch; tick “Keep showing it on every box” under Keyboard to see the spine.`,
        <>
          <div className="flex gap-2">
            {preset('Poster 2:3', 1.5)}
            {preset('VHS sleeve', SLEEVE)}
          </div>
          {select('bandPos', 'Band position', ['bottom', 'top'])}
          {select('bandColor', 'Band color', ['genre', 'black', 'bone'])}
          {checkbox('wrap', 'Wrap the poster around the spine')}
        </>,
      )}
      {section(
        'finish',
        'Finish',
        'The paper grain and wear over the cover. The spine shares the grain.',
        <>
          {select('grainBlend', 'Grain blend', [
            'normal',
            'multiply',
            'overlay',
            'soft-light',
            'screen',
          ])}
          {select('grainTint', 'Grain color', ['warm', 'grey', 'black', 'white'])}
        </>,
      )}
      {section('box', 'Box', 'Its depth and how it sits at rest.')}
      {section('mouse', 'Mouse', 'Hover a box and move around it to try these.')}
      {section(
        'keyboard',
        'Keyboard',
        'Every box shows the keyboard pose while you adjust these.',
        checkbox('freeze', 'Keep showing it on every box'),
      )}
      {section(
        'touch',
        'Touch (phones)',
        'Phones can’t hover or focus, so boxes rest in the keyboard pose and tilt as they scroll past. The preview runs while you adjust this; scroll the page (with the mouse over the boxes) to see the tilt change.',
        <>
          {checkbox('scroll', 'Tilt the boxes while scrolling')}
          {checkbox('scrollPreview', 'Keep the preview on (here, with a mouse)', !s.scroll)}
        </>,
      )}
      <div className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
        <code className="bg-surface-overlay p-2 break-all text-fg-muted">{summary}</code>
        <button type="button" onClick={reset} className="self-start text-accent underline">
          Reset to defaults
        </button>
      </div>
    </form>
  )
}
