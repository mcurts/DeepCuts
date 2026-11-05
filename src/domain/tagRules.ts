// Tag rules: the single source of truth for how the
// three tags interact. Every place that changes tags (the local store and the accounts
// API) goes through `applyTag`, so the rules can't drift between storage adapters.
//
// The rule, in plain words: a film carries at most one tag. Want to see, Like and Dislike are three
// answers to "what do you think of this film?", so picking one clears the other two. Taking a tag
// off leaves the film with none.

/** The three tags a person can put on a film, in display order. */
export const SYSTEM_TAGS = ['watchlist', 'liked', 'disliked'] as const
/** One of the three tags: `'watchlist' | 'liked' | 'disliked'`. */
export type SystemTag = (typeof SYSTEM_TAGS)[number]
/**
 * The tags currently on one film: at most one under the rule above, but kept a set so stored data
 * and undo work the same as before. Read-only so callers can't bypass `applyTag`.
 */
export type TagSet = ReadonlySet<SystemTag>

/**
 * Returns a film's tags after turning one tag on or off, applying the rule above.
 * Pure: the input set is never changed, a new set is returned.
 */
export function applyTag(current: TagSet, tag: SystemTag, on: boolean): TagSet {
  // Turning a tag on replaces whatever the film had; turning it off only removes that tag.
  if (on) return new Set([tag])
  const next = new Set(current)
  next.delete(tag)
  return next
}

/** A disliked film is excluded from Discover, recommendations and onboarding picks. */
export function isInFeeds(tags: TagSet): boolean {
  return !tags.has('disliked')
}

/**
 * Whether a film shows on a given list in My Lists. A disliked film appears only on the
 * Disliked list, even if it somehow carries another tag (e.g. data saved by an older version).
 */
export function isOnList(tags: TagSet, list: SystemTag): boolean {
  return tags.has(list) && (list === 'disliked' || isInFeeds(tags))
}

/**
 * The tag changes that take a film from `current` back to `previous` (an undo), in an order
 * that's safe under the rules above: removals first, then additions. `previous` was a valid set,
 * so it holds at most one tag and re-adding it never removes another of its tags.
 * Feed each step to `applyTag` (or a repository's `setTag`) in turn.
 */
export function restoreSteps(current: TagSet, previous: TagSet): { tag: SystemTag; on: boolean }[] {
  const off = SYSTEM_TAGS.filter((t) => current.has(t) && !previous.has(t))
  const on = SYSTEM_TAGS.filter((t) => previous.has(t) && !current.has(t))
  return [...off.map((tag) => ({ tag, on: false })), ...on.map((tag) => ({ tag, on: true }))]
}
