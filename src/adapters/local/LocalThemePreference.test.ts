// Tests for the saved theme choice: it round-trips under the versioned key the boot script reads,
// a corrupt value is dropped, and blocked storage never throws.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearThemePreference,
  loadThemePreference,
  saveThemePreference,
} from './LocalThemePreference'

beforeEach(() => localStorage.clear())

/** A storage that refuses every read and write, like some privacy modes. */
const blocked = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
} as unknown as Storage

describe('LocalThemePreference', () => {
  it('is null until a theme is saved', () => {
    expect(loadThemePreference()).toBeNull()
  })

  it('saves under deepcuts:v1:theme as JSON, which the boot script parses', () => {
    saveThemePreference('midnight-rental')
    expect(localStorage.getItem('deepcuts:v1:theme')).toBe('"midnight-rental"')
    expect(loadThemePreference()).toBe('midnight-rental')
  })

  it('forgets the saved theme', () => {
    saveThemePreference('midnight-rental')
    clearThemePreference()
    expect(loadThemePreference()).toBeNull()
  })

  it('drops a corrupt value', () => {
    localStorage.setItem('deepcuts:v1:theme', '{not json')
    expect(loadThemePreference()).toBeNull()
    expect(localStorage.getItem('deepcuts:v1:theme')).toBeNull()
  })

  it('treats blocked storage as nothing saved, and saving to it as a no-op', () => {
    expect(loadThemePreference(blocked)).toBeNull()
    expect(() => saveThemePreference('midnight-rental', blocked)).not.toThrow()
    expect(() => clearThemePreference(blocked)).not.toThrow()
  })
})
