// The weights lab (/lab/weights, dev server only): sliders for the recommendation scorer's
// weights. Like every lab it never ships: the route only exists under `npm run dev` (router.tsx).
// Scorer v4 (ADR-0044) adds the dislike penalty slider, an "Avoid" column and the "Score spread"
// panel, which shows which parts actually tell your candidates apart. "Learn from your presses"
// (ADR-0045) suggests weights fitted to your Want / Like / Nope presses on Home's Discovery picks.
import { useMemo, useState } from 'react'
import { withToast } from '@/notify'
import {
  Button,
  Label,
  Slider,
  SliderOutput,
  SliderThumb,
  SliderTrack,
} from 'react-aria-components'
import { Link, useSearchParams } from 'react-router'
import { z } from 'zod'
import { releaseYear } from '@/api/tmdb'
import { EmptyState } from '@/components/ui/EmptyState'
import { HOME } from '@/config/features'
import { PageHeading } from '@/components/ui/PageHeading'
import { learnWeights, MIN_EACH, MIN_PRESSES } from '@/domain/learnWeights'
import { matchRange, partSpreads, type PartSpread } from '@/domain/scoreSpread'
import {
  DEFAULT_WEIGHTS,
  DISLIKE_PENALTY,
  DIVERSITY_PENALTY,
  normalizeWeights,
  SCORER_VERSION,
  SCORE_PARTS,
  type ScorePart,
  type Weights,
} from '@/domain/scorer'
import { useFeedbackLog } from '@/session/useFeedbackLog'
import { useTaste, type Recommendation } from '@/session/useRecommendations'

// The weights lab (ADR-0026 follow-up): the owner tunes the scorer against their own tags and
// sees the picks re-rank live. Settings live in the URL (whole numbers, so links stay readable):
// a tuning can be bookmarked or shared, and nothing is stored.

// How many picks the table shows.
const LIMIT = 20
// 0.32 → 32: sliders and the URL use whole percentages.
const toPercent = (n: number) => Math.round(n * 100)
// The URL key for the genre-variety slider (the scorer's diversity penalty).
const DIVERSITY_KEY = 'diversity'
// The URL key for the dislike penalty slider (ADR-0044).
const PENALTY_KEY = 'penalty'

// Plain-language names for the score parts: slider label, short table header, and hint.
const PARTS: Record<ScorePart, { label: string; short: string; hint: string }> = {
  support: {
    label: 'Recommended by your likes',
    short: 'Likes',
    hint: 'How many of your liked films recommend it, or share its series.',
  },
  genre: {
    label: 'Genre fit',
    short: 'Genre',
    hint: 'Genres you like count up; genres you dislike count down a little, never out.',
  },
  quality: {
    label: 'Rating',
    short: 'Rating',
    hint: 'TMDB rating, trusted more as votes grow.',
  },
  deepCut: { label: 'Deep cut', short: 'Deep', hint: 'Lesser-known films rise.' },
  decade: { label: 'Decade fit', short: 'Decade', hint: 'Same decade as the films you liked.' },
  language: {
    label: 'Language fit',
    short: 'Lang.',
    hint: 'Same original language as the films you liked.',
  },
  keywords: {
    label: 'Keyword overlap',
    short: 'Keys',
    hint: 'Shares story keywords with films you like (top 20 candidates only).',
  },
  director: {
    label: 'Same director',
    short: 'Dir.',
    hint: 'Made by a director of a film you liked (top 20 candidates only).',
  },
  writer: {
    label: 'Same writer',
    short: 'Wri.',
    hint: 'Written by a writer of a film you liked (top 20 candidates only).',
  },
  series: {
    label: 'Same series',
    short: 'Ser.',
    hint: 'Part of a series you liked a film from, e.g. a sequel.',
  },
  cast: {
    label: 'Same actor',
    short: 'Cast',
    hint: 'Stars a top-billed actor from a film you liked (top 20 candidates only).',
  },
  studio: {
    label: 'Same studio',
    short: 'Stu.',
    hint: 'Made by a studio behind a film you liked, not counting the majors (top 20 only).',
  },
}

// URL values are untrusted: each must be a whole number in range, or it falls back to the default.
const level = (fallback: number, max = 100) =>
  z.coerce.number().int().min(0).max(max).catch(fallback)
const paramsSchema = z.object({
  ...(Object.fromEntries(
    SCORE_PARTS.map((p) => [p, level(toPercent(DEFAULT_WEIGHTS[p]))]),
  ) as Record<ScorePart, ReturnType<typeof level>>),
  [DIVERSITY_KEY]: level(toPercent(DIVERSITY_PENALTY), 20),
  [PENALTY_KEY]: level(toPercent(DISLIKE_PENALTY), 40),
})

// The spread panel's names: the score parts', plus the dislike penalty.
const SPREAD_LABELS: Record<PartSpread['part'], string> = {
  ...(Object.fromEntries(SCORE_PARTS.map((p) => [p, PARTS[p].label])) as Record<ScorePart, string>),
  penalty: 'Dislike penalty',
}

/** The weights lab page. Dev server only (`FEATURES.labs`). */
export function WeightsPage() {
  const [params, setParams] = useSearchParams()
  const { diversity, penalty, ...levels } = paramsSchema.parse(Object.fromEntries(params))
  const weights = normalizeWeights(levels)
  const diversityPenalty = diversity / 100
  const dislikePenalty = penalty / 100
  const taste = useTaste()
  const tuned = taste.score({ weights, diversityPenalty, dislikePenalty, limit: LIMIT })
  const baseline = taste.score({ limit: LIMIT })
  // Today's default ranking, to show how far each film moved.
  const baselineRank = new Map(baseline.map((r, i) => [r.movie.id, i]))
  const tunedIds = new Set(tuned.map((r) => r.movie.id))
  const dropped = baseline.filter((r) => !tunedIds.has(r.movie.id))
  const allZero = SCORE_PARTS.every((p) => levels[p] === 0)

  // Writes one slider's value into the URL. `replace` avoids a history entry per slider step.
  function set(key: ScorePart | typeof DIVERSITY_KEY | typeof PENALTY_KEY, value: number) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(key, String(value))
        return next
      },
      { replace: true, preventScrollReset: true },
    )
  }

  return (
    <>
      <title>Tune the weights · Deep Cuts</title>
      <PageHeading
        eyebrow="Scorer lab"
        title="Tune the weights"
        lede="Move a slider and your Discover picks re-rank here. Nothing changes in Discover until the defaults are updated."
      />

      {!taste.hasLikes ? (
        <EmptyState>
          Mark a few films “More like this” first. The weights rank films your likes recommend, so
          there’s nothing to tune yet.{' '}
          <Link to={HOME.path} className="text-accent underline">
            Find films to like
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <section aria-labelledby="weights" className="grid gap-5 lg:sticky lg:top-48">
            <h2 id="weights" className="text-lg font-bold">
              Weights
            </h2>
            {SCORE_PARTS.map((p) => (
              <WeightSlider
                key={p}
                label={PARTS[p].label}
                hint={PARTS[p].hint}
                value={levels[p]}
                share={allZero ? 0 : toPercent(weights[p])}
                onChange={(v) => set(p, v)}
              />
            ))}
            <WeightSlider
              label="Genre variety"
              hint="How far a film drops for each earlier pick in the same genre."
              value={diversity}
              max={20}
              onChange={(v) => set(DIVERSITY_KEY, v)}
            />
            <WeightSlider
              label="Dislike penalty"
              hint="The most a film loses for sharing a director, writer, actor, studio, series or keywords with a film you disliked."
              value={penalty}
              max={40}
              onChange={(v) => set(PENALTY_KEY, v)}
            />
            <Summary
              weights={weights}
              diversityPenalty={diversityPenalty}
              dislikePenalty={dislikePenalty}
            />
            <LearnedPanel params={params} />
          </section>

          <section aria-labelledby="picks" className="min-w-0">
            <h2 id="picks" className="text-lg font-bold">
              Your top {LIMIT}
            </h2>
            <p className="mb-2.5 text-sm text-fg-muted">
              Change is the move from the default weights. Part scores run 0–100.
            </p>
            {allZero && (
              <p role="alert" className="mb-3 border-2 border-border-control p-3 text-sm">
                Every weight is at zero, so every film scores 0%. Turn at least one up.
              </p>
            )}
            {taste.loading ? (
              <p role="status">Loading your picks…</p>
            ) : tuned.length === 0 ? (
              <EmptyState>
                Your likes don’t recommend any films you haven’t tagged yet. Mark a few more films
                “More like this”.
              </EmptyState>
            ) : (
              <>
                <PicksTable picks={tuned} baselineRank={baselineRank} />
                <SpreadPanel
                  picks={tuned}
                  candidates={taste.candidates({ weights, dislikePenalty })}
                />
              </>
            )}
            {dropped.length > 0 && (
              <p className="mt-3 text-sm text-fg-muted">
                Left your top {LIMIT}:{' '}
                {dropped.map((r, i) => (
                  <span key={r.movie.id}>
                    {i > 0 && ', '}
                    <cite className="text-fg not-italic">{r.movie.title}</cite>
                  </span>
                ))}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  )
}

// One labelled slider with its value, share of the score, and a hint (React Aria Slider:
// keyboard and screen-reader accessible).
function WeightSlider({
  label,
  hint,
  value,
  share,
  max = 100,
  onChange,
}: {
  label: string
  hint: string
  value: number
  /** This part's share of the score, after the weights are scaled to add up to 100%. */
  share?: number
  max?: number
  onChange: (value: number) => void
}) {
  const [hintId] = useState(() => `hint-${label.replace(/\W+/g, '-').toLowerCase()}`)
  return (
    <Slider
      value={value}
      minValue={0}
      maxValue={max}
      onChange={onChange}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3"
    >
      <Label className="text-sm font-bold">{label}</Label>
      <SliderOutput className="text-sm text-fg-muted tabular-nums">
        {({ state }) =>
          share === undefined ? state.getThumbValue(0) : `${state.getThumbValue(0)} · ${share}%`
        }
      </SliderOutput>
      <SliderTrack className="relative col-span-2 h-11">
        {({ state }) => (
          <>
            <span className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 bg-slider-track" />
            <span
              className="absolute top-1/2 h-1.5 -translate-y-1/2 bg-slider-fill"
              style={{ width: `${state.getThumbPercent(0) * 100}%` }}
            />
            <SliderThumb
              aria-describedby={hintId}
              className="focus-ring-within top-1/2 size-6 border-2 border-slider-thumb-border bg-slider-thumb data-dragging:scale-110"
            />
          </>
        )}
      </SliderTrack>
      <p id={hintId} className="col-span-2 -mt-1 text-sm text-fg-muted">
        {hint}
      </p>
    </Slider>
  )
}

/** The current settings as code, ready to paste into DEFAULT_WEIGHTS (or send to the developer). */
function Summary({
  weights,
  diversityPenalty,
  dislikePenalty,
}: {
  weights: Weights
  diversityPenalty: number
  dislikePenalty: number
}) {
  const text = [
    ...SCORE_PARTS.map((p) => `${p}: ${weights[p].toFixed(2)}`),
    `diversityPenalty: ${diversityPenalty.toFixed(2)}`,
    `dislikePenalty: ${dislikePenalty.toFixed(2)}`,
  ].join('\n')

  function copy() {
    void withToast(() => navigator.clipboard.writeText(text), {
      success: 'Copied.',
      error: 'Couldn’t copy. Select the settings above instead.',
    })
  }

  return (
    <div className="grid gap-2.5 rounded-card border-2 border-card-border bg-card-bg p-4">
      <h3 className="text-sm font-bold">These settings</h3>
      <pre className="overflow-x-auto text-sm text-fg-muted tabular-nums">
        <code>{text}</code>
      </pre>
      <div className="flex flex-wrap gap-2.5">
        <Button
          onPress={copy}
          className="min-h-11 border-2 border-button-secondary-border px-3.5 font-display text-base tracking-widest case-display hover:border-accent"
        >
          Copy settings
        </Button>
        <Link
          to="/lab/weights"
          replace
          preventScrollReset
          className="inline-flex min-h-11 items-center px-3.5 text-sm font-bold text-accent"
        >
          Reset to defaults
        </Link>
      </div>
      <p className="text-sm text-fg-muted">
        The page link keeps these settings, so you can bookmark or share it.
      </p>
    </div>
  )
}

// The ranked picks, with each part's score so you can see why a film ranks where it does.
function PicksTable({
  picks,
  baselineRank,
}: {
  picks: Recommendation[]
  baselineRank: Map<number, number>
}) {
  return (
    <div className="overflow-x-auto border-2 border-card-border">
      <table className="w-full text-left text-sm tabular-nums">
        <thead className="bg-surface-raised text-fg-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-bold">
              #
            </th>
            <th scope="col" className="px-3 py-2 font-bold">
              Film
            </th>
            <th scope="col" className="px-3 py-2 font-bold">
              Change
            </th>
            <th scope="col" className="px-3 py-2 font-bold">
              Match
            </th>
            {SCORE_PARTS.map((p) => (
              <th key={p} scope="col" className="px-3 py-2 font-bold">
                <abbr title={PARTS[p].label} className="no-underline">
                  {PARTS[p].short}
                </abbr>
              </th>
            ))}
            <th scope="col" className="px-3 py-2 font-bold">
              <abbr
                title="Dislike penalty: how much it looks like films you disliked"
                className="no-underline"
              >
                Avoid
              </abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {picks.map((r, i) => (
            <tr key={r.movie.id} className="border-t border-border">
              <td className="px-3 py-2 text-fg-muted">{i + 1}</td>
              <th scope="row" className="min-w-40 px-3 py-2 font-bold">
                <Link to={`/movie/${r.movie.id}`} className="text-accent underline">
                  {r.movie.title}
                </Link>{' '}
                <span className="font-normal text-fg-muted">
                  {releaseYear(r.movie.release_date)}
                </span>
              </th>
              <td className="px-3 py-2 whitespace-nowrap">
                <Change from={baselineRank.get(r.movie.id)} to={i} />
              </td>
              <td className="px-3 py-2 font-bold text-accent">{r.match}%</td>
              {SCORE_PARTS.map((p) => (
                <td key={p} className="px-3 py-2 text-fg-muted">
                  {toPercent(r.parts[p])}
                </td>
              ))}
              <td className="px-3 py-2 text-fg-muted">
                {r.nearDisliked ? (
                  <span title={`${r.nearDisliked.overlap}, like ${r.nearDisliked.disliked}`}>
                    {toPercent(r.penalty)}
                    <span className="sr-only">
                      : {r.nearDisliked.overlap}, like {r.nearDisliked.disliked}
                    </span>
                  </span>
                ) : (
                  toPercent(r.penalty)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Rank change against the default weights, as words for screen readers and arrows on screen. */
function Change({ from, to }: { from: number | undefined; to: number }) {
  if (from === undefined) return <span className="font-bold text-accent">New</span>
  const moved = from - to
  if (moved === 0) return <span className="text-fg-muted">–</span>
  return (
    <span className={moved > 0 ? 'text-accent' : 'text-fg-muted'}>
      <span aria-hidden="true">
        {moved > 0 ? '↑' : '↓'}
        {Math.abs(moved)}
      </span>
      <span className="sr-only">
        {moved > 0 ? 'Up' : 'Down'} {Math.abs(moved)}
      </span>
    </span>
  )
}

/**
 * How spread out the scores are (ADR-0044): the match range of the top picks, and each part's
 * spread across every candidate. A part that barely varies only lifts every score equally, so it
 * can't change the order: lowering its weight changes nothing but the raw scores.
 */
function SpreadPanel({
  picks,
  candidates,
}: {
  picks: Recommendation[]
  candidates: Recommendation[]
}) {
  const range = matchRange(picks)
  const spreads = partSpreads(candidates)
  return (
    <section aria-labelledby="spread" className="mt-8">
      <h2 id="spread" className="text-lg font-bold">
        Score spread
      </h2>
      {range && (
        <p className="mb-2.5 text-sm text-fg-muted">
          Your top {picks.length} run from {range.low}% to {range.high}% match (middle{' '}
          {range.median}%). Below, each part across all {candidates.length} candidates: one that
          barely varies can’t change the order. Keywords and credits only count for the top 20
          candidates, so they look flatter here than they are.
        </p>
      )}
      <div className="overflow-x-auto border-2 border-card-border">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="bg-surface-raised text-fg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-bold">
                Part
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                Low
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                High
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                Spread
              </th>
            </tr>
          </thead>
          <tbody>
            {spreads.map((s) => (
              <tr key={s.part} className="border-t border-border">
                <th scope="row" className="px-3 py-2 font-bold">
                  {SPREAD_LABELS[s.part]}
                </th>
                <td className="px-3 py-2 text-fg-muted">{toPercent(s.low)}</td>
                <td className="px-3 py-2 text-fg-muted">{toPercent(s.high)}</td>
                <td className="px-3 py-2">
                  {toPercent(s.spread)}
                  {s.flat && <span className="ml-2 text-fg-muted">barely varies</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * "Learn from your presses" (ADR-0045): weights fitted to the Want / Like / Nope presses on Home's
 * Discovery picks, with how well they fit and a link that puts them on the sliders. The presses
 * are read once when the lab opens; the fit runs once for them, not on every slider move.
 */
function LearnedPanel({ params }: { params: URLSearchParams }) {
  const feedback = useFeedbackLog()
  const [entries] = useState(() => feedback?.list() ?? [])
  const { counts, learned } = useMemo(() => learnWeights(entries, SCORER_VERSION), [entries])
  // Want and Like are both a yes (ADR-0050).
  const yes = counts.want + counts.like
  const presses = yes + counts.nope
  const enough = presses >= MIN_PRESSES && yes >= MIN_EACH && counts.nope >= MIN_EACH

  // The lab's own URL with the suggestion on the sliders, keeping genre variety as it is.
  const apply = new URLSearchParams(params)
  if (learned) {
    for (const p of SCORE_PARTS) apply.set(p, String(toPercent(learned.weights[p])))
    apply.set(PENALTY_KEY, String(toPercent(learned.dislikePenalty)))
  }

  return (
    <section
      aria-labelledby="learned"
      className="grid gap-2.5 rounded-card border-2 border-card-border bg-card-bg p-4"
    >
      <h3 id="learned" className="text-sm font-bold">
        Learn from your presses
      </h3>
      <p className="text-sm text-fg-muted">
        Want {counts.want} · More {counts.like} · Less {counts.nope}. Want and More both count as a
        yes.
        {counts.older > 0 &&
          ` ${counts.older} older presses were scored differently and don’t count.`}
      </p>
      {!enough ? (
        <p className="text-sm">
          Press Want, More or Less on Home’s Discovery picks: {MIN_PRESSES} presses, at least{' '}
          {MIN_EACH} yeses and {MIN_EACH} noes, are needed to suggest weights. {presses} so far.
        </p>
      ) : !learned ? (
        <p className="text-sm">
          No part made a Want more likely yet, so there’s nothing to suggest. Keep pressing.
        </p>
      ) : (
        <>
          <ul className="grid gap-1 text-sm tabular-nums">
            {SCORE_PARTS.map((p) => (
              <li key={p} className="flex justify-between gap-3">
                <span>{PARTS[p].label}</span>
                <span className="text-fg-muted">{toPercent(learned.weights[p])}%</span>
              </li>
            ))}
            <li className="flex justify-between gap-3">
              <span>Dislike penalty</span>
              <span className="text-fg-muted">{toPercent(learned.dislikePenalty)}</span>
            </li>
          </ul>
          <p className="text-sm text-fg-muted">
            These call {toPercent(learned.accuracy)}% of your presses right; always guessing the
            more common one would get {toPercent(learned.baseline)}%. It learned from the same
            presses, so treat it as a starting point.
          </p>
          <Link
            to={`/lab/weights?${apply.toString()}`}
            replace
            preventScrollReset
            className="inline-flex min-h-11 w-fit items-center border-2 border-button-secondary-border px-3.5 font-display text-base tracking-widest case-display hover:border-accent"
          >
            Use these weights
          </Link>
        </>
      )}
    </section>
  )
}
