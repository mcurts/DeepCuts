// Stories for the two route fallbacks: a mistyped address and an unexpected page crash.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { NotFound, RouteError } from './PlaceholderPages'

const meta = {
  title: 'Routes/PlaceholderPages',
  component: NotFound,
} satisfies Meta<typeof NotFound>
export default meta
type Story = StoryObj<typeof meta>

/** An unknown URL inside the normal app shell. */
export const MissingPage: Story = {}

/** An unexpected route failure; route boundaries render this outside the failed page. */
export const UnexpectedError: Story = { render: () => <RouteError /> }
