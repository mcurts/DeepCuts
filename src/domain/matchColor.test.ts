// The match sticker's steps: each match falls in the right one of the five token steps. (Their
// contrast is checked by the token build: each match-*-content token declares its fill.)
import { describe, expect, it } from 'vitest'
import { MATCH_CLASSES, matchStep } from './matchColor'

describe('match sticker steps', () => {
  it.each([
    [0, 0],
    [19, 0],
    [20, 20],
    [39, 20],
    [40, 40],
    [59, 40],
    [60, 60],
    [79, 60],
    [80, 80],
    [100, 80],
  ])('%i%% is in the %i step', (match, step) => {
    expect(matchStep(match)).toBe(step)
  })

  it('names a fill and a text class for every step', () => {
    for (const [step, classes] of Object.entries(MATCH_CLASSES)) {
      expect(classes).toEqual({
        fill: `fill-match-${step}-background`,
        text: `text-match-${step}-content`,
      })
    }
  })
})
