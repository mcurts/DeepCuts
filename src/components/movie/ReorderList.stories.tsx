// Story for a complete reorder list. A story-local query cache supplies film details, so Storybook
// never contacts TMDB and exercises the same query boundary as the application.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { movieDetailSchema } from '@/api/tmdb'
import { movieFixture } from '@/test/msw/fixtures'
import { ReorderList } from './ReorderList'

const first = movieDetailSchema.parse(movieFixture)
const second = movieDetailSchema.parse({
  ...movieFixture,
  id: 348,
  title: 'Alien',
  release_date: '1979-05-25',
  poster_path: null,
})
const queryClient = new QueryClient()
queryClient.setQueryData(['tmdb', 'movie', first.id], first)
queryClient.setQueryData(['tmdb', 'movie', second.id], second)

const meta = {
  title: 'Components/Movie/ReorderList',
  component: ReorderList,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  args: { ids: [first.id, second.id], announce: fn(), onReorder: fn() },
} satisfies Meta<typeof ReorderList>
export default meta
type Story = StoryObj<typeof meta>

/** A ranked list with both keyboard move controls and drag-and-drop enhancement. */
export const Default: Story = {}
