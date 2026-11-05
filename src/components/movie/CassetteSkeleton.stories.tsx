// Stories for CassetteSkeleton, a film tile's placeholder while it loads: one at a
// phone tile's width, a shelf of them as Home shows while its films load, and the single row
// shown while a whole list loads.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CassetteSkeleton, CassetteSkeletonRow } from './CassetteSkeleton'
import { SHELF_GRID } from './ShelfSection'

const meta = {
  title: 'Components/Movie/CassetteSkeleton',
  component: CassetteSkeleton,
} satisfies Meta<typeof CassetteSkeleton>
export default meta
type Story = StoryObj<typeof meta>

/** One placeholder, at a phone-width tile (136px). */
export const Single: Story = {
  decorators: [
    (Story) => (
      <div className="flex w-34">
        <Story />
      </div>
    ),
  ],
}

/** A shelf's row of placeholders on the shelf grid. */
export const ShelfRow: Story = {
  render: () => (
    <ul className={SHELF_GRID}>
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="flex">
          <CassetteSkeleton />
        </li>
      ))}
    </ul>
  ),
}

/** A list that hasn't loaded yet: one row at any width (resize to see it hold one row). */
export const LoadingList: Story = { render: () => <CassetteSkeletonRow /> }
