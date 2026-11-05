// Stories for ReorderTile, a Top Ten film in Home's reorder mode, and DropSlot, what a
// tile shows while another film is dragged over it. Each sits in a box-sized column, as on Home.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { searchResultsSchema } from '@/api/tmdb'
import { searchFixture } from '@/test/msw/fixtures'
import { DropSlot, ReorderTile } from './ReorderTile'
import { VhsBox } from './VhsBox'

// The same hand-written film the tests use, validated like real API data.
const [film] = searchResultsSchema.parse(searchFixture).results
if (!film) throw new Error('The search fixture needs at least one film')

const meta = {
  title: 'Components/Movie/ReorderTile',
  component: ReorderTile,
  decorators: [
    (Story) => (
      <ol className="w-48">
        <li className="flex">
          <Story />
        </li>
      </ol>
    ),
  ],
  args: { movie: film, rank: 2, total: 5, onMove: fn(), onDropFilm: fn(), onDragChange: fn() },
} satisfies Meta<typeof ReorderTile>
export default meta
type Story = StoryObj<typeof meta>

/** A film in the middle of the list: it can move both ways. */
export const Middle: Story = {}
/** Number one: no "earlier" button, and "later" stays on the right. */
export const First: Story = { args: { rank: 1 } }
/** The last film: no "later" button. */
export const Last: Story = { args: { rank: 5 } }
/** The film being dragged: dimmed in place. */
export const Dragged: Story = { args: { isDragged: true } }
/** A long title: two lines, then an ellipsis; the buttons stay put. */
export const LongTitle: Story = {
  args: { movie: { ...film, title: 'Dr. Strangelove or: How I Learned to Stop Worrying' } },
}

/** Another film dragged over this one: the open-slot outline says it will land at #2. */
export const DropTarget: Story = {
  render: () => (
    <div className="relative">
      <VhsBox movie={film} badge={{ kind: 'rank', rank: 2 }} />
      <DropSlot rank={2} />
    </div>
  ),
}
