// Stories for a complete cassette card: its ordinary metadata and the ranked, matched,
// watchlisted and newly tagged states that change the box's badge and accessible name.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { movieDetailSchema, summaryOf } from '@/api/tmdb'
import { movieFixture } from '@/test/msw/fixtures'
import { CassetteCard } from './CassetteCard'

const detail = movieDetailSchema.parse(movieFixture)
const item = {
  movie: summaryOf(detail),
  credits: { directors: ['John Carpenter'], writers: ['Bill Lancaster'] },
}

const meta = {
  title: 'Components/Movie/CassetteCard',
  component: CassetteCard,
  decorators: [
    (Story) => (
      <div className="flex w-48">
        <Story />
      </div>
    ),
  ],
  args: { item },
} satisfies Meta<typeof CassetteCard>
export default meta
type Story = StoryObj<typeof meta>

/** A film with its year, genre and credits. */
export const Default: Story = {}

/** A film in the person's Top Ten. */
export const Ranked: Story = { args: { item: { ...item, rank: 1 } } }

/** A recommendation with its match score. */
export const Matched: Story = { args: { item: { ...item, match: 92 } } }

/** A film on the watchlist. */
export const Watchlisted: Story = { args: { item: { ...item, ticket: true } } }

/** A recommendation just marked More like this. */
export const Stamped: Story = { args: { item: { ...item, stamp: 'liked' } } }
