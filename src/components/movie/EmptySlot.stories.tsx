// Stories for EmptySlot, an empty place on a shelf, in a box-sized column.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { EmptySlot } from './EmptySlot'

const meta = {
  title: 'Components/Movie/EmptySlot',
  component: EmptySlot,
  decorators: [
    (Story) => (
      <div className="w-48">
        <Story />
      </div>
    ),
  ],
  args: { title: 'Add a film' },
} satisfies Meta<typeof EmptySlot>
export default meta
type Story = StoryObj<typeof meta>

/** The next open Top Ten slot: a button that sends you to search. */
export const TopTenSlot: Story = {
  args: { mark: '#4', note: 'Slot still open', onPress: fn() },
}
/** The empty watchlist. */
export const EmptyWatchlist: Story = {
  args: { title: 'Nothing on the bill yet', note: 'Search for a film to save it', onPress: fn() },
}
/** No action: information only (Discovery with nothing to pick). */
export const InformationOnly: Story = {
  args: { title: 'Mark a few films “More like this” to get your first picks' },
}
