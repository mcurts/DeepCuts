// Tests for the tag rules: one tag per film, and what appears in feeds and lists.
import { describe, expect, it } from 'vitest'
import {
  applyTag,
  isInFeeds,
  isOnList,
  restoreSteps,
  type SystemTag,
  type TagSet,
} from './tagRules'

const set = (...tags: SystemTag[]): TagSet => new Set(tags)
const sorted = (tags: TagSet) => [...tags].sort()

describe('applyTag', () => {
  it.each<[SystemTag[], SystemTag, SystemTag[]]>([
    [[], 'liked', ['liked']],
    [['watchlist'], 'liked', ['liked']],
    [['liked'], 'watchlist', ['watchlist']],
    [['disliked'], 'liked', ['liked']],
    [['liked'], 'disliked', ['disliked']],
    [['disliked'], 'watchlist', ['watchlist']],
    [['watchlist'], 'disliked', ['disliked']],
    [['liked'], 'liked', ['liked']],
    // Data saved by older versions could hold two; a new pick still leaves only one.
    [['liked', 'watchlist'], 'disliked', ['disliked']],
  ])('%j + %s → %j', (before, tag, after) => {
    expect(sorted(applyTag(set(...before), tag, true))).toEqual(after)
  })

  it('removing a tag touches nothing else', () => {
    expect(sorted(applyTag(set('liked'), 'liked', false))).toEqual([])
    expect(sorted(applyTag(set('liked'), 'watchlist', false))).toEqual(['liked'])
    expect(sorted(applyTag(set('liked', 'watchlist'), 'liked', false))).toEqual(['watchlist'])
  })

  it('never mutates the input', () => {
    const before = set('watchlist')
    applyTag(before, 'liked', true)
    applyTag(before, 'watchlist', false)
    expect(sorted(before)).toEqual(['watchlist'])
  })
})

describe('feed and list visibility', () => {
  it('disliked films leave every feed', () => {
    expect(isInFeeds(set('liked'))).toBe(true)
    expect(isInFeeds(set('disliked'))).toBe(false)
  })

  it('disliked films appear only on the Disliked list', () => {
    expect(isOnList(set('watchlist', 'disliked'), 'disliked')).toBe(true)
    expect(isOnList(set('watchlist', 'disliked'), 'watchlist')).toBe(false)
    expect(isOnList(set('liked'), 'liked')).toBe(true)
    expect(isOnList(set('liked'), 'watchlist')).toBe(false)
  })
})

describe('restoreSteps (undo)', () => {
  // Replays the steps through applyTag, as the repository would.
  const replay = (current: TagSet, previous: TagSet) =>
    restoreSteps(current, previous).reduce((tags, s) => applyTag(tags, s.tag, s.on), current)

  it('puts back exactly the tag a quick action replaced', () => {
    // "Like" on a watchlisted film takes it off the watchlist; undo puts it back and drops Like.
    const listed = set('watchlist')
    expect(replay(applyTag(listed, 'liked', true), listed)).toEqual(listed)
    // "Not for me" on a liked film; undo brings the Like back.
    const liked = set('liked')
    expect(replay(applyTag(liked, 'disliked', true), liked)).toEqual(liked)
    // A film with no tag goes back to none.
    expect(replay(applyTag(set(), 'watchlist', true), set())).toEqual(set())
  })

  it('removes before it adds, and does nothing when nothing changed', () => {
    expect(restoreSteps(set('watchlist'), set('liked'))).toEqual([
      { tag: 'watchlist', on: false },
      { tag: 'liked', on: true },
    ])
    expect(restoreSteps(set('liked'), set('liked'))).toEqual([])
  })
})
