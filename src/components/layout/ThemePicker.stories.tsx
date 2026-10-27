// Stories for ThemePicker, the footer's theme chooser (ADR-0056). Its look follows the toolbar's
// Theme menu like every story; switching it here changes the whole Storybook page.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { THEMES } from '@/styles/themes'
import { ThemePicker } from './ThemePicker'

const meta = {
  title: 'Components/Layout/ThemePicker',
  component: ThemePicker,
  args: { className: 'font-label text-sm text-fg-muted' },
} satisfies Meta<typeof ThemePicker>
export default meta
type Story = StoryObj<typeof meta>

/** "Look" with every theme listed by name. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const select = within(canvasElement).getByRole('combobox', { name: 'Look' })
    await expect(within(select).getAllByRole('option')).toHaveLength(THEMES.length)
  },
}
