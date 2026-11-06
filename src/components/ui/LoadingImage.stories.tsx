// Stories for the progressive image: a local image that settles normally and a failed image that
// stops shimmering but retains the placeholder surface.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { LoadingImage } from './LoadingImage'

const meta = {
  title: 'Components/UI/LoadingImage',
  component: LoadingImage,
  decorators: [
    (Story) => (
      <div className="h-48 w-48 overflow-hidden rounded-container">
        <Story />
      </div>
    ),
  ],
  args: { alt: 'Deep Cuts', className: 'size-full object-contain' },
} satisfies Meta<typeof LoadingImage>
export default meta
type Story = StoryObj<typeof meta>

/** A same-origin image that loads without contacting an external service. */
export const Loaded: Story = { args: { src: '/favicon.svg' } }

/** A missing image stops its shimmer and leaves the static placeholder. */
export const Failed: Story = { args: { src: '/missing-story-image.svg', alt: 'Missing poster' } }
