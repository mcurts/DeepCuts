// Shared contract suite: every TagRepository implementation must pass it unchanged.
import { beforeEach, describe, expect, it } from 'vitest'
import { ListChangedError } from '../domain/ranking'
import type { TagRepository } from './TagRepository'

/** `make` receives a deterministic clock so ordering is testable. */
export function tagRepositoryContract(name: string, make: (now: () => string) => TagRepository) {
  describe(`TagRepository contract: ${name}`, () => {
    let repo: TagRepository
    beforeEach(() => {
      let tick = 0
      repo = make(() => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString())
    })
    const tags = async (id: number) => [...(await repo.getTags(id))].sort()

    it('starts empty', async () => {
      expect(await tags(1)).toEqual([])
      expect(await repo.list('liked')).toEqual([])
      expect(await repo.exportAll()).toEqual([])
    })

    it('applies tagRules on every write, so a film keeps one tag', async () => {
      await repo.setTag(1, 'watchlist', true)
      expect([...(await repo.setTag(1, 'liked', true))]).toEqual(['liked'])
      expect(await repo.list('watchlist')).toEqual([])
      await repo.setTag(1, 'disliked', true)
      expect(await tags(1)).toEqual(['disliked'])
      await repo.setTag(1, 'watchlist', true)
      expect(await tags(1)).toEqual(['watchlist'])
    })

    it('removes a tag, leaving the film with none', async () => {
      await repo.setTag(1, 'liked', true)
      await repo.setTag(1, 'watchlist', false)
      expect(await tags(1)).toEqual(['liked'])
      await repo.setTag(1, 'liked', false)
      expect(await tags(1)).toEqual([])
    })

    it('lists newest first and keeps the original time when re-adding', async () => {
      await repo.setTag(1, 'liked', true)
      await repo.setTag(2, 'liked', true)
      await repo.setTag(3, 'liked', true)
      await repo.setTag(1, 'liked', true)
      expect(await repo.list('liked')).toEqual([3, 2, 1])
    })

    it('a disliked film is excluded from feeds and every list but Disliked', async () => {
      await repo.setTag(1, 'liked', true)
      await repo.setTag(1, 'disliked', true)
      await repo.setTag(2, 'liked', true)
      expect([...(await repo.feedExclusions())]).toEqual([1])
      expect(await repo.list('liked')).toEqual([2])
      expect(await repo.list('disliked')).toEqual([1])
      const excluded = await repo.feedExclusions()
      const discover = [1, 2, 3].filter((id) => !excluded.has(id))
      expect(discover).toEqual([2, 3])
    })

    it('round-trips through exportAll/importAll with the rules intact', async () => {
      await repo.setTag(1, 'liked', true)
      await repo.setTag(2, 'watchlist', true)
      const exported = await repo.exportAll()
      await repo.clear()
      expect(await repo.exportAll()).toEqual([])
      await repo.setTag(2, 'liked', true)
      await repo.importAll(exported)
      expect(await tags(1)).toEqual(['liked'])
      // Imported picks are applied on top of existing tags, so they win (guest picks are the latest intent).
      expect(await tags(2)).toEqual(['watchlist'])
    })

    it('saves a watchlist order; newer films go on top of it', async () => {
      for (const id of [1, 2, 3]) await repo.setTag(id, 'watchlist', true)
      expect(await repo.list('watchlist')).toEqual([3, 2, 1])
      expect(await repo.reorder('watchlist', [1, 3, 2])).toEqual([1, 3, 2])
      expect(await repo.list('watchlist')).toEqual([1, 3, 2])
      // A film added after the reorder goes first, above the chosen order.
      await repo.setTag(4, 'watchlist', true)
      expect(await repo.list('watchlist')).toEqual([4, 1, 3, 2])
      // Other lists stay newest first.
      await repo.setTag(5, 'liked', true)
      await repo.setTag(6, 'liked', true)
      expect(await repo.list('liked')).toEqual([6, 5])
    })

    it('a film that leaves the watchlist and comes back goes on top', async () => {
      for (const id of [1, 2, 3]) await repo.setTag(id, 'watchlist', true)
      await repo.reorder('watchlist', [1, 2, 3])
      // Like takes it off the watchlist (tag rules), and its saved place goes with it.
      await repo.setTag(2, 'liked', true)
      expect(await repo.list('watchlist')).toEqual([1, 3])
      await repo.setTag(2, 'watchlist', true)
      expect(await repo.list('watchlist')).toEqual([2, 1, 3])
    })

    it('refuses an order that adds, drops or repeats a film, and keeps the list', async () => {
      for (const id of [1, 2, 3]) await repo.setTag(id, 'watchlist', true)
      for (const order of [
        [1, 2, 3, 4],
        [1, 2],
        [1, 2, 9],
        [1, 1, 2],
      ])
        await expect(repo.reorder('watchlist', order)).rejects.toBeInstanceOf(ListChangedError)
      expect(await repo.list('watchlist')).toEqual([3, 2, 1])
    })

    it('clearing every tag clears the saved order too', async () => {
      for (const id of [1, 2]) await repo.setTag(id, 'watchlist', true)
      await repo.reorder('watchlist', [1, 2])
      await repo.clear()
      await repo.setTag(1, 'watchlist', true)
      await repo.setTag(2, 'watchlist', true)
      expect(await repo.list('watchlist')).toEqual([2, 1])
    })
  })
}
