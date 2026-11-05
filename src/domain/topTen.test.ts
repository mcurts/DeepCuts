// Tests for the Top Ten rules: ten films at most, no duplicates, ranked order kept.
import { describe, expect, it } from 'vitest'
import {
  addToTopTen,
  isSameFilms,
  isTopTenFull,
  moveInTopTen,
  removeFromTopTen,
  reorderTopTen,
  TopTenChangedError,
  TOP_TEN_SIZE,
  TopTenFullError,
} from './topTen'

const full = Array.from({ length: TOP_TEN_SIZE }, (_, i) => i + 1)

describe('Top Ten rules', () => {
  it('adds a new film at the end without changing the input', () => {
    const list = [7, 8]
    expect(addToTopTen(list, 9)).toEqual([7, 8, 9])
    expect(list).toEqual([7, 8])
  })

  it('returns the same list when the film is already there', () => {
    const list = [7, 8]
    expect(addToTopTen(list, 7)).toBe(list)
    expect(addToTopTen(full, 3)).toBe(full)
  })

  it('refuses an eleventh film', () => {
    expect(isTopTenFull(full)).toBe(true)
    expect(isTopTenFull(full.slice(1))).toBe(false)
    expect(() => addToTopTen(full, 11)).toThrow(TopTenFullError)
  })

  it('removes a film and closes the gap', () => {
    expect(removeFromTopTen([1, 2, 3], 2)).toEqual([1, 3])
    expect(removeFromTopTen([1, 2, 3], 9)).toEqual([1, 2, 3])
  })

  it('moves a film to a new place, shifting the films in between', () => {
    const list = [1, 2, 3, 4]
    expect(moveInTopTen(list, 3, 0)).toEqual([3, 1, 2, 4])
    expect(moveInTopTen(list, 1, 2)).toEqual([2, 3, 1, 4])
    expect(moveInTopTen(list, 2, 3)).toEqual([1, 3, 4, 2])
    expect(list).toEqual([1, 2, 3, 4])
  })

  it('clamps the new place, and leaves the list alone for a missing film or no move', () => {
    const list = [1, 2, 3]
    expect(moveInTopTen(list, 3, -5)).toEqual([3, 1, 2])
    expect(moveInTopTen(list, 1, 99)).toEqual([2, 3, 1])
    expect(moveInTopTen(list, 9, 0)).toBe(list)
    expect(moveInTopTen(list, 2, 1)).toBe(list)
  })

  it('accepts a new order only when it holds exactly the same films', () => {
    const list = [1, 2, 3]
    expect(reorderTopTen(list, [3, 1, 2])).toEqual([3, 1, 2])
    expect(reorderTopTen(list, [1, 2, 3])).toBe(list)
    expect(isSameFilms(list, [2, 3, 1])).toBe(true)
    // Adding, dropping, swapping in or repeating a film all mean the list changed elsewhere.
    for (const order of [
      [1, 2, 3, 4],
      [1, 2],
      [1, 2, 4],
      [1, 1, 2],
      [1, 2, 2],
    ])
      expect(() => reorderTopTen(list, order)).toThrow(TopTenChangedError)
  })
})
