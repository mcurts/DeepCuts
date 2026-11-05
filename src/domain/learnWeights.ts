// Learning the scorer's weights from quick-action presses.
//
// Each Want / Like / Nope press on a Discovery pick is a verdict on a film the scorer chose.
// When a press is saved, the pick's twelve part scores and its dislike penalty are saved with it
// (LocalFeedbackLog.ts). Here a logistic regression learns which parts predict a yes (Want to see
// or Like) rather than "Not for me", and turns that into suggested weights for the weights lab.
//
// - Want and Like are a yes (1) and Nope a no (0). Like replaced Seen on the strip:
//   "I've seen it and liked it" says the scorer picked well, just as "I want to see it" does.
// - Only presses saved by the current scorer version count. A new version computes the parts
//   differently, so older numbers would mislead the fit.
// - It waits for MIN_PRESSES presses, with MIN_EACH yeses and nos, because a fit on a
//   handful of presses mostly learns noise.
//
// Pure and deterministic: plain gradient descent from zero, a fixed number of steps, no
// randomness, so the same presses always suggest the same weights.
import { SCORE_PARTS, type Pick, type ScorePart, type Weights } from './scorer'

/** The tags a quick action sets (quickActions.ts): Want, Like and Nope. */
export type FeedbackAction = 'watchlist' | 'liked' | 'disliked'

/** One saved press: what was pressed, on which film, and how the scorer saw that film then. */
export interface FeedbackEntry {
  tmdbId: number
  action: FeedbackAction
  parts: Pick['parts']
  penalty: Pick['penalty']
  /** The scorer version that scored it (SCORER_VERSION when it was saved). */
  scorerVersion: number
  /** When it was pressed, as an ISO date-time. */
  at: string
}

/** Presses needed before the lab suggests weights. */
export const MIN_PRESSES = 30

/** Of those, at least this many yeses (Want or Like) and Nopes, or there's nothing to compare. */
export const MIN_EACH = 5

/**
 * The most the suggestion sets the dislike penalty to: the top of the lab's slider (0.40).
 */
export const MAX_DISLIKE_PENALTY = 0.4

// The fit's settings. L2 shrinks every coefficient toward 0 a little, so with only a few dozen
// presses a part needs consistent evidence to earn a big weight. 0.05 is mild; the parts are
// all 0–1, so one learning rate suits them all, and 4,000 steps settle well before the end.
const L2 = 0.05
const LEARNING_RATE = 1
const STEPS = 4000

/** How many presses of each kind count toward a fit, for the lab to show. */
export interface PressCounts {
  want: number
  like: number
  nope: number
  /** Presses saved by an older scorer version, which don't count. */
  older: number
}

/** The lab's suggestion, once there are enough presses. */
export interface LearnedWeights {
  /** Suggested weights, summing to 1. Parts that don't predict a yes get 0. */
  weights: Weights
  /** Suggested dislike penalty, 0 to MAX_DISLIKE_PENALTY. */
  dislikePenalty: number
  /**
   * The share of the presses the fit gets right. It is measured on the same presses it learned
   * from, so it flatters itself; compare it with `baseline`.
   */
  accuracy: number
  /** The share it would get right by always guessing the more common press. */
  baseline: number
}

/** The result of learning: the counts, and the suggestion when there are enough presses. */
export interface LearnResult {
  counts: PressCounts
  /** Undefined until there are enough presses, or when no part predicts a yes at all. */
  learned?: LearnedWeights
}

// The features for one press: the twelve parts, then the penalty.
const featuresOf = (e: FeedbackEntry) => [...SCORE_PARTS.map((p) => e.parts[p]), e.penalty]

// 1 / (1 + e^−z): a score turned into a probability of a yes.
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

/**
 * Learns weights from `entries`, counting only those saved by `scorerVersion`.
 * @param entries - Every saved press, any version.
 * @param scorerVersion - The current scorer version (SCORER_VERSION).
 */
export function learnWeights(
  entries: readonly FeedbackEntry[],
  scorerVersion: number,
): LearnResult {
  const labelled = entries.filter((e) => e.scorerVersion === scorerVersion)
  const counts: PressCounts = {
    want: labelled.filter((e) => e.action === 'watchlist').length,
    like: labelled.filter((e) => e.action === 'liked').length,
    nope: labelled.filter((e) => e.action === 'disliked').length,
    older: entries.length - labelled.length,
  }
  const yes = counts.want + counts.like
  if (labelled.length < MIN_PRESSES || yes < MIN_EACH || counts.nope < MIN_EACH) return { counts }

  const xs = labelled.map(featuresOf)
  const ys = labelled.map((e) => (e.action === 'disliked' ? 0 : 1))
  const { coefficients, intercept } = fit(xs, ys)

  // Weights: each part's positive coefficient, as a share of all of them. A part with a negative
  // coefficient made a Nope more likely; the scorer has no negative weights, so it gets 0.
  const partCoefficients = coefficients.slice(0, SCORE_PARTS.length)
  const total = partCoefficients.reduce((sum, c) => sum + Math.max(0, c), 0)
  if (total === 0) return { counts }
  const weights = Object.fromEntries(
    SCORE_PARTS.map((p, i) => [p, Math.max(0, partCoefficients[i] ?? 0) / total]),
  ) as Record<ScorePart, number>
  // The penalty on the same scale: the scorer subtracts `dislikePenalty × penalty` from a score
  // whose weights sum to 1, so a penalty coefficient of −c becomes c / total.
  const penaltyCoefficient = coefficients[SCORE_PARTS.length] ?? 0
  const dislikePenalty = Math.min(MAX_DISLIKE_PENALTY, Math.max(0, -penaltyCoefficient / total))

  const correct = xs.filter((x, i) => {
    const predicted = sigmoid(intercept + dot(coefficients, x)) >= 0.5 ? 1 : 0
    return predicted === ys[i]
  }).length
  const yesShare = yes / labelled.length
  return {
    counts,
    learned: {
      weights,
      dislikePenalty,
      accuracy: correct / labelled.length,
      baseline: Math.max(yesShare, 1 - yesShare),
    },
  }
}

// a · b for two lists of the same length.
function dot(a: readonly number[], b: readonly number[]) {
  return a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0)
}

// L2-regularized logistic regression by batch gradient descent. Returns one coefficient per
// feature and an intercept (which isn't regularized: it only sets the overall yes rate).
function fit(xs: readonly number[][], ys: readonly number[]) {
  const n = xs.length
  const width = xs[0]?.length ?? 0
  const coefficients = new Array<number>(width).fill(0)
  let intercept = 0
  for (let step = 0; step < STEPS; step++) {
    const gradient = new Array<number>(width).fill(0)
    let interceptGradient = 0
    xs.forEach((x, i) => {
      // How far the prediction is from the press: positive when it guessed yes too strongly.
      const error = sigmoid(intercept + dot(coefficients, x)) - (ys[i] ?? 0)
      interceptGradient += error
      x.forEach((v, j) => (gradient[j] = (gradient[j] ?? 0) + error * v))
    })
    intercept -= (LEARNING_RATE * interceptGradient) / n
    for (let j = 0; j < width; j++)
      coefficients[j] =
        (coefficients[j] ?? 0) -
        LEARNING_RATE * ((gradient[j] ?? 0) / n + L2 * (coefficients[j] ?? 0))
  }
  return { coefficients, intercept }
}
