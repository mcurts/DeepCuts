// Tests for the quick-action press log: saving, Undo, the size cap, untrusted data and
// a storage that refuses writes.
import { describe, expect, it } from 'vitest'
import type { FeedbackEntry } from '../../domain/learnWeights'
import { SCORE_PARTS, type ScorePart } from '../../domain/scorer'
import { createLocalFeedbackLog, FEEDBACK_LIMIT } from './LocalFeedbackLog'
import { STORAGE_PREFIX } from './versionedStore'

// A small in-memory Storage, so tests never touch the real localStorage.
function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}

const press = (tmdbId: number, action: FeedbackEntry['action'] = 'watchlist'): FeedbackEntry => ({
  tmdbId,
  action,
  parts: Object.fromEntries(SCORE_PARTS.map((p) => [p, 0.5])) as Record<ScorePart, number>,
  penalty: 0,
  scorerVersion: 4,
  at: '2026-10-15T12:00:00.000Z',
})

describe('LocalFeedbackLog', () => {
  it('saves presses in order and takes back the latest one on a film', () => {
    const log = createLocalFeedbackLog('feedback-test', memoryStorage())
    log.add(press(1, 'watchlist'))
    log.add(press(2))
    log.add(press(1, 'disliked'))
    log.remove(1)
    expect(log.list().map((e) => [e.tmdbId, e.action])).toEqual([
      [1, 'watchlist'],
      [2, 'watchlist'],
    ])
    // Nothing to take back: no change.
    log.remove(99)
    expect(log.list()).toHaveLength(2)
  })

  it('keeps only the newest FEEDBACK_LIMIT presses', () => {
    const log = createLocalFeedbackLog('feedback-test', memoryStorage())
    for (let id = 1; id <= FEEDBACK_LIMIT + 2; id++) log.add(press(id))
    const ids = log.list().map((e) => e.tmdbId)
    expect(ids).toHaveLength(FEEDBACK_LIMIT)
    expect(ids[0]).toBe(3)
  })

  it('drops a log that fails validation', () => {
    const storage = memoryStorage()
    storage.setItem(`${STORAGE_PREFIX}feedback-test`, JSON.stringify([{ ...press(1), penalty: 7 }]))
    expect(createLocalFeedbackLog('feedback-test', storage).list()).toEqual([])
  })

  it('drops presses of the retired Seen button and keeps the rest', () => {
    const storage = memoryStorage()
    storage.setItem(
      `${STORAGE_PREFIX}feedback-test`,
      JSON.stringify([press(1), { ...press(2), action: 'seen' }, press(3, 'liked')]),
    )
    const log = createLocalFeedbackLog('feedback-test', storage)
    expect(log.list().map((e) => [e.tmdbId, e.action])).toEqual([
      [1, 'watchlist'],
      [3, 'liked'],
    ])
  })

  it('never throws when storage refuses writes', () => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError')
    }
    const log = createLocalFeedbackLog('feedback-test', storage)
    expect(() => log.add(press(1))).not.toThrow()
    expect(log.list()).toEqual([])
  })
})
