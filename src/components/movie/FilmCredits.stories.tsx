// Stories for the reserved credit lines below a film card: loading or missing credits, one name
// per role, and plural roles that must keep their labels grammatical.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CreditLines } from './FilmCredits'

const meta = {
  title: 'Components/Movie/FilmCredits',
  component: CreditLines,
} satisfies Meta<typeof CreditLines>
export default meta
type Story = StoryObj<typeof meta>

/** Credits have not arrived or TMDB has none; the two-line space remains reserved. */
export const Empty: Story = { args: { credits: undefined } }

/** One director and one writer. */
export const DirectorAndWriter: Story = {
  args: { credits: { directors: ['John Carpenter'], writers: ['Bill Lancaster'] } },
}

/** More than one name uses plural labels. */
export const Multiple: Story = {
  args: {
    credits: {
      directors: ['Lana Wachowski', 'Lilly Wachowski'],
      writers: ['Lana Wachowski', 'Lilly Wachowski'],
    },
  },
}
