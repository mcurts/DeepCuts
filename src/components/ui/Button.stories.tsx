// Stories for the app-owned button boundary: the common secondary look, a pending action and a
// quiet text action. Feature components add their product-specific layout around this primitive.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Button } from './Button'

const secondary =
  'flex min-h-11 items-center justify-center rounded-button border-2 border-button-secondary-border bg-button-secondary-background px-5 font-display text-base tracking-widest text-button-secondary-content case-display hover:border-border-accent data-pending:opacity-70'

const meta = {
  title: 'Components/UI/Button',
  component: Button,
  args: { children: 'Continue', className: secondary, onPress: fn() },
} satisfies Meta<typeof Button>
export default meta
type Story = StoryObj<typeof meta>

/** A normal secondary action. */
export const Secondary: Story = {}

/** An action while its asynchronous work is running. */
export const Pending: Story = { args: { isPending: true, children: 'Saving…' } }

/** A low-emphasis action used beside a destructive confirmation. */
export const Quiet: Story = {
  args: {
    children: 'Cancel',
    className: 'flex min-h-11 items-center px-2 text-sm font-bold text-content-accent',
  },
}
