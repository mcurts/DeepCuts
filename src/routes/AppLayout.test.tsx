// Tests for the app shell: the logo goes Home and carries the tagline, there is no tab bar, the
// account menu leads to My Lists and signs out, and unknown URLs show the error page.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '@/test/renderRoute'

describe('navigation', () => {
  it('goes Home from the logo, with no tab bar (ADR-0040)', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/lists')
    await screen.findByRole('heading', { level: 1, name: 'My Lists' })
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /go to Home/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('shows the tagline under the logo, inside the Home link', async () => {
    renderRoute('/lists')
    // The link's name includes the tagline it shows (WCAG 2.5.3, Label in Name), so a voice
    // control user can say what they see.
    const home = await screen.findByRole('link', {
      name: 'Deep Cuts, The B-sides of cinema, go to Home',
    })
    // Visible from `md` only (a CSS class jsdom doesn't apply).
    expect(within(home).getByText('The B-sides of cinema')).toBeInTheDocument()
  })

  it('shows the error page for unknown routes', async () => {
    renderRoute('/nope')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeInTheDocument()
  })

  it('renders the placeholder pages', async () => {
    renderRoute('/lists')
    expect(await screen.findByRole('heading', { level: 1, name: 'My Lists' })).toBeInTheDocument()
  })
})

describe('account menu', () => {
  it('shows who is signed in and their tagged-film count, and opens My Lists', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/')
    await user.click(await screen.findByRole('button', { name: 'Account menu for Mike' }))
    const menu = await screen.findByRole('menu', { name: 'Account menu for Mike' })
    expect(within(menu).getByText('Signed in with the demo account')).toBeInTheDocument()
    expect(await within(menu).findByText(/films? tagged/)).toBeInTheDocument()
    // The demo account has no settings, so no settings item (ADR-0031 A2b).
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['My Lists', 'Sign out'])
    await user.click(within(menu).getByRole('menuitem', { name: 'My Lists' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/lists'))
  })

  it('links Account settings for a passkey account', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/', {
      initialSession: {
        kind: 'account',
        account: { id: 'passkey-user', name: 'Pat Key', method: 'passkey' },
      },
    })
    await user.click(await screen.findByRole('button', { name: 'Account menu for Pat' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Account settings' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'))
  })

  it('signs out in one press and shows the landing page', async () => {
    const user = userEvent.setup()
    renderRoute('/lists')
    await user.click(await screen.findByRole('button', { name: 'Account menu for Mike' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your movies, close at hand' }),
    ).toBeInTheDocument()
  })
})
