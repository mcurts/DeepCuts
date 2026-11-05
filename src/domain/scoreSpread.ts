// How spread out the scorer's numbers are, for the weights lab's "Score spread" panel.
//
// A part that gives every candidate nearly the same value can't change the order. It only lifts
// every score equally, which is what made every "% match" read alike before scorer v4. This
// measures each part across all the candidates (the standard deviation), and flags the ones that
// barely vary, so the owner can see which weights do the ranking and which are dead weight.
// Pure: no React, no storage.
import { SCORE_PARTS, type Pick, type ScorePart } from './scorer'

/** The part of a pick these helpers read, so the lab can pass its recommendations as they are. */
export type Scored = Readonly<{
  parts: Pick['parts']
  penalty: Pick['penalty']
  match: Pick['match']
}>

/**
 * A part whose standard deviation across the candidates is below this barely varies. 0.05 on a
 * 0–1 part means most candidates sit within about ±5 points of each other on it.
 */
export const FLAT_SPREAD = 0.05

/** One part's spread across the candidates. Everything is 0–1, like the parts themselves. */
export interface PartSpread {
  /** A score part, or `'penalty'` for the dislike penalty. */
  part: ScorePart | 'penalty'
  low: number
  high: number
  /** The standard deviation: how far a typical candidate is from the average. */
  spread: number
  /** True when `spread` is below FLAT_SPREAD. */
  flat: boolean
}

/** The lowest, middle and highest "% match" in a list of picks. */
export interface MatchRange {
  low: number
  median: number
  high: number
}

/**
 * Each part's spread across `candidates` (and the penalty's), in SCORE_PARTS order with the
 * penalty last. Empty when there are no candidates.
 */
export function partSpreads(candidates: readonly Scored[]): PartSpread[] {
  if (candidates.length === 0) return []
  const parts: (ScorePart | 'penalty')[] = [...SCORE_PARTS, 'penalty']
  return parts.map((part) => {
    const values = candidates.map((c) => (part === 'penalty' ? c.penalty : c.parts[part]))
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    // Population standard deviation: these are all the candidates, not a sample of them.
    const spread = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length)
    return {
      part,
      low: Math.min(...values),
      high: Math.max(...values),
      spread,
      flat: spread < FLAT_SPREAD,
    }
  })
}

/**
 * The lowest, middle (median) and highest "% match" of `picks`; undefined for none. With an even
 * number of picks the median is the average of the middle two, to a whole number.
 */
export function matchRange(picks: readonly Scored[]): MatchRange | undefined {
  if (picks.length === 0) return undefined
  const sorted = picks.map((p) => p.match).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? 0)
      : Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
  return { low: sorted[0] ?? 0, median, high: sorted.at(-1) ?? 0 }
}
