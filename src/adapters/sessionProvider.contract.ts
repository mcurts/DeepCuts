// Shared contract suite: every SessionProvider implementation must pass it unchanged.
import { describe, expect, it } from 'vitest'
import type { SessionProvider } from './SessionProvider'

export function sessionProviderContract(name: string, make: () => SessionProvider) {
  describe(`SessionProvider contract: ${name}`, () => {
    it('starts signed out', async () => {
      expect(await make().getSession()).toEqual({ kind: 'signedOut' })
    })

    it('offers at least one sign-in method, each with a label and description', () => {
      const methods = make().signInMethods()
      expect(methods.length).toBeGreaterThan(0)
      for (const m of methods) {
        expect(m.label).not.toBe('')
        expect(m.description).not.toBe('')
      }
    })

    it('signs in with an offered method, survives a reload, and signs out', async () => {
      const provider = make()
      const method = provider.signInMethods()[0]
      if (!method) throw new Error('no sign-in method offered')
      const session = await provider.signIn(method.id)
      expect(session.kind).toBe('account')
      expect(await make().getSession()).toEqual(session)
      expect(await provider.signOut()).toEqual({ kind: 'signedOut' })
      expect(await make().getSession()).toEqual({ kind: 'signedOut' })
    })

    it('registers an account that survives a reload, and signs out', async () => {
      const provider = make()
      const session = await provider.register({
        name: '  Ada Lovelace ',
        invite: 'AAAAAAAAAAAAAAAAAAAAAA',
      })
      expect(session).toMatchObject({ kind: 'account', account: { name: 'Ada Lovelace' } })
      expect(await make().getSession()).toEqual(session)
      expect(await provider.signOut()).toEqual({ kind: 'signedOut' })
    })

    it('rejects invalid registration details', async () => {
      const valid = { name: 'Ada', invite: 'AAAAAAAAAAAAAAAAAAAAAA' }
      await expect(make().register({ ...valid, name: '  ' })).rejects.toThrow()
      await expect(make().register({ ...valid, invite: '' })).rejects.toThrow()
      await expect(make().register({ ...valid, invite: 'short' })).rejects.toThrow()
      await expect(
        make().register({ ...valid, invite: '<script>AAAAAAAAAAAAAA' }),
      ).rejects.toThrow()
      expect(await make().getSession()).toEqual({ kind: 'signedOut' })
    })

    it('rejects a method it does not offer', async () => {
      // @ts-expect-error -- a method id the provider doesn't know
      await expect(make().signIn('carrier-pigeon')).rejects.toThrow()
    })
  })
}
