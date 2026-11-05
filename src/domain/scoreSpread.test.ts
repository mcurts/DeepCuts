// Tests for the score spread helpers: each part's spread across candidates, the flat
// flag, and the match range of a list of picks.
import { describe, expect, it } from 'vitest'
import { FLAT_SPREAD, matchRange, partSpreads } from './scoreSpread'
import { SCORE_PARTS, type Pick, type ScorePart } from './scorer'

// A pick with the given match, penalty and parts (every other part 0.5).
function pick(match: number, parts: Partial<Record<ScorePart, number>> = {}, penalty = 0): Pick {
  return {
    film: {
      id: match,
      title: `Film ${match}`,
      genreIds: [],
      year: null,
      language: 'en',
      popularity: 1,
      voteAverage: 7,
      voteCount: 100,
    },
    score: match / 100,
    match,
    because: [],
    parts: {
      ...(Object.fromEntries(SCORE_PARTS.map((p) => [p, 0.5])) as Record<ScorePart, number>),
      ...parts,
    },
    penalty,
  }
}

describe('partSpreads', () => {
  it('measures each part and the penalty, flagging the ones that barely vary', () => {
    const spreads = partSpreads([pick(40, { quality: 0 }, 1), pick(60, { quality: 1 }, 0)])
    expect(spreads.map((s) => s.part)).toEqual([...SCORE_PARTS, 'penalty'])
    const quality = spreads.find((s) => s.part === 'quality')
    expect(quality).toEqual({ part: 'quality', low: 0, high: 1, spread: 0.5, flat: false })
    expect(spreads.find((s) => s.part === 'genre')).toMatchObject({ spread: 0, flat: true })
    expect(spreads.find((s) => s.part === 'penalty')).toMatchObject({ low: 0, high: 1 })
  })

  it('counts a spread just under FLAT_SPREAD as flat', () => {
    const half = FLAT_SPREAD * 0.9
    const [support] = partSpreads([
      pick(1, { support: 0.5 - half }),
      pick(2, { support: 0.5 + half }),
    ])
    expect(support?.flat).toBe(true)
  })

  it('is empty without candidates', () => {
    expect(partSpreads([])).toEqual([])
  })
})

describe('matchRange', () => {
  it('gives the lowest, median and highest match', () => {
    expect(matchRange([pick(90), pick(30), pick(60)])).toEqual({ low: 30, median: 60, high: 90 })
  })

  it('averages the middle two for an even count', () => {
    expect(matchRange([pick(95), pick(30), pick(61), pick(70)])).toEqual({
      low: 30,
      median: 66,
      high: 95,
    })
  })

  it('is undefined without picks', () => {
    expect(matchRange([])).toBeUndefined()
  })
})
