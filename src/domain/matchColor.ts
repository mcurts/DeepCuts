// The match sticker's color (owner, 2026-10-13): five steps from blood red at a low match to neon
// green at a high one, through orange, amber and lime, so a pick's color says roughly how good a
// match it is before you read the number. The number is always written on the sticker too.
//
// The steps are design tokens (color.match.0-80 in tokens/themes/<theme>/color.json), each with a
// text color that passes 4.5:1 on its fill, checked by the contrast gate.

/** Where each step starts, from 0% up, matching the token names (color.match.20 is 20–39%). */
export const MATCH_STEPS = [0, 20, 40, 60, 80] as const

/** One of the five steps. */
export type MatchStep = (typeof MATCH_STEPS)[number]

/** The step a match falls in: the highest one it reaches (95% is the 80 step). */
export function matchStep(match: number): MatchStep {
  return MATCH_STEPS.findLast((start) => match >= start) ?? 0
}

/** Each step's fill and text classes, written out so Tailwind generates them. */
export const MATCH_CLASSES: Record<MatchStep, { fill: string; text: string }> = {
  0: { fill: 'fill-match-0', text: 'text-match-0-fg' },
  20: { fill: 'fill-match-20', text: 'text-match-20-fg' },
  40: { fill: 'fill-match-40', text: 'text-match-40-fg' },
  60: { fill: 'fill-match-60', text: 'text-match-60-fg' },
  80: { fill: 'fill-match-80', text: 'text-match-80-fg' },
}
