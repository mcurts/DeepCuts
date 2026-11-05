// Stories for ReorderToggle, the "Reorder"/"Done" button of a ranked shelf.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ReorderToggle } from './ReorderToggle'

const meta = {
  title: 'Components/UI/ReorderToggle',
  component: ReorderToggle,
  args: { active: false, onPress: fn() },
} satisfies Meta<typeof ReorderToggle>
export default meta
type Story = StoryObj<typeof meta>

/** Not reordering: pressing it starts. */
export const Reorder: Story = {}
/** Reordering: pressing it (or Escape) ends the mode. */
export const Done: Story = { args: { active: true } }
