// Tests for the Cloudflare adapters (ADR-0031, Stage 6 A4): both pass the shared contract suites
// against a fake accounts API (MSW), and handle what's specific to them: the passkey prompt being
// cancelled, server errors, the demo staying on the device, rename/delete, the 30-second reuse
// of fetched tags, and the "session ended" signal on a 401 (issue #18). The browser's passkey
// prompt is stubbed here; the real one is covered by the Playwright test with a virtual
// authenticator.
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeAccountsApi } from '../../test/msw/fakeAccountsApi'
import { server } from '../../test/msw/server'
import { createMockSessionProvider } from '../local/MockSessionProvider'
import { sessionProviderContract } from '../sessionProvider.contract'
import { tagRepositoryContract } from '../tagRepository.contract'
import { topTenRepositoryContract } from '../topTenRepository.contract'
import { TopTenFullError } from '../../domain/topTen'
import { createCloudflareSessionProvider } from './CloudflareSessionProvider'
import { createCloudflareTagRepository, TagApiError } from './CloudflareTagRepository'
import { createCloudflareTopTenRepository, TopTenApiError } from './CloudflareTopTenRepository'
import { onSessionEnded } from './sessionEnded'

// The device's answer to the passkey prompt. Tests make it reject to imitate "Cancel".
const prompt = vi.hoisted(() => ({
  startRegistration: vi.fn(async () => ({ id: 'cred', type: 'public-key' })),
  startAuthentication: vi.fn(async () => ({ id: 'cred', type: 'public-key' })),
}))
vi.mock('@simplewebauthn/browser', () => prompt)

let api: ReturnType<typeof createFakeAccountsApi>
beforeEach(() => {
  api = createFakeAccountsApi()
  server.use(...api.handlers)
})

sessionProviderContract('CloudflareSessionProvider', () => createCloudflareSessionProvider())

describe('TagRepository contract: CloudflareTagRepository', () => {
  // The fake server stamps tags with the contract's deterministic clock, like the real one would.
  tagRepositoryContract('CloudflareTagRepository', (now) => {
    const fake = createFakeAccountsApi(now)
    fake.state.signedIn = { id: 'u', name: 'U' }
    server.use(...fake.handlers)
    return createCloudflareTagRepository()
  })
})

describe('CloudflareSessionProvider', () => {
  it('offers the passkey first and keeps the demo account (ADR-0025)', () => {
    expect(
      createCloudflareSessionProvider()
        .signInMethods()
        .map((m) => m.id),
    ).toEqual(['passkey', 'demo'])
    expect(createCloudflareSessionProvider().practiceRegistration).toBe(false)
  })

  it('registers a real passkey account', async () => {
    const session = await createCloudflareSessionProvider().register({
      name: 'Mike',
      invite: 'A'.repeat(22),
    })
    expect(session).toEqual({
      kind: 'account',
      account: { id: 'user-1', name: 'Mike', method: 'passkey' },
    })
    expect(prompt.startRegistration).toHaveBeenCalledWith({
      optionsJSON: { challenge: 'challenge' },
    })
  })

  it('reports a refused invite with its code, and changes nothing', async () => {
    api.state.rejectInvite = true
    const provider = createCloudflareSessionProvider()
    await expect(provider.register({ name: 'Mike', invite: 'A'.repeat(22) })).rejects.toMatchObject(
      {
        status: 400,
        code: 'invalid_invite',
      },
    )
    expect(await provider.getSession()).toEqual({ kind: 'signedOut' })
  })

  it('a cancelled passkey prompt rejects and leaves the person signed out', async () => {
    prompt.startAuthentication.mockRejectedValueOnce(
      Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }),
    )
    const provider = createCloudflareSessionProvider()
    await expect(provider.signIn('passkey')).rejects.toThrow('cancelled')
    expect(await provider.getSession()).toEqual({ kind: 'signedOut' })
  })

  it('keeps the demo account on this device, never on the server', async () => {
    const provider = createCloudflareSessionProvider()
    const session = await provider.signIn('demo')
    expect(session).toMatchObject({ kind: 'account', account: { method: 'demo' } })
    expect(api.state.signedIn).toBeNull()
    expect(await createCloudflareSessionProvider().getSession()).toEqual(session)
  })

  it('falls back to what this device has when the API is unreachable', async () => {
    const demo = await createMockSessionProvider().signIn('demo')
    server.use(http.get('/api/auth/session', () => HttpResponse.error()))
    expect(await createCloudflareSessionProvider().getSession()).toEqual(demo)
  })

  // Issue #19: when the server can't say, the session check rejects instead of showing signed out,
  // so a signed-in person isn't quietly shown the landing page.
  it.each([
    ['no network', () => HttpResponse.error()],
    ['a 5xx (e.g. the Functions quota used up)', () => new HttpResponse('quota', { status: 503 })],
    ['HTML instead of JSON (Functions skipped)', () => HttpResponse.html('<html>')],
    ['a 429', () => HttpResponse.json({ error: 'rate_limited' }, { status: 429 })],
  ])('rejects the session check on %s, rather than saying signed out', async (_, answer) => {
    server.use(http.get('/api/auth/session', answer))
    await expect(createCloudflareSessionProvider().getSession()).rejects.toBeDefined()
  })

  it('gives up on a session check that hangs, after 5 seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      // Never answers.
      server.use(http.get('/api/auth/session', () => new Promise<Response>(() => {})))
      const check = createCloudflareSessionProvider().getSession()
      const settled = vi.fn()
      check.then(settled, settled)
      await vi.advanceTimersByTimeAsync(4_900)
      expect(settled).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(100)
      await expect(check).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('treats a 401 from the session check as signed out', async () => {
    server.use(
      http.get('/api/auth/session', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    )
    expect(await createCloudflareSessionProvider().getSession()).toEqual({ kind: 'signedOut' })
  })

  it('treats a non-JSON answer (Functions skipped) as an error, not a session', async () => {
    server.use(http.post('/api/auth/authenticate/options', () => HttpResponse.html('<html>')))
    await expect(createCloudflareSessionProvider().signIn('passkey')).rejects.toMatchObject({
      status: 502,
      code: 'bad_response',
    })
  })

  it('renames and deletes the signed-in account (A2b)', async () => {
    const provider = createCloudflareSessionProvider()
    await provider.signIn('passkey')
    expect(await provider.rename?.('New Name')).toMatchObject({ account: { name: 'New Name' } })
    expect(await provider.deleteAccount?.()).toEqual({ kind: 'signedOut' })
    expect(api.state.users.size).toBe(0)
    expect(await provider.getSession()).toEqual({ kind: 'signedOut' })
  })
})

describe('CloudflareTagRepository', () => {
  beforeEach(() => void (api.state.signedIn = { id: 'u', name: 'U' }))

  it('reuses fetched tags for 30 seconds, and refetches after a change', async () => {
    let gets = 0
    server.use(
      http.get('/api/tags', () => {
        gets++
        return HttpResponse.json({ records: [] })
      }),
    )
    let t = 0
    const repo = createCloudflareTagRepository(() => t)
    await repo.list('watchlist')
    await repo.list('liked')
    await repo.feedExclusions()
    expect(gets).toBe(1)
    t = 30_001
    await repo.getTags(1)
    expect(gets).toBe(2)
    await repo.setTag(1, 'liked', true)
    await repo.getTags(1)
    expect(gets).toBe(3)
  })

  it('throws on errors and on answers that fail validation', async () => {
    server.use(http.get('/api/tags', () => HttpResponse.json({ error: 'x' }, { status: 401 })))
    await expect(createCloudflareTagRepository().list('liked')).rejects.toEqual(
      new TagApiError(401),
    )
    server.use(http.get('/api/tags', () => HttpResponse.json({ records: [{ tmdbId: -1 }] })))
    await expect(createCloudflareTagRepository().list('liked')).rejects.toEqual(
      new TagApiError(502),
    )
  })

  it('ADR-0050: skips "Seen it" rows the server still holds instead of failing', async () => {
    const at = '2026-10-01T12:00:00.000Z'
    server.use(
      http.get('/api/tags', () =>
        HttpResponse.json({
          records: [
            { tmdbId: 1, tag: 'seen', createdAt: at },
            { tmdbId: 2, tag: 'liked', createdAt: at },
          ],
        }),
      ),
    )
    const repo = createCloudflareTagRepository()
    expect(await repo.list('liked')).toEqual([2])
    expect([...(await repo.getTags(1))]).toEqual([])
  })

  it('imports in batches of at most 5,000', async () => {
    const sizes: number[] = []
    server.use(
      http.post('/api/tags/import', async ({ request }) => {
        sizes.push(((await request.json()) as { records: unknown[] }).records.length)
        return HttpResponse.json({ ok: true })
      }),
    )
    const record = { tmdbId: 1, tag: 'liked' as const, createdAt: '2026-01-01T00:00:00.000Z' }
    await createCloudflareTagRepository().importAll(Array(12_000).fill(record))
    expect(sizes).toEqual([5000, 5000, 2000])
  })
})

describe('CloudflareTopTenRepository', () => {
  topTenRepositoryContract('CloudflareTopTenRepository', () => {
    const fake = createFakeAccountsApi()
    fake.state.signedIn = { id: 'u', name: 'U' }
    server.use(...fake.handlers)
    return createCloudflareTopTenRepository()
  })

  it('turns 409 top_ten_full into TopTenFullError, and other failures into TopTenApiError', async () => {
    const repo = createCloudflareTopTenRepository()
    server.use(
      http.put('/api/top-ten', () => HttpResponse.json({ error: 'top_ten_full' }, { status: 409 })),
      http.delete('/api/top-ten', () => HttpResponse.json({ error: 'nope' }, { status: 500 })),
    )
    await expect(repo.add(1)).rejects.toBeInstanceOf(TopTenFullError)
    await expect(repo.remove(1)).rejects.toMatchObject({ status: 500 })
    // Signed out on the server: a plain API error, never an empty list that looks like success.
    await expect(repo.list()).rejects.toBeInstanceOf(TopTenApiError)
  })

  it('refuses an answer that is not a valid list', async () => {
    server.use(
      http.get('/api/top-ten', () => HttpResponse.json({ films: [1, 1] })),
      http.put('/api/top-ten', () => new HttpResponse('<html>', { status: 200 })),
    )
    const repo = createCloudflareTopTenRepository()
    await expect(repo.list()).rejects.toMatchObject({ status: 502 })
    await expect(repo.add(1)).rejects.toMatchObject({ status: 502 })
  })
})

describe('the session-ended signal (issue #18)', () => {
  // Listens for the signal for the length of one test.
  function listen() {
    const ended = vi.fn()
    const stop = onSessionEnded(ended)
    return { ended, stop }
  }

  it('fires on a 401 from the tags, Top Ten and account APIs, before the call rejects', async () => {
    // The fake API answers 401 to everything that needs a session: nobody is signed in.
    const { ended, stop } = listen()
    await expect(createCloudflareTagRepository().setTag(1, 'liked', true)).rejects.toMatchObject({
      status: 401,
    })
    expect(ended).toHaveBeenCalledTimes(1)
    await expect(createCloudflareTopTenRepository().list()).rejects.toMatchObject({ status: 401 })
    expect(ended).toHaveBeenCalledTimes(2)
    await expect(createCloudflareSessionProvider().rename?.('X')).rejects.toMatchObject({
      status: 401,
    })
    expect(ended).toHaveBeenCalledTimes(3)
    stop()
  })

  it('stays quiet for other failures, and after the listener stops', async () => {
    const { ended, stop } = listen()
    server.use(http.get('/api/tags', () => HttpResponse.json({ error: 'x' }, { status: 500 })))
    await expect(createCloudflareTagRepository().list('liked')).rejects.toBeInstanceOf(TagApiError)
    expect(ended).not.toHaveBeenCalled()
    stop()
    await expect(createCloudflareTopTenRepository().list()).rejects.toBeInstanceOf(TopTenApiError)
    expect(ended).not.toHaveBeenCalled()
  })
})
