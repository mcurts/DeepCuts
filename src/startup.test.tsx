// Tests for startApp (issue #19): when the session check against the real accounts adapter hangs or
// fails, startup shows "can't reach your account" with a retry, never a blank page and never the
// signed-out landing page; a retry that gets through renders the app.
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCloudflareSessionProvider } from '@/adapters/cloudflare/CloudflareSessionProvider'
import type { Session } from '@/adapters/SessionProvider'
import { server } from '@/test/msw/server'
import { startApp } from './startup'

// Stands in for the whole app: says which session it was started with.
const renderApp = vi.fn((session: Session) => <p>App: {session.kind}</p>)

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  renderApp.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

// Runs startup against the Cloudflare adapter, whose session check MSW answers.
const start = () => act(() => startApp(root, createCloudflareSessionProvider(), renderApp))

// The unreachable screen is up, and neither the app nor the signed-out landing page is.
function expectUnreachable() {
  expect(screen.getByRole('heading', { level: 1, name: 'Can’t reach your account' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  expect(renderApp).not.toHaveBeenCalled()
}

describe('startApp', () => {
  it('renders the app for a clear answer, signed out included', async () => {
    server.use(http.get('/api/auth/session', () => HttpResponse.json(null)))
    await start()
    expect(screen.getByText('App: signedOut')).toBeInTheDocument()
  })

  it.each([
    ['a 5xx', () => new HttpResponse('quota', { status: 503 })],
    ['an HTML answer', () => HttpResponse.html('<!doctype html><title>Deep Cuts</title>')],
  ])('shows "can’t reach your account" on %s', async (_, answer) => {
    server.use(http.get('/api/auth/session', answer))
    await start()
    expectUnreachable()
  })

  it('shows "can’t reach your account" when the session check hangs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      server.use(http.get('/api/auth/session', () => new Promise<Response>(() => {})))
      const started = startApp(root, createCloudflareSessionProvider(), renderApp)
      await act(() => vi.advanceTimersByTimeAsync(5_000))
      await act(() => started)
    } finally {
      vi.useRealTimers()
    }
    expectUnreachable()
  })

  it('says so when a retry fails, and renders the app once one gets through', async () => {
    const user = userEvent.setup()
    server.use(http.get('/api/auth/session', () => new HttpResponse(null, { status: 500 })))
    await start()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/Still no answer/)).toBeInTheDocument()
    expect(renderApp).not.toHaveBeenCalled()

    server.use(http.get('/api/auth/session', () => HttpResponse.json({ id: 'u1', name: 'Ada' })))
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('App: account')).toBeInTheDocument()
  })
})
