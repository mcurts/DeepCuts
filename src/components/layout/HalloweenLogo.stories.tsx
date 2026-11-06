// Stories for October's standalone logo artwork. Logo.stories.tsx covers its seasonal selection;
// these isolate the detailed SVG at header and display sizes.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { HalloweenLogo } from './HalloweenLogo'

const meta = {
  title: 'Components/Layout/HalloweenLogo',
  component: HalloweenLogo,
  args: { className: 'h-24 w-auto' },
} satisfies Meta<typeof HalloweenLogo>
export default meta
type Story = StoryObj<typeof meta>

/** The detailed artwork at a display size. Hover its wrapper to light the pumpkins. */
export const Display: Story = {
  decorators: [
    (Story) => (
      <div className="inline-flex">
        <Story />
      </div>
    ),
  ],
}

/** The artwork at its compact header height. */
export const Header: Story = { args: { className: 'h-9 w-auto' } }
