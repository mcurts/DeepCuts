// Tests for the shared ranking rules; the Top Ten's own cases are in topTen.test.ts.
import { describe, expect, it } from 'vitest'
import { applySavedOrder, ListChangedError, moveInList, reorderList } from './ranking'

describe('ranking rules', () => {
  it('moves within a list of any length', () => {
    const list = Array.from({ length: 15 }, (_, i) => i + 1)
    expect(moveInList(list, 15, 0).slice(0, 3)).toEqual([15, 1, 2])
  })

  it('refuses a new order for different films with ListChangedError', () => {
    expect(() => reorderList([1, 2], [2, 3])).toThrow(ListChangedError)
    expect(reorderList([1, 2], [2, 1])).toEqual([2, 1])
  })

  it('applies a saved order, newer films first, stale films skipped', () => {
    // Newest first: 9 was added after the last reorder; 4 has left the list since.
    expect(applySavedOrder([9, 3, 2, 1], [1, 4, 2, 3])).toEqual([9, 1, 2, 3])
    // No saved order: the list as given (newest first).
    const films = [3, 2, 1]
    expect(applySavedOrder(films, [])).toBe(films)
  })
})
