// Tests for the optional "Tune my picks" onboarding: hidden while its feature flag is off, and
// (with the flag turned on) each of the two steps. There's no genre step.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '@/test/renderRoute'

describe('tune my picks (onboarding)', () => {
  it('is hidden while the feature flag is off: /tune goes home, no header link', async () => {
    const { router } = renderRoute('/tune')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your movies, close at hand' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.queryByRole('link', { name: 'Tune my picks' })).not.toBeInTheDocument()
  })

  it('starts with a favorite film, never asks for genres, and ignores old genre links', async () => {
    renderRoute('/tune?genres=27', { features: { onboarding: true } })
    expect(await screen.findByText('Step 1 of 2')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'What’s your favorite movie?' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Horror' })).not.toBeInTheDocument()
  })

  it('step 1: a favorite picked in search survives the trip to Detail and back', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/tune?step=1', { features: { onboarding: true } })
    expect(await screen.findByRole('button', { name: /Find my taste/ })).toBeDisabled()
    await user.type(screen.getByRole('combobox', { name: 'Find a movie to view and tag' }), 'thing')
    await user.click(await screen.findByRole('option', { name: /The Thing/ }))
    await screen.findByRole('heading', { level: 1, name: 'The Thing' })
    await act(() => router.navigate(-1))
    expect(await screen.findByText('Your pick')).toBeInTheDocument()
    expect(screen.getByText('The Thing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Find my taste/ })).toBeEnabled()
    // Continuing moves focus to the next step's heading.
    await user.click(screen.getByRole('button', { name: /Find my taste/ }))
    const h1 = await screen.findByRole('heading', { level: 1, name: 'What do you think?' })
    await waitFor(() => expect(h1).toHaveFocus())
    expect(router.state.location.search).toContain('step=2')
  })

  it('step 2: rate cards, never skip after a dislike, finish on Discover', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/tune?step=2', { features: { onboarding: true } })
    const card = await screen.findByRole('article', { name: 'The Thing' })
    expect(screen.getByText('Tune your picks · 1 of 3')).toBeInTheDocument()
    const tags = within(card).getByRole('group', { name: 'Your tags for The Thing' })
    await user.click(within(tags).getByRole('button', { name: /Less like this/ }))
    await waitFor(() =>
      expect(within(tags).getByRole('button', { name: /Less like this/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Next film' }))
    expect(await screen.findByRole('article', { name: 'Alien' })).toBeInTheDocument()
    expect(screen.getByText('Tune your picks · 2 of 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next film' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(router.state.location.search).toBe('')
  })

  it('step 2 skips the favorite and anything already disliked', async () => {
    renderRoute('/tune?step=2&favorite=1091', { features: { onboarding: true } })
    expect(await screen.findByRole('article', { name: 'Alien' })).toBeInTheDocument()
  })
})
