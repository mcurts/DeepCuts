// Tests for the signed-out landing page (ADR-0034, ADR-0035, ADR-0040): the hero and its two calls
// to action, "Tonight's program" with Home's three features in order, and a shell with only the
// logo and Sign in.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SIGNED_OUT } from '@/adapters/SessionProvider'
import { findToast, renderRoute } from '@/test/renderRoute'

const PANEL_HEADINGS = ['Your Top Ten of All Time', 'My Watchlist', 'Discover Some Deep Cuts']

describe('landing page (signed out)', () => {
  it('explains the three ideas as tonight’s program, in Home’s order', async () => {
    renderRoute('/', { initialSession: SIGNED_OUT })
    await screen.findByRole('heading', { level: 1, name: 'Your movies, close at hand' })
    const program = screen.getByRole('region', { name: 'Tonight’s program' })
    expect(
      within(program)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(PANEL_HEADINGS)
    PANEL_HEADINGS.forEach((name, i) => {
      const panel = within(program).getByRole('region', { name })
      expect(within(panel).getByText(`Feature Nº ${i + 1}`)).toBeInTheDocument()
      // The illustration is decorative; the copy says what the feature is for.
      expect(panel.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument()
      expect(within(panel).getAllByRole('paragraph').at(-1)).toHaveTextContent(/\w/)
    })
    // The Top Ten is live now, so it's no longer billed as coming next.
    expect(screen.queryByText(/Coming next/)).not.toBeInTheDocument()
  })

  it('offers a ticket to sign in, and a way down to the program', async () => {
    renderRoute('/', { initialSession: SIGNED_OUT })
    const main = await screen.findByRole('main')
    expect(within(main).getByRole('link', { name: 'Get your ticket' })).toHaveAttribute(
      'href',
      '/sign-in',
    )
    expect(within(main).getByRole('link', { name: 'See the program' })).toHaveAttribute(
      'href',
      '#program',
    )
  })

  it('shows only the logo and Sign in: no search, no films', async () => {
    renderRoute('/', { initialSession: SIGNED_OUT })
    await screen.findByRole('heading', { level: 1, name: 'Your movies, close at hand' })
    expect(screen.queryByRole('combobox', { name: /Find a movie/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /View details/ })).not.toBeInTheDocument()
  })

  it('leads from the ticket to the sign-in page, then to Home', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/', { initialSession: SIGNED_OUT })
    const main = await screen.findByRole('main')
    await user.click(within(main).getByRole('link', { name: 'Get your ticket' }))
    await user.click(await screen.findByRole('button', { name: /Continue with a demo account/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    // Home's real panels, with the account menu in the header.
    expect(await screen.findByRole('button', { name: 'Account menu for Mike' })).toBeInTheDocument()
    expect(await findToast('Signed in as Mike.')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'My Watchlist' })).getByRole('link', {
        name: 'My Watchlist',
      }),
    ).toBeInTheDocument()
  })
})
