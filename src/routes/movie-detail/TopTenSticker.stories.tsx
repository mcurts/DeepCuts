// Stories for the Top Ten shelf-talker stickers on Detail: TopTenSticker, the "Add to
// Top 10" button, and TopTenPick, the sticker once the film is in the list.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { TopTenPick, TopTenSticker } from './TopTenSticker'

const meta = {
  title: 'Pages/Movie detail/TopTenSticker',
  component: TopTenSticker,
  args: { onPress: () => {} },
  // Some room around it, so the tilt, tape and drop shadow aren't cut off.
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TopTenSticker>
export default meta
type Story = StoryObj<typeof meta>

/** Ready to press. */
export const Default: Story = {}

/** While the add is being saved: faded, and presses are ignored. */
export const Pending: Story = { args: { pending: true } }

/** The film is in the Top Ten: its rank, with Remove. */
export const InTopTen: Story = {
  render: () => <TopTenPick rank={4} onRemove={() => {}} />,
}

/** While the removal is being saved. */
export const Removing: Story = {
  render: () => <TopTenPick rank={4} onRemove={() => {}} pending />,
}
