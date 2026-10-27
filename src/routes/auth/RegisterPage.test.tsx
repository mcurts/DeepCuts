// Tests for registration (ADR-0031): every field validated at once with focus on the first
// problem, the invite link filling in the code (then leaving the URL), a valid form making a
// practice account and returning to where sign-in started, the honest "practice" label, and
// failures.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockSessionProvider } from '@/adapters/local/MockSessionProvider'
import { SIGNED_OUT, type SessionProvider } from '@/adapters/SessionProvider'
import { findToast, renderRoute } from '@/test/renderRoute'

const INVITE = 'AAAAAAAAAAAAAAAAAAAAAA'

// Fills both fields; either can be overridden (an empty string leaves it blank).
async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { name = 'Ada Lovelace', invite = INVITE } = {},
) {
  // The page is lazy-loaded: wait for it before typing.
  await screen.findByRole('heading', { level: 1, name: 'Create an account' })
  if (name) await user.type(screen.getByRole('textbox', { name: 'Name' }), name)
  if (invite) await user.type(screen.getByRole('textbox', { name: 'Invite code' }), invite)
}

describe('registration (ADR-0031)', () => {
  it('says it is practice only, never a real account', async () => {
    renderRoute('/register', { initialSession: SIGNED_OUT })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create an account' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/No passkey or real account is created/)).toBeInTheDocument()
  })

  it('shows every problem at once and focuses the first one', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/register', { initialSession: SIGNED_OUT })
    await fill(user, { name: '', invite: 'not-a-code' })
    await user.click(screen.getByRole('button', { name: 'Create passkey' }))

    const name = screen.getByRole('textbox', { name: 'Name' })
    await waitFor(() => expect(name).toHaveFocus())
    expect(name).toHaveAccessibleDescription(/Enter your name\./)
    expect(screen.getByRole('textbox', { name: 'Invite code' })).toHaveAccessibleDescription(
      /That code isn’t right\. Check your invite link\./,
    )
    expect(router.state.location.pathname).toBe('/register')
  })

  // Issue #60: if the message waited for blur, it would vanish as the mouse went down on the
  // button, the button would jump up and the click would miss.
  it('clears a field’s message as soon as it is edited, before it loses focus', async () => {
    const user = userEvent.setup()
    renderRoute('/register', { initialSession: SIGNED_OUT })
    await fill(user, { name: '', invite: 'not-a-code' })
    await user.click(screen.getByRole('button', { name: 'Create passkey' }))
    const name = screen.getByRole('textbox', { name: 'Name' })
    await waitFor(() => expect(name).toHaveFocus())

    await user.type(name, 'A')
    expect(name).toHaveFocus()
    expect(screen.queryByText('Enter your name.')).not.toBeInTheDocument()
    expect(name).not.toHaveAttribute('aria-invalid')
    // The other field keeps its message until it's edited too.
    expect(screen.getByRole('textbox', { name: 'Invite code' })).toHaveAccessibleDescription(
      /That code isn’t right\./,
    )
  })

  it('registers and returns to where sign-in started', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/lists?tag=liked', { initialSession: SIGNED_OUT })
    await user.click(await screen.findByRole('link', { name: 'Create an account' }))
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create passkey' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/lists'))
    expect(router.state.location.search).toBe('?tag=liked')
    expect(await findToast('Account created. Signed in as Ada.')).toBeInTheDocument()
    // The toast can show before the lazy /lists page has loaded, so wait for the header.
    await screen.findByRole('heading', { level: 1, name: 'My Lists' })
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Account menu for Ada' }),
    ).toBeInTheDocument()
  })

  it('fills in the code from an invite link, then removes it from the URL', async () => {
    const { router } = renderRoute(`/register?invite=${INVITE}`, { initialSession: SIGNED_OUT })
    expect(await screen.findByRole('textbox', { name: 'Invite code' })).toHaveValue(INVITE)
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('shows an error and changes nothing when registration fails', async () => {
    const user = userEvent.setup()
    const failing: SessionProvider = {
      ...createMockSessionProvider(),
      register: () => Promise.reject(new Error('offline')),
    }
    const { router } = renderRoute('/register', {
      sessionProvider: failing,
      initialSession: SIGNED_OUT,
    })
    await fill(user)
    await user.click(screen.getByRole('button', { name: 'Create passkey' }))
    expect(await findToast(/^Registration didn’t finish. Nothing was changed./)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/register')
  })

  it('shows the practice account on the Account page', async () => {
    renderRoute('/account', {
      initialSession: {
        kind: 'account',
        account: { id: 'practice', name: 'Ada Lovelace', method: 'practice' },
      },
    })
    expect(await screen.findByText('Practice account, made on this device')).toBeInTheDocument()
  })

  it('sends someone who is already signed in to their account', async () => {
    const { router } = renderRoute('/register')
    await waitFor(() => expect(router.state.location.pathname).toBe('/account'))
  })
})
