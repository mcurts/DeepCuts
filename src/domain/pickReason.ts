// The one sentence under a Discovery pick that says why it was picked.
//
// "Because you liked The Thing" said the same thing on every film one favourite suggested, so the
// sentence now leads with the most specific fact the scorer found, combining facts that point at
// the same liked film:
//   series      "Next in the series after Friday the 13th"
//   credits     "Same director as The Thing" / "Same director and writer as Alien"
//               (by the liked film, not the name: the tile's credit lines already name them,
//               so "Directed by X, like Y" would repeat them)
//   keywords    "Slasher and final girl, like Halloween"
//   cast/studio "With Kurt Russell, from The Thing" / "From Hammer, who made Dracula"
//   explore     "Something new for you: Western"
//   fallback    "Because you liked Alien: an '80s film"
// Only facts whose score part has a weight above 0 are named, so the sentence never credits
// something that didn't count (cast and studio start at 0). Across a shelf, each pick
// takes its best sentence that an earlier pick hasn't used, so no two tiles read the same.
// Pure: no React, no TMDB; keyword names come in as a lookup.
import { primaryGenreName } from './genres'
import type { Pick as ScoredPick, Weights } from './scorer'

/** What a reason is built from: a scored pick (the film's year and genres, its facts and parts). */
export type ReasonFacts = Pick<
  ScoredPick,
  | 'film'
  | 'because'
  | 'sameDirector'
  | 'sameWriter'
  | 'sameSeries'
  | 'sameCast'
  | 'sameStudio'
  | 'sameKeywords'
  | 'explore'
  | 'parts'
>

/** Looks up a TMDB keyword's name ("final girl") by id; undefined when unknown. */
export type KeywordName = (id: number) => string | undefined

// A part counts as a "trait" worth naming above these values (parts run 0–1). deepCut 0.7 is
// roughly the least-known third of candidates; quality 0.8 the best-rated fifth; decade 0.6 is a
// lift of 1.5, a decade your likes favour half again as much as the candidates do.
const LESSER_KNOWN = 0.7
const WELL_RATED = 0.8
const FAVOURED_DECADE = 0.6

/**
 * The reasons for each pick, in order: one sentence per pick, never repeating an earlier pick's
 * sentence while it has another true one to give.
 * @param weights - The weights the picks were scored with: facts whose part weighs 0 aren't named.
 */
export function pickReasons(
  picks: readonly ReasonFacts[],
  weights: Weights,
  keywordName: KeywordName,
): string[] {
  const used = new Set<string>()
  return picks.map((pick) => {
    const options = reasonOptions(pick, weights, keywordName)
    const reason = options.find((o) => !used.has(o)) ?? options[0] ?? 'Picked for your taste'
    used.add(reason)
    return reason
  })
}

/** Every true sentence for one pick, most specific first. The last is always the fallback. */
export function reasonOptions(
  pick: ReasonFacts,
  weights: Weights,
  keywordName: KeywordName,
): string[] {
  const counts = (part: keyof Weights) => weights[part] > 0
  const options: string[] = []

  if (pick.sameSeries && counts('series'))
    options.push(`Next in the series after ${pick.sameSeries.liked}`)

  const credit = creditSentence(
    counts('director') ? pick.sameDirector : undefined,
    counts('writer') ? pick.sameWriter : undefined,
  )
  if (credit) options.push(credit)

  // Keywords: only names we know, so a missing name drops that keyword, not the sentence.
  const kw = pick.sameKeywords
  const names = kw && counts('keywords') ? kw.keywordIds.flatMap((k) => keywordName(k) ?? []) : []
  if (kw && names.length > 0) options.push(`${capitalize(names.join(' and '))}, like ${kw.liked}`)

  if (pick.sameCast && counts('cast'))
    options.push(`With ${pick.sameCast.actor}, from ${pick.sameCast.liked}`)
  if (pick.sameStudio && counts('studio'))
    options.push(`From ${pick.sameStudio.studio}, who made ${pick.sameStudio.liked}`)

  const genre = primaryGenreName(pick.film.genreIds)
  if (pick.explore && genre) options.push(`Something new for you: ${genre}`)

  options.push(...becauseOptions(pick))
  return options
}

// One sentence for a shared director and writer, combined when they point at the same liked
// film: "Same director and writer as Alien".
function creditSentence(
  director: { liked: string } | undefined,
  writer: { liked: string } | undefined,
): string | undefined {
  if (director && writer)
    return director.liked === writer.liked
      ? `Same director and writer as ${director.liked}`
      : `Same director as ${director.liked}, same writer as ${writer.liked}`
  if (director) return `Same director as ${director.liked}`
  if (writer) return `Same writer as ${writer.liked}`
  return undefined
}

// "Because you liked …" sentences: with the film's traits first (they tell apart picks from one
// favourite), then both liked films, then the plain line. Empty when no liked film suggested it.
function becauseOptions(pick: ReasonFacts): string[] {
  const [first, second] = pick.because
  if (!first) return []
  const plain = `Because you liked ${first}`
  const traits = traitsOf(pick)
  return [
    ...(traits ? [`${plain}: ${traits}`] : []),
    ...(second ? [`Because you liked ${first} and ${second}`] : []),
    plain,
  ]
}

// "a lesser-known '80s film", "a well-rated film": up to two traits, or '' for none.
function traitsOf({ parts, film }: ReasonFacts): string {
  const adjectives = [
    parts.deepCut >= LESSER_KNOWN && 'lesser-known',
    parts.quality >= WELL_RATED && 'well-rated',
  ].filter((a): a is string => a !== false)
  const decade =
    parts.decade >= FAVOURED_DECADE && film.year !== null
      ? `'${String(Math.floor(film.year / 10) * 10).slice(2)}s`
      : ''
  if (adjectives.length === 0 && !decade) return ''
  // Two traits at most, so the line stays short on a phone tile: the decade replaces the second.
  const words = [...adjectives.slice(0, decade ? 1 : 2), decade].filter(Boolean)
  // "an '80s film": said "eighties", so it takes "an".
  const article = words[0]?.startsWith("'8") ? 'an' : 'a'
  return `${article} ${words.join(decade ? ' ' : ', ')} film`
}

// TMDB's keyword names are lower case ("final girl"); a sentence starts with a capital.
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
