// Stories for VhsBox, a film as a 3D cardboard VHS sleeve.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { searchResultsSchema } from '@/api/tmdb'
import { genreTone } from '@/domain/genres'
import { searchFixture } from '@/test/msw/fixtures'
import { VhsBox } from './VhsBox'

// The same hand-written film the tests use, validated like real API data.
const [film] = searchResultsSchema.parse(searchFixture).results
if (!film) throw new Error('The search fixture needs at least one film')

const meta = {
  title: 'Components/Movie/VhsBox',
  component: VhsBox,
  args: { movie: film },
  // The box needs an interactive parent marked `data-vhs-target` (on Discover, the tile's link)
  // and the film's genre tone. Hover the box to look around it; tab to it for the focus turn.
  decorators: [
    (Story, { args }) => (
      <a
        href="#film"
        data-vhs-target=""
        aria-label={args.movie.title}
        style={genreTone(args.movie.genre_ids)}
        className="block w-48"
      >
        <Story />
      </a>
    ),
  ],
} satisfies Meta<typeof VhsBox>
export default meta
type Story = StoryObj<typeof meta>

/** A grid tile's box, at rest: straight on until hovered. */
export const Default: Story = {}
/** No poster: an empty placeholder on the front, with the spine and sticker as usual. */
export const NoPoster: Story = { args: { movie: { ...film, poster_path: null } } }
/** A long title: the spine and the cassette label end it with "…". */
export const LongTitle: Story = {
  args: { movie: { ...film, title: 'Dr. Strangelove or: How I Learned to Stop Worrying' } },
}
/** On the Top Ten shelf: the mustard rank tab. */
export const RankTab: Story = { args: { badge: { kind: 'rank', rank: 1 } } }
/** On the watchlist shelf: the ADMIT ONE ticket. */
export const Ticket: Story = { args: { badge: { kind: 'ticket' } } }
/** A Discovery pick: the blood-red match stamp. */
export const MatchStamp: Story = { args: { badge: { kind: 'match', match: 92 } } }
