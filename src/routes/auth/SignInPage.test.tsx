// Tests for the sign-in flow: a signed-in page sends a signed-out visitor
// to sign in and back again (same-app paths only), failures change nothing, and the signed-in
// Account page signs out to the landing page.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { createMockSessionProvider } from '@/adapters/local/MockSessionProvider'
import { SIGNED_OUT, type SessionProvider } from '@/adapters/SessionProvider'
import { findToast, renderRoute } from '@/test/renderRoute'

const header = () => screen.getByRole('banner')

describe('sign in', () => {
  it('sends a signed-out visitor from a signed-in page to sign in, then back to it', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/lists?tag=watchlist', { initialSession: SIGNED_OUT })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to Deep Cuts' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sign-in')
    await user.click(screen.getByRole('button', { name: /Continue with a demo account/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/lists'))
    expect(router.state.location.search).toBe('?tag=watchlist')
    expect(await findToast('Signed in as Mike.')).toBeInTheDocument()
    // The toast can show before the lazy /lists page has loaded, so wait for the header.
    await screen.findByRole('heading', { level: 1, name: 'My Lists' })
    expect(
      within(header()).getByRole('button', { name: 'Account menu for Mike' }),
    ).toBeInTheDocument()
  })

  it.each(['/movie/1091', '/account', '/lists'])(
    'signed out, %s redirects to sign in',
    async (path) => {
      const { router } = renderRoute(path, { initialSession: SIGNED_OUT })
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Sign in to Deep Cuts' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/sign-in')
    },
  )

  it('labels the demo method as practice, never as a real account', async () => {
    renderRoute('/sign-in', { initialSession: SIGNED_OUT })
    const demo = await screen.findByRole('button', { name: /Continue with a demo account/ })
    expect(demo).toHaveTextContent('Practice sign-in. No real account is created.')
  })

  it('shows an error and changes nothing when sign-in fails', async () => {
    const user = userEvent.setup()
    const failing: SessionProvider = {
      ...createMockSessionProvider(),
      signIn: () => Promise.reject(new Error('popup closed')),
    }
    const { router } = renderRoute('/sign-in', {
      sessionProvider: failing,
      initialSession: SIGNED_OUT,
    })
    await user.click(await screen.findByRole('button', { name: /Continue with a demo account/ }))
    expect(await findToast(/^Sign-in didn’t finish. Nothing was changed./)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sign-in')
  })

  it('sends someone who is already signed in to their account', async () => {
    const { router } = renderRoute('/sign-in')
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'))
  })

  it('only returns to same-app paths (history state is untrusted)', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/', { initialSession: SIGNED_OUT })
    await act(() => router.navigate('/sign-in', { state: { from: '//evil.example' } }))
    await user.click(await screen.findByRole('button', { name: /Continue with a demo account/ }))
    // An unsafe `from` falls back to home.
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

describe('signed-in account page', () => {
  it('shows the account and signs out after confirming', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/account')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mike Curts' })).toBeInTheDocument()
    expect(screen.getByText('Signed in with the demo account')).toBeInTheDocument()
    expect(screen.getByText(/lists are kept on this device/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    const confirm = screen.getByRole('button', { name: 'Yes, sign out' })
    await waitFor(() => expect(confirm).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.click(screen.getByRole('button', { name: 'Yes, sign out' }))
    // Signing out lands on the landing page, not on a sign-in prompt for /account.
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(within(header()).getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your movies, close at hand' }),
    ).toBeInTheDocument()
  })
})
