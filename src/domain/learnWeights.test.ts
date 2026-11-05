// Tests for learning weights from quick-action presses: the thresholds, which presses
// count, that a predictive part earns the weight, the penalty, and determinism.
import { describe, expect, it } from 'vitest'
import {
  learnWeights,
  MAX_DISLIKE_PENALTY,
  MIN_EACH,
  MIN_PRESSES,
  type FeedbackAction,
  type FeedbackEntry,
} from './learnWeights'
import { SCORE_PARTS, type ScorePart } from './scorer'

const VERSION = 4

// A press with every part at 0.5 unless given.
function press(
  action: FeedbackAction,
  parts: Partial<Record<ScorePart, number>> = {},
  penalty = 0,
  scorerVersion = VERSION,
): FeedbackEntry {
  return {
    tmdbId: 1,
    action,
    parts: {
      ...(Object.fromEntries(SCORE_PARTS.map((p) => [p, 0.5])) as Record<ScorePart, number>),
      ...parts,
    },
    penalty,
    scorerVersion,
    at: '2026-10-15T12:00:00.000Z',
  }
}

// `count` presses, each made by `make(i)`.
const many = (count: number, make: (i: number) => FeedbackEntry) =>
  Array.from({ length: count }, (_, i) => make(i))

describe('learnWeights', () => {
  it('waits for MIN_PRESSES presses, MIN_EACH yeses and Nopes', () => {
    expect([MIN_PRESSES, MIN_EACH]).toEqual([30, 5])
    const tooFew = many(MIN_PRESSES - 1, (i) => press(i % 2 ? 'watchlist' : 'disliked'))
    expect(learnWeights(tooFew, VERSION).learned).toBeUndefined()
    const lopsided = [
      ...many(MIN_PRESSES, () => press('watchlist')),
      ...many(MIN_EACH - 1, () => press('disliked')),
    ]
    expect(learnWeights(lopsided, VERSION).learned).toBeUndefined()
  })

  it("counts Like as a yes, and older versions' presses not at all", () => {
    const entries = [
      ...many(10, () => press('watchlist')),
      ...many(9, () => press('liked')),
      ...many(10, () => press('disliked')),
      ...many(10, () => press('watchlist', {}, 0, VERSION - 1)),
    ]
    const result = learnWeights(entries, VERSION)
    expect(result.counts).toEqual({ want: 10, like: 9, nope: 10, older: 10 })
    // 29 presses at this version: one short.
    expect(result.learned).toBeUndefined()
  })

  it('learns from Likes the same way as Wants', () => {
    const entries = many(40, (i) =>
      i % 2 ? press('liked', { quality: 0.9 }) : press('disliked', { quality: 0.1 }),
    )
    expect(learnWeights(entries, VERSION).learned?.weights.quality).toBeGreaterThan(0.9)
  })

  it('gives the weight to the part that tells Wants from Nopes', () => {
    const entries = many(40, (i) =>
      i % 2
        ? press('watchlist', { quality: 0.9, genre: i % 4 === 1 ? 0.3 : 0.7 })
        : press('disliked', { quality: 0.1, genre: i % 4 === 0 ? 0.3 : 0.7 }),
    )
    const learned = learnWeights(entries, VERSION).learned
    if (!learned) throw new Error('expected a fit')
    const total = SCORE_PARTS.reduce((sum, p) => sum + learned.weights[p], 0)
    expect(total).toBeCloseTo(1, 10)
    // Quality separates them perfectly; everything else is the same for both or noise.
    expect(learned.weights.quality).toBeGreaterThan(0.9)
    expect(learned.accuracy).toBe(1)
    expect(learned.baseline).toBe(0.5)
    expect(learned.dislikePenalty).toBe(0)
  })

  it('suggests a dislike penalty when Nopes look like your dislikes, capped at the slider top', () => {
    const entries = many(40, (i) =>
      i % 2 ? press('watchlist', { deepCut: 0.6 }, 0) : press('disliked', { deepCut: 0.4 }, 1),
    )
    const learned = learnWeights(entries, VERSION).learned
    expect(learned?.dislikePenalty).toBeGreaterThan(0)
    expect(learned?.dislikePenalty).toBeLessThanOrEqual(MAX_DISLIKE_PENALTY)
  })

  it('suggests nothing when no part makes a Want more likely', () => {
    // Every part is higher on the Nopes.
    const entries = many(40, (i) =>
      i % 2
        ? press('watchlist', Object.fromEntries(SCORE_PARTS.map((p) => [p, 0.2])))
        : press('disliked', Object.fromEntries(SCORE_PARTS.map((p) => [p, 0.8]))),
    )
    const result = learnWeights(entries, VERSION)
    expect(result.counts.want).toBe(20)
    expect(result.learned).toBeUndefined()
  })

  it('always suggests the same weights for the same presses', () => {
    const entries = many(36, (i) =>
      press(i % 3 ? 'watchlist' : 'disliked', { support: (i % 7) / 7, quality: (i % 5) / 5 }),
    )
    expect(learnWeights(entries, VERSION)).toEqual(learnWeights(entries, VERSION))
  })
})
