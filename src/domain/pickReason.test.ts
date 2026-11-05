// Tests for the pick reasons (pickReason.ts): which fact leads, how director and writer combine,
// that weight-0 parts are never named, the traits, and that a shelf never repeats a sentence.
import { describe, expect, it } from 'vitest'
import { pickReasons, reasonOptions, type ReasonFacts } from './pickReason'
import { DEFAULT_WEIGHTS, SCORE_PARTS, type Weights } from './scorer'

const ZERO = Object.fromEntries(SCORE_PARTS.map((p) => [p, 0])) as Weights
// Every part counts, so a test can check cast and studio too.
const ALL = Object.fromEntries(SCORE_PARTS.map((p) => [p, 1])) as Weights
const names = new Map([
  [1, 'slasher'],
  [2, 'final girl'],
])
const keywordName = (id: number) => names.get(id)

function pick(overrides: Partial<ReasonFacts> = {}): ReasonFacts {
  return {
    film: {
      id: 1,
      title: 'A Pick',
      genreIds: [27],
      year: 1982,
      language: 'en',
      popularity: 10,
      voteAverage: 7,
      voteCount: 1000,
    },
    because: ['The Thing'],
    parts: { ...ZERO },
    ...overrides,
  }
}

const first = (p: ReasonFacts, weights: Weights = ALL) => reasonOptions(p, weights, keywordName)[0]

describe('reasonOptions', () => {
  it('leads with the series', () => {
    expect(
      first(
        pick({
          sameSeries: { liked: 'Friday the 13th' },
          sameDirector: { director: 'Steve Miner', liked: 'Alien' },
        }),
      ),
    ).toBe('Next in the series after Friday the 13th')
  })

  it('combines a director and writer by the liked film they point at', () => {
    const director = { director: 'John Carpenter', liked: 'The Thing' }
    expect(first(pick({ sameDirector: director }))).toBe('Same director as The Thing')
    expect(first(pick({ sameWriter: { writer: 'Dan O’Bannon', liked: 'Alien' } }))).toBe(
      'Same writer as Alien',
    )
    expect(
      first(pick({ sameDirector: director, sameWriter: { writer: 'Bill', liked: 'The Thing' } })),
    ).toBe('Same director and writer as The Thing')
    expect(
      first(pick({ sameDirector: director, sameWriter: { writer: 'Dan', liked: 'Alien' } })),
    ).toBe('Same director as The Thing, same writer as Alien')
  })

  it('names shared keywords, skipping unknown names', () => {
    expect(first(pick({ sameKeywords: { keywordIds: [1, 2], liked: 'Halloween' } }))).toBe(
      'Slasher and final girl, like Halloween',
    )
    expect(first(pick({ sameKeywords: { keywordIds: [9, 2], liked: 'Halloween' } }))).toBe(
      'Final girl, like Halloween',
    )
    // No known names: no keyword sentence at all.
    expect(first(pick({ sameKeywords: { keywordIds: [9], liked: 'Halloween' } }))).toBe(
      'Because you liked The Thing',
    )
  })

  it('names cast, studio and explore picks', () => {
    expect(first(pick({ sameCast: { actor: 'Kurt Russell', liked: 'The Thing' } }))).toBe(
      'With Kurt Russell, from The Thing',
    )
    expect(first(pick({ sameStudio: { studio: 'Hammer', liked: 'Dracula' } }))).toBe(
      'From Hammer, who made Dracula',
    )
    expect(first(pick({ explore: true, film: { ...pick().film, genreIds: [37] } }))).toBe(
      'Something new for you: Western',
    )
  })

  it('never names a fact whose part weighs 0', () => {
    // Cast and studio weigh 0 by default.
    const p = pick({
      sameCast: { actor: 'Kurt Russell', liked: 'The Thing' },
      sameStudio: { studio: 'Hammer', liked: 'Dracula' },
    })
    expect(first(p, DEFAULT_WEIGHTS)).toBe('Because you liked The Thing')
    expect(first(pick({ sameSeries: { liked: 'Halloween' } }), ZERO)).toBe(
      'Because you liked The Thing',
    )
  })

  it('adds traits to the fallback, then both liked films, then the plain line', () => {
    const p = pick({
      because: ['Alien', 'The Thing'],
      parts: { ...ZERO, deepCut: 0.9, quality: 0.9, decade: 0.7 },
    })
    expect(reasonOptions(p, ALL, keywordName)).toEqual([
      "Because you liked Alien: a lesser-known '80s film",
      'Because you liked Alien and The Thing',
      'Because you liked Alien',
    ])
    // Two adjectives without a decade; "an" before the eighties.
    expect(first(pick({ parts: { ...ZERO, deepCut: 0.9, quality: 0.9 } }))).toBe(
      'Because you liked The Thing: a lesser-known, well-rated film',
    )
    expect(first(pick({ parts: { ...ZERO, decade: 0.7 } }))).toBe(
      "Because you liked The Thing: an '80s film",
    )
    const nineties = pick({ film: { ...pick().film, year: 1994 }, parts: { ...ZERO, decade: 0.7 } })
    expect(first(nineties)).toBe("Because you liked The Thing: a '90s film")
  })

  it('has nothing to say without facts or a liked film', () => {
    expect(reasonOptions(pick({ because: [] }), ALL, keywordName)).toEqual([])
  })
})

describe('pickReasons', () => {
  it('gives each pick a sentence an earlier pick has not used', () => {
    const director = { director: 'John Carpenter', liked: 'The Thing' }
    const picks = [
      pick({ sameDirector: director }),
      pick({ sameDirector: director, parts: { ...ZERO, deepCut: 0.9 } }),
      pick(),
      pick(),
      pick({ because: [] }),
    ]
    expect(pickReasons(picks, ALL, keywordName)).toEqual([
      'Same director as The Thing',
      'Because you liked The Thing: a lesser-known film',
      'Because you liked The Thing',
      // Out of new sentences: the best one repeats.
      'Because you liked The Thing',
      'Picked for your taste',
    ])
  })
})
