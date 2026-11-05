// Tests for tags saved in this browser: the shared TagRepository contract, plus storage under a
// versioned key that survives a new instance (like a page reload).
import { beforeEach, describe, expect, it } from 'vitest'
import { tagRepositoryContract } from '../tagRepository.contract'
import { createLocalTagRepository } from './LocalTagRepository'

beforeEach(() => localStorage.clear())

// The demo account's key; any account key behaves the same.
const KEY = 'account-demo-tags'
const open = (now?: () => string) => createLocalTagRepository(undefined, now, KEY)

tagRepositoryContract('LocalTagRepository', (now) => open(now))

describe('LocalTagRepository storage', () => {
  it('persists under a versioned key and survives a new instance', async () => {
    await open().setTag(7, 'liked', true)
    expect(localStorage.getItem(`deepcuts:v1:${KEY}`)).toContain('"tmdbId":7')
    expect([...(await open().getTags(7))]).toEqual(['liked'])
  })

  it.each(['not json', '{"tags":1}', '[{"tmdbId":-1,"tag":"liked","createdAt":"x"}]'])(
    'resets corrupt data (%s) to empty',
    async (raw) => {
      localStorage.setItem(`deepcuts:v1:${KEY}`, raw)
      expect(await open().list('liked')).toEqual([])
      expect(localStorage.getItem(`deepcuts:v1:${KEY}`)).toBeNull()
    },
  )

  it('drops saved "Seen it" records and keeps one tag per film, losing nothing else', async () => {
    const at = (s: number) => `2026-10-0${s}T12:00:00.000Z`
    localStorage.setItem(
      `deepcuts:v1:${KEY}`,
      JSON.stringify([
        { tmdbId: 1, tag: 'seen', createdAt: at(1) },
        { tmdbId: 1, tag: 'liked', createdAt: at(2) },
        // Film 2 was Liked, then put on the watchlist: the newer tag wins.
        { tmdbId: 2, tag: 'liked', createdAt: at(3) },
        { tmdbId: 2, tag: 'watchlist', createdAt: at(4) },
        { tmdbId: 3, tag: 'seen', createdAt: at(5) },
        // Equal times: the record stored later wins.
        { tmdbId: 4, tag: 'watchlist', createdAt: at(6) },
        { tmdbId: 4, tag: 'liked', createdAt: at(6) },
      ]),
    )
    const repo = open()
    expect(await repo.list('liked')).toEqual([4, 1])
    expect(await repo.list('watchlist')).toEqual([2])
    expect([...(await repo.getTags(3))]).toEqual([])
    // The next change saves the cleaned list.
    await repo.setTag(5, 'disliked', true)
    expect(localStorage.getItem(`deepcuts:v1:${KEY}`)).not.toContain('seen')
  })
})
