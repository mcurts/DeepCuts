// Stories for Eyebrow, the small uppercase label above headings, in each tone.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Eyebrow } from './Eyebrow'

const meta = {
  title: 'Components/UI/Eyebrow',
  component: Eyebrow,
  args: { children: 'Your corner' },
} satisfies Meta<typeof Eyebrow>
export default meta
type Story = StoryObj<typeof meta>

export const Accent: Story = {}
/** Follows the page accent, e.g. a tag's color on a filtered list. */
export const Contextual: Story = { args: { tone: 'contextual' } }
export const Muted: Story = { args: { tone: 'muted' } }
