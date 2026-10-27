// Screen tests for real passkey accounts (ADR-0031, Stage 6 A2b/A4): with the Cloudflare session
// provider, registration drops the "practice" notice and explains a refused invite on its field;
// sign-in offers the passkey first; the Account page renames and deletes a passkey account; a
// session the server ends mid-use goes to Sign in and back (issue #18). The accounts API is the
// MSW fake, and the device's passkey prompt is stubbed.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCloudflareSessionProvider } from '@/adapters/cloudflare/CloudflareSessionProvider'
import { SIGNED_OUT, type Session } from '@/adapters/SessionProvider'
import { createFakeAccountsApi } from '@/test/msw/fakeAccountsApi'
import { server } from '@/test/msw/server'
import { SESSION_ENDED } from '@/notify'
import { findToast, renderRoute } from '@/test/renderRoute'

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(async () => ({ id: 'cred', type: 'public-key' })),
  startAuthentication: vi.fn(async () => ({ id: 'cred', type: 'public-key' })),
}))

const INVITE = 'AAAAAAAAAAAAAAAAAAAAAA'
let api: ReturnType<typeof createFakeAccountsApi>
beforeEach(() => {
  api = createFakeAccountsApi()
  server.use(...api.handlers)
})

const PAT: Session = {
  kind: 'account',
  account: { id: 'passkey-user', name: 'Pat Key', method: 'passkey' },
}

describe('registration with real accounts', () => {
  it('has no "practice" notice, and makes a passkey account', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/register', {
      sessionProvider: createCloudflareSessionProvider(),
      initialSession: SIGNED_OUT,
    })
    await screen.findByRole('heading', { level: 1, name: 'Create an account' })
    expect(screen.queryByText(/No passkey or real account is created/)).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Ada Lovelace')
    await user.type(screen.getByRole('textbox', { name: 'Invite code' }), INVITE)
    await user.click(screen.getByRole('button', { name: 'Create passkey' }))
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/register'))
    expect(api.state.signedIn).toEqual({ id: 'user-1', name: 'Ada Lovelace' })
  })

  it('explains a refused invite on the invite field, and focuses it', async () => {
    api.state.rejectInvite = true
    const user = userEvent.setup()
    renderRoute('/register', {
      sessionProvider: createCloudflareSessionProvider(),
      initialSession: SIGNED_OUT,
    })
    await screen.findByRole('heading', { level: 1, name: 'Create an account' })
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Ada')
    await user.type(screen.getByRole('textbox', { name: 'Invite code' }), INVITE)
    await user.click(screen.getByRole('button', { name: 'Create passkey' }))

    const invite = screen.getByRole('textbox', { name: 'Invite code' })
    await waitFor(() => expect(invite).toHaveFocus())
    expect(invite).toHaveAccessibleDescription(/may have expired or been used already/)
    expect(api.state.signedIn).toBeNull()
  })
})

describe('sign-in with real accounts', () => {
  it('offers the passkey first, then the demo, and signs in with it', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/sign-in', {
      sessionProvider: createCloudflareSessionProvider(),
      initialSession: SIGNED_OUT,
    })
    const [first] = await screen.findAllByRole('button', { name: /Sign in with a passkey|demo/ })
    if (!first) throw new Error('no sign-in buttons')
    expect(first).toHaveAccessibleName(/Sign in with a passkey/)
    await user.click(first)
    await waitFor(() => expect(router.state.location.pathname).not.toBe('/sign-in'))
    expect(api.state.signedIn).toMatchObject({ name: 'Pat Key' })
  })
})

describe('account settings (A2b)', () => {
  beforeEach(() => void (api.state.signedIn = { id: 'passkey-user', name: 'Pat Key' }))

  const renderAccount = () =>
    renderRoute('/account', {
      sessionProvider: createCloudflareSessionProvider(),
      initialSession: PAT,
    })

  it('says how the person signed in, and renames the account', async () => {
    const user = userEvent.setup()
    renderAccount()
    expect(await screen.findByText('Signed in with a passkey')).toBeInTheDocument()
    const name = screen.getByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.type(name, 'Patricia Key')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await findToast('Name saved.')).toBeInTheDocument()
    expect(api.state.signedIn?.name).toBe('Patricia Key')
    expect(screen.getByRole('heading', { level: 1, name: 'Patricia Key' })).toBeInTheDocument()
  })

  it('refuses an empty name without calling the server', async () => {
    const user = userEvent.setup()
    renderAccount()
    const name = await screen.findByRole('textbox', { name: 'Name' })
    await user.clear(name)
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(name).toHaveAccessibleDescription(/Enter your name\./)
    expect(api.state.signedIn?.name).toBe('Pat Key')
  })

  it('deletes the account only after a confirm, then lands on the landing page', async () => {
    const user = userEvent.setup()
    const { router } = renderAccount()
    await user.click(await screen.findByRole('button', { name: 'Delete account' }))
    expect(api.state.signedIn).not.toBeNull()
    expect(screen.getByText(/This can’t be undone/)).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'Yes, delete my account' })
    await waitFor(() => expect(confirm).toHaveFocus())
    await user.click(confirm)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(api.state.signedIn).toBeNull()
  })

  it('cancelling the delete puts focus back and changes nothing', async () => {
    const user = userEvent.setup()
    renderAccount()
    const ask = await screen.findByRole('button', { name: 'Delete account' })
    await user.click(ask)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete account' })).toHaveFocus(),
    )
    expect(api.state.signedIn).not.toBeNull()
  })

  it('demo accounts get neither setting', async () => {
    renderRoute('/account', {
      sessionProvider: createCloudflareSessionProvider(),
      initialSession: {
        kind: 'account',
        account: { id: 'demo', name: 'Mike Curts', method: 'demo' },
      },
    })
    await screen.findByText('Signed in with the demo account')
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save name' })).not.toBeInTheDocument()
  })
})

describe('a tag that fails to save', () => {
  // The server fails the change. (A 401 means the session ended, which goes to Sign in instead:
  // see "a session the server ends" below.)
  beforeEach(() => void (api.state.signedIn = { id: 'passkey-user', name: 'Pat Key' }))
  const refuseTagChanges = () =>
    server.use(http.put('/api/tags', () => HttpResponse.json({ error: 'x' }, { status: 500 })))
  const asPat = { sessionProvider: createCloudflareSessionProvider(), initialSession: PAT }

  it('says so on the Detail page, and keeps the picks selected to retry', async () => {
    refuseTagChanges()
    const user = userEvent.setup()
    renderRoute('/movie/1091', asPat)
    const group = await screen.findByRole('group', { name: 'Your tags' })
    await user.click(within(group).getByRole('button', { name: 'More like this' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await findToast(/^Your changes weren’t all saved./)).toBeInTheDocument()
    // Nothing the person picked is lost, and Save is there to try again.
    expect(within(group).getByRole('button', { name: 'More like this' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(screen.queryByText(/^Saved\./)).not.toBeInTheDocument()
  })

  it('says so on a Search result', async () => {
    refuseTagChanges()
    const user = userEvent.setup()
    renderRoute('/search?q=thing', { ...asPat, features: { searchPage: true } })
    await user.click(await screen.findByRole('button', { name: 'Want to see The Thing' }))
    expect(await findToast(/^Your change wasn’t saved./)).toBeInTheDocument()
  })
})

describe('a session the server ends mid-use (issue #18)', () => {
  // Signed in as Pat on the server, until a test ends the session there.
  beforeEach(() => void (api.state.signedIn = { id: 'passkey-user', name: 'Pat Key' }))
  const asPat = () => ({ sessionProvider: createCloudflareSessionProvider(), initialSession: PAT })
  // What the server does after 30 idle days, or a sign-out on another device.
  const endSessionOnServer = () => void (api.state.signedIn = null)

  it('lands on Sign in with one message, and signing back in returns to the same page', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091', asPat())
    const group = await screen.findByRole('group', { name: 'Your tags' })

    endSessionOnServer()
    await user.click(within(group).getByRole('button', { name: 'More like this' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
    expect(await findToast(SESSION_ENDED)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: /Sign in/ })).toBeInTheDocument()

    // Pat signs in again with the passkey, and is back on the film.
    await user.click(screen.getByRole('button', { name: /Sign in with a passkey/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/movie/1091'))
    expect(api.state.signedIn).toMatchObject({ name: 'Pat Key' })
  })

  it('from Home, goes to Sign in and back to Home, not to the landing page', async () => {
    endSessionOnServer()
    const user = userEvent.setup()
    // Home loads the lists and the Top Ten at once; both fail, and only one message shows.
    const { router } = renderRoute('/', asPat())
    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'))
    expect(await findToast(SESSION_ENDED)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /Sign in with a passkey/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(screen.getAllByText(SESSION_ENDED)).toHaveLength(1)
  })

  it('a visitor who never signed in sees no message and stays put on a 401', async () => {
    // The startup session check answers 401 for a signed-out first visit (issue #19), and the
    // accounts APIs answer 401 to anyone without a session.
    endSessionOnServer()
    server.use(
      http.get('/api/auth/session', () =>
        HttpResponse.json({ error: 'signed_out' }, { status: 401 }),
      ),
    )
    const provider = createCloudflareSessionProvider()
    const { router } = renderRoute('/', { sessionProvider: provider, initialSession: SIGNED_OUT })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your movies, close at hand' }),
    ).toBeInTheDocument()
    await expect(provider.getSession()).resolves.toEqual(SIGNED_OUT)
    await expect(provider.rename?.('X')).rejects.toMatchObject({ status: 401 })
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByText(SESSION_ENDED)).not.toBeInTheDocument()
  })

  it('signing out on purpose still goes to the landing page', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/account', asPat())
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
    await user.click(screen.getByRole('button', { name: 'Yes, sign out' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(api.state.signedIn).toBeNull()
    expect(screen.queryByText(SESSION_ENDED)).not.toBeInTheDocument()
  })
})
