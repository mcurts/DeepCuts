// Shared contract suite: every TopTenRepository implementation must pass it unchanged,
// so the browser store, the server store and the test fakes all follow the same Top Ten rules.
import { beforeEach, describe, expect, it } from 'vitest'
import { TopTenChangedError, TopTenFullError } from '../domain/topTen'
import type { TopTenRepository } from './TopTenRepository'

/** `make` returns a fresh, empty store for each test. */
export function topTenRepositoryContract(name: string, make: () => TopTenRepository) {
  describe(`TopTenRepository contract: ${name}`, () => {
    let repo: TopTenRepository
    beforeEach(() => {
      repo = make()
    })

    it('starts empty', async () => {
      expect(await repo.list()).toEqual([])
    })

    it('adds films at the end, in the order they were added', async () => {
      await repo.add(5)
      expect(await repo.add(3)).toEqual([5, 3])
      expect(await repo.list()).toEqual([5, 3])
    })

    it('adding a film twice keeps one copy in its first place', async () => {
      await repo.add(5)
      await repo.add(3)
      expect(await repo.add(5)).toEqual([5, 3])
    })

    it('removing a film moves the films below it up', async () => {
      for (const id of [1, 2, 3]) await repo.add(id)
      expect(await repo.remove(2)).toEqual([1, 3])
      expect(await repo.list()).toEqual([1, 3])
      // Removing a film that isn't there changes nothing.
      expect(await repo.remove(99)).toEqual([1, 3])
    })

    it('holds at most ten films and refuses an eleventh', async () => {
      for (let id = 1; id <= 10; id++) await repo.add(id)
      await expect(repo.add(11)).rejects.toBeInstanceOf(TopTenFullError)
      expect(await repo.list()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      // A film already on a full list is not "new", so adding it again is fine.
      expect(await repo.add(4)).toHaveLength(10)
      // Removing one makes room again.
      await repo.remove(1)
      expect(await repo.add(11)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    })

    it('saves a new order for the same films', async () => {
      for (const id of [1, 2, 3]) await repo.add(id)
      expect(await repo.reorder([3, 1, 2])).toEqual([3, 1, 2])
      expect(await repo.list()).toEqual([3, 1, 2])
      // New films still go at the end of the new order, and removing one closes the gap.
      expect(await repo.add(4)).toEqual([3, 1, 2, 4])
      expect(await repo.remove(1)).toEqual([3, 2, 4])
    })

    it('refuses an order that adds, drops or repeats a film, and keeps the list', async () => {
      for (const id of [1, 2, 3]) await repo.add(id)
      for (const order of [
        [1, 2, 3, 4],
        [1, 2],
        [1, 2, 9],
        [1, 1, 2],
      ])
        await expect(repo.reorder(order)).rejects.toBeInstanceOf(TopTenChangedError)
      expect(await repo.list()).toEqual([1, 2, 3])
    })
  })
}
