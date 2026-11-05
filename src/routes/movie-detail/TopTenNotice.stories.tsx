// Stories for TopTenNotice, the line Detail shows instead of the Top Ten sticker.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { TopTenNotice } from './TopTenNotice'

const meta = {
  title: 'Pages/Movie detail/TopTenNotice',
  component: TopTenNotice,
  args: { children: 'Your Top Ten is full.' },
} satisfies Meta<typeof TopTenNotice>
export default meta
type Story = StoryObj<typeof meta>

/** The list is full and this film isn't in it. */
export const Full: Story = {}
