// The Top Ten storage contract: what the app can ask of wherever a Top Ten is kept.
//
// It mirrors the tag store (TagRepository.ts): screens only ever talk to this interface. Demo and
// practice accounts keep their Top Ten in this browser, passkey accounts on the server, and the
// signed-out store is empty and refuses writes. Methods are async because the server one is.
//
// Adding, removing and reordering exist. Replacing a film in a full list comes with the
// rest of the Top Ten management screen; it'll be a new method here.
import { z } from 'zod'
import { TOP_TEN_SIZE, type TopTenList } from '../domain/topTen'

/**
 * A stored Top Ten: up to ten distinct, positive TMDB ids in ranked order. Validated with Zod
 * whenever it's read back from storage or the server, because both are untrusted.
 */
export const topTenSchema = z
  .array(z.number().int().positive())
  .max(TOP_TEN_SIZE)
  .refine((ids) => new Set(ids).size === ids.length, 'A film can appear only once')

/** Everything the app can do with a Top Ten, independent of where it's stored. */
export interface TopTenRepository {
  /** The films in ranked order, number one first (empty when there are none). */
  list(): Promise<TopTenList>
  /**
   * Adds a film at the end and returns the new list. Adding a film that's already there changes
   * nothing. Rejects with `TopTenFullError` when the list already holds ten.
   */
  add(tmdbId: number): Promise<TopTenList>
  /** Removes a film (the films below it move up) and returns the new list. */
  remove(tmdbId: number): Promise<TopTenList>
  /**
   * Saves a new order for the same films and returns it. Rejects with
   * `TopTenChangedError` when `order` adds, drops or repeats a film, which means the stored list
   * changed elsewhere (another tab or device) since it was read.
   */
  reorder(order: TopTenList): Promise<TopTenList>
}
