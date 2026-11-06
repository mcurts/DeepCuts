// Stories for the landing page's three decorative feature illustrations, kept together so theme
// changes can be checked for equivalent contrast and visual weight.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { PanelArt } from './PanelArt'

const meta = {
  title: 'Pages/Landing/PanelArt',
  component: PanelArt,
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PanelArt>
export default meta
type Story = StoryObj<typeof meta>

/** The ranked Top Ten illustration. */
export const TopTen: Story = { args: { id: 'top-ten' } }

/** The overlapping ticket-stub watchlist illustration. */
export const Watchlist: Story = { args: { id: 'watchlist' } }

/** The matched-pick Discovery illustration. */
export const Discovery: Story = { args: { id: 'discovery' } }
