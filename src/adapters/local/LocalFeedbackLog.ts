// The quick-action press log, saved in this browser for every kind of account.
//
// Each Want / Like / Nope press on a Discovery pick is saved with how the scorer saw that pick
// (its part scores and dislike penalty), so the weights lab can learn which parts predict what
// you want (learnWeights.ts). Undo takes the press back out. It stays on this device, even for
// passkey accounts whose tags live on the server: it's a tuning aid for the dev-only lab, holds
// nothing beyond film ids and numbers, and is never sent anywhere.
//
// Saving must never break a quick action: the tag is already saved by then, so a full or blocked
// storage just means this press isn't logged.
import { z } from 'zod'
import { type FeedbackEntry } from '../../domain/learnWeights'
import { SCORE_PARTS, type ScorePart } from '../../domain/scorer'
import { versionedStore } from './versionedStore'

/** The most presses kept: the newest. About 300 bytes each, so at most ~150 KB. */
export const FEEDBACK_LIMIT = 500

// A part score or penalty: a number from 0 to 1.
const unit = z.number().min(0).max(1)

/** One saved press. Stored data is untrusted, so every field is checked. */
const entrySchema = z.object({
  tmdbId: z.number().int().positive(),
  action: z.enum(['watchlist', 'liked', 'disliked']),
  parts: z.object(
    Object.fromEntries(SCORE_PARTS.map((p) => [p, unit])) as Record<ScorePart, typeof unit>,
  ),
  penalty: unit,
  scorerVersion: z.number().int().positive(),
  at: z.iso.datetime(),
})

/** The press log for one account. */
export interface FeedbackLog {
  /** Every saved press, oldest first. */
  list(): FeedbackEntry[]
  /** Saves a press. Keeps only the newest FEEDBACK_LIMIT. Never throws. */
  add(entry: FeedbackEntry): void
  /** Takes back the latest press on a film (its Undo). Never throws. */
  remove(tmdbId: number): void
}

/**
 * A FeedbackLog backed by localStorage.
 * @param key - Which account's log, e.g. `'feedback-demo:demo'`.
 * @param storage - Defaults to the browser's localStorage; tests pass their own.
 */
export function createLocalFeedbackLog(key: string, storage?: Storage): FeedbackLog {
  const store = versionedStore<FeedbackEntry[]>({
    key,
    // Presses of the retired Seen button are dropped; the rest of the log is kept.
    migrate: (raw) =>
      Array.isArray(raw)
        ? raw.filter((e: unknown) => (e as { action?: unknown } | null)?.action !== 'seen')
        : raw,
    // A corrupt log is dropped and starts empty: losing tuning data is better than crashing.
    schema: z.array(entrySchema).max(FEEDBACK_LIMIT),
    fallback: [],
    ...(storage && { storage }),
  })
  // Writes, ignoring a full or blocked storage (see the header).
  const save = (entries: FeedbackEntry[]) => {
    try {
      store.save(entries)
    } catch {
      // Not logged; the quick action itself already worked.
    }
  }
  return {
    list: () => store.load(),
    add(entry) {
      save([...store.load(), entry].slice(-FEEDBACK_LIMIT))
    },
    remove(tmdbId) {
      const entries = store.load()
      const index = entries.findLastIndex((e) => e.tmdbId === tmdbId)
      if (index >= 0) save(entries.toSpliced(index, 1))
    },
  }
}
