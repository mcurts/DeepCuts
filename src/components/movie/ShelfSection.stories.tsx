// Stories for ShelfSection, one of Home's full-width shelves, with the three kinds
// of header meta Home uses and the icon before a heading.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Icon } from '@/components/ui/Icon'
import { EmptySlot } from './EmptySlot'
import { SHELF_GRID, ShelfSection } from './ShelfSection'

const meta = {
  title: 'Components/Movie/ShelfSection',
  component: ShelfSection,
  args: {
    id: 'top-ten',
    feature: 1,
    title: 'Top Ten',
    children: (
      <ol className={SHELF_GRID}>
        <li>
          <EmptySlot mark="#1" title="Add a film" note="Slot still open" />
        </li>
      </ol>
    ),
  },
} satisfies Meta<typeof ShelfSection>
export default meta
type Story = StoryObj<typeof meta>

/** A count on the right: Top Ten. */
export const WithCount: Story = {
  args: { meta: <p className="font-label text-sm text-content-muted">0 of 10 ranked</p> },
}
/** A line of copy on the right: Discovery. */
export const WithCopy: Story = {
  args: {
    id: 'discovery',
    feature: 3,
    title: 'Discovery',
    meta: <p className="font-label text-sm text-content-muted">Deep cuts, picked for your taste</p>,
  },
}
/** No meta: the dashed rule runs to the edge. */
export const NoMeta: Story = {}
/** An icon before the heading, as on the Top Ten (star) and watchlist (bookmark) shelves. */
export const WithIcon: Story = {
  args: { icon: <Icon name="star" className="size-10 shrink-0 text-favourite" /> },
}
