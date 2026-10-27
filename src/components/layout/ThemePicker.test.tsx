// Tests for the footer's theme chooser: it lists every theme by name, starts on the theme already
// on the page, and switching it puts the new theme on the page.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearThemePreference } from '@/adapters/local/LocalThemePreference'
import { DEFAULT_THEME_ID, THEMES, type ThemeInfo } from '@/styles/themes'
import { ThemePicker } from './ThemePicker'

const other = THEMES.find((t) => t.id !== DEFAULT_THEME_ID) as ThemeInfo

beforeEach(() => {
  clearThemePreference()
  delete document.documentElement.dataset.theme
})

describe('ThemePicker', () => {
  it('lists every theme under the label "Look", starting on the default', () => {
    render(<ThemePicker />)
    const select = screen.getByRole('combobox', { name: 'Look' })
    expect(select).toHaveValue(DEFAULT_THEME_ID)
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(
      THEMES.map((t) => t.label),
    )
  })

  it('starts on the theme already on the page (the boot script applied it)', () => {
    document.documentElement.dataset.theme = other.id
    render(<ThemePicker />)
    expect(screen.getByRole('combobox', { name: 'Look' })).toHaveValue(other.id)
  })

  it('switches the page to the chosen theme', async () => {
    render(<ThemePicker />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Look' }), other.id)
    expect(screen.getByRole('combobox', { name: 'Look' })).toHaveValue(other.id)
    await expect.poll(() => document.documentElement.dataset.theme).toBe(other.id)
  })
})
