// Stories for AccountUnreachable, the screen shown when the startup session check can't reach the
// accounts server (issue #19): as it first appears, while retrying, and after a retry fails.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { AccountUnreachable } from './AccountUnreachable'

const meta = {
  title: 'Components/Layout/AccountUnreachable',
  component: AccountUnreachable,
  // A retry that still can't reach the server.
  args: { onRetry: async (): Promise<boolean> => false },
} satisfies Meta<typeof AccountUnreachable>
export default meta
type Story = StoryObj<typeof meta>

/** As it first appears. */
export const Default: Story = {}

/** While the session check runs again (the retry never finishes here). */
export const Retrying: Story = {
  args: { onRetry: () => new Promise<boolean>(() => {}) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await expect(await canvas.findByText('Trying again…')).toBeVisible()
  },
}

/** After a retry that still couldn't reach the server. */
export const StillUnreachable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Try again' }))
    await expect(await canvas.findByText(/Still no answer/)).toBeVisible()
  },
}
