// Stories for GenreSticker, the VHS rental-store genre sticker.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { genreTone, GENRES } from '@/domain/genres'
import { GenreSticker } from './GenreSticker'

const meta = {
  title: 'Components/Movie/GenreSticker',
  component: GenreSticker,
  args: { genreIds: [27], seed: 1091 },
  // The sticker takes its color from `--tone`, which a poster sets; this frame stands in for one.
  decorators: [
    (Story, { args }) => (
      <div
        style={genreTone(args.genreIds)}
        className="border-poster-border relative aspect-2/3 w-40 border border-b-3 border-b-(--tone) bg-poster-placeholder-background"
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GenreSticker>
export default meta
type Story = StoryObj<typeof meta>

/** On a VHS box (54px). */
export const OnPoster: Story = { args: { className: 'absolute top-2.5 right-2.5' } }

/** Every genre, each with its own wear. */
export const AllGenres: Story = {
  decorators: [(Story) => <Story />],
  render: () => (
    <ul className="grid grid-cols-4 gap-6 sm:grid-cols-7">
      {Object.entries(GENRES).map(([id, g], i) => (
        <li key={id} style={genreTone([Number(id)])} className="flex flex-col items-center gap-2">
          <GenreSticker genreIds={[Number(id)]} seed={1000 + i * 37} />
          <span className="text-xs text-content-muted">{g.name}</span>
        </li>
      ))}
    </ul>
  ),
}
