// Tests for the stale-deploy reload guard (GitHub issue #17): one reload per window, a later one
// allowed, and no reload when storage is unusable.
import { describe, expect, it } from 'vitest'
import { claimReload, RELOAD_WINDOW_MS } from './reloadGuard'

describe('claimReload', () => {
  it('allows the first reload, then refuses another inside the window', () => {
    expect(claimReload(1_000, sessionStorage)).toBe(true)
    expect(claimReload(1_000 + RELOAD_WINDOW_MS - 1, sessionStorage)).toBe(false)
  })

  it('allows a reload again once the window has passed (a later deploy)', () => {
    sessionStorage.clear()
    expect(claimReload(50_000)).toBe(true)
    expect(claimReload(50_000 + RELOAD_WINDOW_MS)).toBe(true)
  })

  it('ignores a stored time in the future', () => {
    sessionStorage.clear()
    expect(claimReload(90_000)).toBe(true)
    expect(claimReload(80_000)).toBe(true)
  })

  it('refuses when storage throws, so it can never loop', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    } as unknown as Storage
    expect(claimReload(1_000, blocked)).toBe(false)
  })
})
