// An in-memory fake of the accounts API (`/api/auth/*`, `/api/tags*`, `/api/top-ten`) for unit tests of the
// Cloudflare adapters and the screens (Stage 6 A4). It behaves like the real Functions
// from the client's side (status codes, bodies, the tag rules) but keeps one "browser" session in
// a variable instead of a cookie. The real server is tested on its own (server/accounts/).
import { http, HttpResponse } from 'msw'
import {
  createTagRepository,
  memoryOrderStore,
  type OrderStore,
} from '../../adapters/createTagRepository'
import { createTopTenRepository } from '../../adapters/createTopTenRepository'
import type { TagRecord, TagRepository } from '../../adapters/TagRepository'
import type { TopTenRepository } from '../../adapters/TopTenRepository'
import { SYSTEM_TAGS, type SystemTag } from '../../domain/tagRules'
import { ListChangedError } from '../../domain/ranking'
import { TopTenChangedError, TopTenFullError, type TopTenList } from '../../domain/topTen'

type User = { id: string; name: string }

/**
 * Creates the fake. `now` stamps new tags (the contract suite passes a deterministic clock).
 * Pass `handlers` to `server.use(...)`.
 */
export function createFakeAccountsApi(now: () => string = () => new Date().toISOString()) {
  const state = {
    /** Who the "browser" is signed in as. */
    signedIn: null as User | null,
    /** Every registered user, by id. */
    users: new Map<string, User>(),
    /** Each user's tags, kept with the same shared rules the real server applies. */
    tags: new Map<string, TagRepository>(),
    /** Each user's saved watchlist order, kept by the same shared tag store. */
    watchlistOrder: new Map<string, OrderStore>(),
    /** Each user's Top Ten, kept with the same shared rules the real server applies. */
    topTen: new Map<string, TopTenRepository>(),
    /** Set to make the next registration fail, as with a used invite. */
    rejectInvite: false,
  }
  const tagsOf = (id: string) => {
    if (!state.tags.has(id)) {
      let records: TagRecord[] = []
      const order = memoryOrderStore()
      state.watchlistOrder.set(id, order)
      state.tags.set(
        id,
        createTagRepository({ load: () => records, save: (r) => void (records = r) }, now, order),
      )
    }
    return state.tags.get(id) as TagRepository
  }
  const topTenOf = (id: string) => {
    if (!state.topTen.has(id)) {
      let list: TopTenList = []
      state.topTen.set(
        id,
        createTopTenRepository({ load: () => list, save: (l) => void (list = l) }),
      )
    }
    return state.topTen.get(id) as TopTenRepository
  }
  const signedOut = () => HttpResponse.json({ error: 'signed_out' }, { status: 401 })
  const options = () =>
    HttpResponse.json({ challengeId: 'C'.repeat(22), options: { challenge: 'challenge' } })
  let lastRegisteringName = ''

  const handlers = [
    http.get('/api/auth/session', () => HttpResponse.json(state.signedIn)),
    http.post('/api/auth/register/options', async ({ request }) => {
      if (state.rejectInvite) return HttpResponse.json({ error: 'invalid_invite' }, { status: 400 })
      lastRegisteringName = ((await request.json()) as { name: string }).name
      return options()
    }),
    http.post('/api/auth/register/verify', () => {
      const user = { id: `user-${state.users.size + 1}`, name: lastRegisteringName }
      state.users.set(user.id, user)
      state.signedIn = user
      return HttpResponse.json(user)
    }),
    http.post('/api/auth/authenticate/options', options),
    http.post('/api/auth/authenticate/verify', () => {
      // The device "chooses" the first registered passkey, or a ready-made account.
      const user = [...state.users.values()][0] ?? { id: 'passkey-user', name: 'Pat Key' }
      state.users.set(user.id, user)
      state.signedIn = user
      return HttpResponse.json(user)
    }),
    http.post('/api/auth/sign-out', () => {
      state.signedIn = null
      return HttpResponse.json({ ok: true })
    }),
    http.patch('/api/auth/me', async ({ request }) => {
      if (!state.signedIn) return signedOut()
      const { name } = (await request.json()) as { name: string }
      state.signedIn = { ...state.signedIn, name: name.trim() }
      state.users.set(state.signedIn.id, state.signedIn)
      return HttpResponse.json(state.signedIn)
    }),
    http.delete('/api/auth/me', () => {
      if (!state.signedIn) return signedOut()
      state.users.delete(state.signedIn.id)
      state.tags.delete(state.signedIn.id)
      state.watchlistOrder.delete(state.signedIn.id)
      state.topTen.delete(state.signedIn.id)
      state.signedIn = null
      return HttpResponse.json({ ok: true })
    }),
    http.get('/api/tags', async () => {
      if (!state.signedIn) return signedOut()
      const records = await tagsOf(state.signedIn.id).exportAll()
      const watchlistOrder = state.watchlistOrder.get(state.signedIn.id)?.load() ?? []
      return HttpResponse.json({ records, watchlistOrder })
    }),
    http.patch('/api/tags/order', async ({ request }) => {
      if (!state.signedIn) return signedOut()
      const { ids } = (await request.json()) as { tag: 'watchlist'; ids: number[] }
      try {
        return HttpResponse.json({ ids: await tagsOf(state.signedIn.id).reorder('watchlist', ids) })
      } catch (e) {
        if (e instanceof ListChangedError)
          return HttpResponse.json({ error: 'list_changed' }, { status: 409 })
        throw e
      }
    }),
    http.put('/api/tags', async ({ request }) => {
      if (!state.signedIn) return signedOut()
      const { tmdbId, tag } = (await request.json()) as { tmdbId: number; tag: SystemTag }
      if (!SYSTEM_TAGS.includes(tag))
        return HttpResponse.json({ error: 'bad_request' }, { status: 400 })
      return HttpResponse.json({
        tags: [...(await tagsOf(state.signedIn.id).setTag(tmdbId, tag, true))],
      })
    }),
    http.delete('/api/tags', async ({ request }) => {
      if (!state.signedIn) return signedOut()
      const body = (await request.json()) as { tmdbId: number; tag: SystemTag } | { all: true }
      const repo = tagsOf(state.signedIn.id)
      if ('all' in body) {
        await repo.clear()
        return HttpResponse.json({ tags: [] })
      }
      return HttpResponse.json({ tags: [...(await repo.setTag(body.tmdbId, body.tag, false))] })
    }),
    http.post('/api/tags/import', async ({ request }) => {
      if (!state.signedIn) return signedOut()
      const { records } = (await request.json()) as { records: TagRecord[] }
      await tagsOf(state.signedIn.id).importAll(records)
      return HttpResponse.json({ ok: true })
    }),
    http.get('/api/top-ten', async () => {
      if (!state.signedIn) return signedOut()
      return HttpResponse.json({ films: await topTenOf(state.signedIn.id).list() })
    }),
    http.put('/api/top-ten', async ({ request }) => {
      if (!state.signedIn) return signedOut()
      const { tmdbId } = (await request.json()) as { tmdbId: number }
      try {
        return HttpResponse.json({ films: await topTenOf(state.signedIn.id).add(tmdbId) })
      } catch (e) {
        if (e instanceof TopTenFullError)
          return HttpResponse.json({ error: 'top_ten_full' }, { status: 409 })
        throw e
      }
    }),
    http.delete('/api/top-ten', async ({ request }) => {
      if (!state.signedIn) return signedOut()
      const { tmdbId } = (await request.json()) as { tmdbId: number }
      return HttpResponse.json({ films: await topTenOf(state.signedIn.id).remove(tmdbId) })
    }),
    http.patch('/api/top-ten', async ({ request }) => {
      if (!state.signedIn) return signedOut()
      const { ids } = (await request.json()) as { ids: number[] }
      try {
        return HttpResponse.json({ films: await topTenOf(state.signedIn.id).reorder(ids) })
      } catch (e) {
        if (e instanceof TopTenChangedError)
          return HttpResponse.json({ error: 'top_ten_changed' }, { status: 409 })
        throw e
      }
    }),
  ]

  return { state, handlers }
}
