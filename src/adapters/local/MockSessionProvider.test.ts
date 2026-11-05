// Tests for the local session provider: the shared SessionProvider contract, a retired device
// profile being ignored, a stale demo account name being refreshed, registration never
// storing the invite code, and versionedStore's migration hook.
import { beforeEach, expect, it } from 'vitest'
import { sessionProviderContract } from '../sessionProvider.contract'
import { createMockSessionProvider, RETIRED_PROFILE_KEYS } from './MockSessionProvider'
import { versionedStore } from './versionedStore'
import { z } from 'zod'

beforeEach(() => localStorage.clear())

sessionProviderContract('MockSessionProvider', () => createMockSessionProvider())

it('a device profile saved by an older version is ignored, not read or deleted', async () => {
  localStorage.setItem('deepcuts:v1:profile', JSON.stringify({ displayName: 'Mike' }))
  localStorage.setItem('deepcuts:v1:tags', '[]')
  expect(await createMockSessionProvider().getSession()).toEqual({ kind: 'signedOut' })
  for (const key of RETIRED_PROFILE_KEYS)
    expect(localStorage.getItem(`deepcuts:v1:${key}`)).not.toBeNull()
})

it('a demo account saved under an old name comes back with the current name', async () => {
  // What a browser that signed in before the rename still has stored.
  localStorage.setItem(
    'deepcuts:v1:account',
    JSON.stringify({ id: 'demo', name: 'Alex Rivera', method: 'demo' }),
  )
  expect(await createMockSessionProvider().getSession()).toEqual({
    kind: 'account',
    account: { id: 'demo', name: 'Mike Curts', method: 'demo' },
  })
})

it('registration stores only the name, never the invite code', async () => {
  await createMockSessionProvider().register({ name: 'Ada', invite: 'Zm9vYmFyYmF6cXV4cXV1eA' })
  // Everything this provider wrote to the browser, as one string.
  const stored = Object.keys(localStorage)
    .map((k) => `${k}=${localStorage.getItem(k)}`)
    .join('\n')
  expect(stored).toContain('Ada')
  expect(stored).not.toContain('Zm9vYmFyYmF6cXV4cXV1eA')
})

it('versionedStore runs the migration hook before validating', () => {
  localStorage.setItem('deepcuts:v1:n', '"41"')
  const store = versionedStore({ key: 'n', schema: z.number(), fallback: 0, migrate: Number })
  expect(store.load()).toBe(41)
})
