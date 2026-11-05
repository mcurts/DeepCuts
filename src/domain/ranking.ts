// Rules for a list someone puts in their own order, shared by the Top Ten and the
// watchlist so both reorder the same way. Pure functions over arrays of TMDB film ids.
//
// - Moving a film shifts the films in between by one place; nothing else changes.
// - A new order must hold exactly the stored films, each once. Anything else means the list
//   changed somewhere else (another tab or device) while the person was reordering, so it's
//   refused with ListChangedError and the screen re-reads the list.

/** Film ids in their person-chosen order, first first. Read-only so callers use the rules. */
export type RankedList = readonly number[]

/** Thrown when a new order doesn't hold exactly the stored films: the list changed elsewhere. */
export class ListChangedError extends Error {
  constructor(message = 'This list changed somewhere else.') {
    super(message)
    this.name = 'ListChangedError'
  }
}

/**
 * Returns the list with `tmdbId` moved to `toIndex` (0 is first); the films in between shift by
 * one place. An index past either end is clamped to it, and moving a film that isn't on the
 * list, or to where it already is, returns the same list. Pure.
 */
export function moveInList(list: RankedList, tmdbId: number, toIndex: number): RankedList {
  const from = list.indexOf(tmdbId)
  if (from === -1) return list
  const to = Math.min(Math.max(Math.trunc(toIndex), 0), list.length - 1)
  if (to === from) return list
  const rest = list.filter((id) => id !== tmdbId)
  return [...rest.slice(0, to), tmdbId, ...rest.slice(to)]
}

/** Whether two lists hold the same films, each once, in any order (a valid reorder). */
export function isSameFilms(a: RankedList, b: RankedList): boolean {
  // Same length, no repeats on either side, and every film of `b` is in `a`.
  const films = new Set(a)
  return (
    a.length === b.length &&
    films.size === a.length &&
    new Set(b).size === b.length &&
    b.every((id) => films.has(id))
  )
}

/**
 * Returns `order` as the new list when it holds exactly the films of `list`. Returns `list`
 * itself when nothing moved, so stores can skip the write.
 * @param changed - The error to throw otherwise (each list words it its own way).
 * @throws ListChangedError (or `changed`) when `order` adds, drops or repeats a film.
 */
export function reorderList(
  list: RankedList,
  order: RankedList,
  changed: () => ListChangedError = () => new ListChangedError(),
): RankedList {
  if (!isSameFilms(list, order)) throw changed()
  return order.every((id, i) => id === list[i]) ? list : [...order]
}

/**
 * A list's films in the person's saved order: films missing from `saved` (added since
 * the last reorder) come first, in the order given (the watchlist's newest first), then the
 * saved order. Saved films no longer on the list are skipped.
 * @param films - The films on the list, newest first.
 * @param saved - The last order the person chose; may be stale.
 */
export function applySavedOrder(films: RankedList, saved: RankedList): RankedList {
  if (saved.length === 0) return films
  const onList = new Set(films)
  const placed = new Set(saved)
  return [...films.filter((id) => !placed.has(id)), ...saved.filter((id) => onList.has(id))]
}
