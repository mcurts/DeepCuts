// Stories for Ticker, the mustard band of live facts under the header (ADR-0040). Rest the mouse
// on it for a second to see it scroll.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Ticker } from './Ticker'

const meta = {
  title: 'Components/UI/Ticker',
  component: Ticker,
  // The band pulls itself out to the window edges and up against the header, so give it a page
  // column to sit in.
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-300 px-5 pt-5">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Ticker>
export default meta
type Story = StoryObj<typeof meta>

/** Home, signed in: counts and the top pick. */
export const SignedIn: Story = {
  args: {
    items: [
      'Top Ten: 3 of 10 ranked',
      'Watchlist: 12 films',
      'Discovery: 4 new picks',
      'Top pick: The Thing, 92% match',
    ],
  },
}
/** The landing page: one line per feature. */
export const SignedOut: Story = {
  args: {
    items: [
      'Top Ten: rank the ten films you’d defend',
      'Watchlist: save a film the moment you hear about it',
      'Discovery: picks for your taste, with the reason why',
    ],
  },
}
/** A new account with nothing in its lists: one fact left. */
export const OneItem: Story = { args: { items: ['Watchlist: 1 film'] } }

/** Home while its lists load: the empty band holds its room until the facts arrive. */
export const Loading: Story = { args: { items: [], loading: true } }
