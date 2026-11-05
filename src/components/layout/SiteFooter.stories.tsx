// Stories for SiteFooter, the legal footer with the release version. It stacks below
// `sm`; the E2E reflow checks cover the phone widths.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { SiteFooter } from './SiteFooter'

const meta = {
  title: 'Components/Layout/SiteFooter',
  component: SiteFooter,
  args: { version: '1.2.0' },
} satisfies Meta<typeof SiteFooter>
export default meta
type Story = StoryObj<typeof meta>

/** The copyright line ends with the release version. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/· v1\.2\.0$/)).toBeVisible()
  },
}

/** Any build outside `npm run deploy` (dev server, tests, CI). */
export const DevBuild: Story = {
  args: { version: 'dev' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/· dev build$/)).toBeVisible()
  },
}
