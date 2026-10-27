// Tests for the signed-in hint (ADR-0057) and the boot script that reads it: the app writes the
// key the script reads, and the script hides the pre-rendered landing page only when this visit
// won't show it (another address, or signed in).
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveSignedInHint } from './signedInHint'

const bootScript = readFileSync('public/shell-boot.js', 'utf8')

/** Runs public/shell-boot.js at `path`, as the browser does before the first paint. */
function boot(path: string) {
  window.history.replaceState(null, '', path)
  new Function(bootScript)()
  return document.documentElement.getAttribute('data-shell')
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  document.documentElement.removeAttribute('data-shell')
  window.history.replaceState(null, '', '/')
})

describe('saveSignedInHint', () => {
  it('stores true while signed in and removes the key when signed out', () => {
    saveSignedInHint(true)
    expect(localStorage.getItem('deepcuts:v1:signed-in')).toBe('true')
    saveSignedInHint(false)
    expect(localStorage.getItem('deepcuts:v1:signed-in')).toBeNull()
  })

  it('never throws when storage is blocked', () => {
    const blocked = {
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    expect(() => saveSignedInHint(true, blocked)).not.toThrow()
    expect(() => saveSignedInHint(false, blocked)).not.toThrow()
  })
})

describe('shell-boot.js', () => {
  it('keeps the landing page for a signed-out visit to /', () => {
    expect(boot('/')).toBeNull()
  })

  it('hides it at / once the app has recorded a sign-in', () => {
    saveSignedInHint(true)
    expect(boot('/')).toBe('off')
  })

  it('hides it at every other address, signed in or not', () => {
    expect(boot('/movie/1091')).toBe('off')
    expect(boot('/sign-in')).toBe('off')
  })

  it('keeps it when the stored hint is corrupt', () => {
    localStorage.setItem('deepcuts:v1:signed-in', '{nope')
    expect(boot('/')).toBeNull()
  })
})
