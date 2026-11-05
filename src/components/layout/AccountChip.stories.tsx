// Stories for AccountChip, the account control in the header: signed out, signed in, and (from
// `md`) its account menu open, for the demo and a passkey account.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { AccountChip } from './AccountChip'

const meta = { title: 'Components/Layout/AccountChip', component: AccountChip } satisfies Meta<
  typeof AccountChip
>
export default meta
type Story = StoryObj<typeof meta>

export const SignedOut: Story = {}
/** Avatar initial + first name. */
const demo = {
  session: { kind: 'account', account: { id: 'demo', name: 'Mike Curts', method: 'demo' } },
}
export const SignedIn: Story = { parameters: demo }

// Opens the menu the way a person would; the popover renders outside the story root.
const openMenu: Story['play'] = async ({ canvasElement }) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: /account menu/ }))
  await expect(await within(document.body).findByRole('menu')).toBeVisible()
}

/** From `md`: the menu with who's signed in, My Lists and Sign out. */
export const MenuOpen: Story = {
  parameters: demo,
  play: openMenu,
}
/** A passkey account's menu also links Account settings. */
export const PasskeyMenuOpen: Story = {
  parameters: {
    session: { kind: 'account', account: { id: 'p', name: 'Pat Key', method: 'passkey' } },
  },
  play: openMenu,
}
