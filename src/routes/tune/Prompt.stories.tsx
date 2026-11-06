// Story for the heading block shared by each onboarding step, including representative supporting
// copy so its spacing and responsive line length are visible.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Prompt } from './Prompt'

const meta = {
  title: 'Pages/Tune/Prompt',
  component: Prompt,
  args: {
    eyebrow: 'One more signal',
    title: 'What’s your favorite movie?',
    children: (
      <p className="mt-3 max-w-md leading-relaxed text-content-muted">
        Use the search above to find a favorite. You can tag it there and come right back.
      </p>
    ),
  },
} satisfies Meta<typeof Prompt>
export default meta
type Story = StoryObj<typeof meta>

/** A representative onboarding prompt at phone and desktop widths. */
export const Default: Story = {}
