// Story for the keyboard-only skip link. The wrapper mirrors a page with a main landmark; press
// Tab in the canvas to reveal the link and Enter to move past the simulated header.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SkipLink } from './SkipLink'

const meta = {
  title: 'Components/Layout/SkipLink',
  component: SkipLink,
} satisfies Meta<typeof SkipLink>
export default meta
type Story = StoryObj<typeof meta>

/** Hidden at rest and visible when it receives keyboard focus. */
export const KeyboardFocus: Story = {
  render: () => (
    <>
      <SkipLink />
      <header className="min-h-24">Simulated page header</header>
      <main id="main" tabIndex={-1}>
        Main content
      </main>
    </>
  ),
}
