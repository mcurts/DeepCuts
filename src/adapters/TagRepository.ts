// The tag storage contract: what the app can ask of wherever tags are kept.
//
// The app only ever talks to this interface, never to localStorage or a database directly.
// Today's adapters keep tags in memory (guests) or in this browser (saved profiles and the demo
// account); a Supabase adapter can replace them later without touching any screen. Methods are
// async for that reason, even though the local adapters answer instantly.
import { z } from 'zod'
import { SYSTEM_TAGS, type SystemTag, type TagSet } from '../domain/tagRules'

/**
 * One stored fact: "film `tmdbId` has tag `tag`, since `createdAt`". A film with two tags has
 * two records. Validated with Zod whenever records are read back, because storage is untrusted.
 */
export const tagRecordSchema = z.object({
  tmdbId: z.number().int().positive(),
  tag: z.enum(SYSTEM_TAGS),
  createdAt: z.iso.datetime(),
})
/**
 * Tags that older versions saved and this one no longer has: "Seen it", which the app no longer offers.
 * Stored data and server answers may still hold them, so they're skipped before validation.
 */
const RETIRED_TAGS: readonly unknown[] = ['seen']

/**
 * Drops records of retired tags from untrusted data, before it's validated. Without this, one
 * leftover Seen record would fail the whole list's validation and the stored lists would be
 * thrown away (versionedStore resets invalid data). Anything that isn't a list is passed on as is.
 */
export function dropRetiredTags(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw
  return raw.filter(
    (r: unknown) =>
      !(typeof r === 'object' && r !== null && RETIRED_TAGS.includes((r as { tag?: unknown }).tag)),
  )
}

/** A list of stored tag records, read the safe way: retired tags are skipped. */
export const storedRecordsSchema = z.preprocess(dropRetiredTags, z.array(tagRecordSchema))

/** The lists that can be put in the person's own order: only the watchlist. */
export type OrderedTag = 'watchlist'

/**
 * A saved watchlist order: distinct film ids, first first. Validated whenever it's read back.
 * Capped at the most tags an account may hold (server/accounts/tags.ts, ACCOUNT_TAG_LIMIT).
 */
export const savedOrderSchema = z
  .array(z.number().int().positive())
  .max(20_000)
  .refine((ids) => new Set(ids).size === ids.length, 'A film can appear only once')

/** A single stored tag (see `tagRecordSchema`). */
export type TagRecord = z.infer<typeof tagRecordSchema>

/** Everything the app can do with tags, independent of where they're stored. */
export interface TagRepository {
  /** The tags on one film (empty when it has none). */
  getTags(tmdbId: number): Promise<TagSet>
  /** Turns one tag on or off. Always applies `tagRules`; returns the movie's new tags. */
  setTag(tmdbId: number, tag: SystemTag, on: boolean): Promise<TagSet>
  /**
   * Movie ids on a list, newest first. A disliked film is only on the Disliked list. The
   * watchlist follows the person's saved order: films added since they last reordered
   * come first, newest first, then the order they chose.
   */
  list(tag: SystemTag): Promise<number[]>
  /**
   * Saves a new order for the watchlist and returns it. Rejects with
   * `ListChangedError` when `order` isn't exactly the films on the watchlist, because the list
   * changed elsewhere (another tab or device) since it was read.
   */
  reorder(tag: OrderedTag, order: readonly number[]): Promise<number[]>
  /** Movie ids that must never appear in Discover, recommendations or onboarding picks. */
  feedExclusions(): Promise<ReadonlySet<number>>
  /** Every record, for moving picks to another store (e.g. when signing in). */
  exportAll(): Promise<TagRecord[]>
  /** Replays records oldest first through `setTag`, so the rules still hold after a merge. */
  importAll(records: readonly TagRecord[]): Promise<void>
  /** Removes every tag. */
  clear(): Promise<void>
}
