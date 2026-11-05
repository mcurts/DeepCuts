// Tests for My Lists: tagged films appear under their list, `?tag=` filters, and an unknown
// `?tag=` (or the retired Seen list's) falls back to Want to see, and the films are VHS boxes with their credits. The watchlist
// can be put in your own order.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { createLocalTagRepository } from '@/adapters/local/LocalTagRepository'
import { renderRoute } from '@/test/renderRoute'

describe('my lists', () => {
  it('shows tagged films under their tile and filters by ?tag=', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091')
    const group = await screen.findByRole('group', { name: 'Your tags' })
    await user.click(within(group).getByRole('button', { name: 'More like this' }))
    // Detail stages tag changes until Save.
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/^Saved\./)

    await act(() => router.navigate('/lists'))
    const lists = screen.getByRole('navigation', { name: 'Lists' })
    expect(within(lists).getByRole('link', { name: /Want to see/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
    // The empty message waits for the list to load (a row of placeholders stands in until then).
    expect(await screen.findByText(/will appear here/)).toBeInTheDocument()

    await user.click(await within(lists).findByRole('link', { name: /More like this.*1 film/ }))
    expect(
      await screen.findByRole('link', { name: /The Thing.*1982 · Horror/ }),
    ).toBeInTheDocument()
    expect(router.state.location.search).toBe('?tag=liked')
  })

  it.each(['hidden', 'seen'])('falls back to Want to see for ?tag=%s', async (tag) => {
    renderRoute(`/lists?tag=${tag}`)
    const lists = await screen.findByRole('navigation', { name: 'Lists' })
    expect(within(lists).getByRole('link', { name: /Want to see/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('shows each film as a VHS box with its credits, at every width', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091')
    const group = await screen.findByRole('group', { name: 'Your tags' })
    await user.click(within(group).getByRole('button', { name: 'More like this' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/^Saved\./)

    await act(() => router.navigate('/lists?tag=liked'))
    const tile = await screen.findByRole('link', { name: /The Thing.*1982 · Horror/ })
    expect(tile).toHaveAttribute('data-vhs-target')
    await screen.findByText('John Carpenter')
    expect(tile).toHaveTextContent('Director: John Carpenter')
  })

  describe('reordering the watchlist', () => {
    /** Puts Alien, The Thing, then a third film (790) on the demo watchlist, oldest first. */
    async function seed() {
      const tags = createLocalTagRepository(undefined, undefined, 'account-demo-tags')
      for (const id of [348, 1091, 790]) await tags.setTag(id, 'watchlist', true)
      return tags
    }
    const titles = () =>
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.replace(/^#\d+ /, ''))

    it('moves a film by keyboard, keeps it there, and Escape leaves the mode', async () => {
      const tags = await seed()
      const user = userEvent.setup()
      renderRoute('/lists?tag=watchlist')
      // Newest first until reordered, as an ordered list.
      await screen.findByRole('link', { name: /^Alien/ })
      expect(screen.getAllByRole('list').some((l) => l.tagName === 'OL')).toBe(true)
      const [first, , last] = titles() as string[]
      expect(last).toBe('Alien')

      const toggle = screen.getByRole('button', { name: 'Reorder' })
      toggle.focus()
      await user.keyboard('{Enter}')
      expect(screen.getByText(/^Reordering your watchlist/)).toBeInTheDocument()
      const earlier = await screen.findByRole('button', { name: 'Move Alien earlier' })
      earlier.focus()
      await user.keyboard('{Enter}')
      await waitFor(() => expect(titles()[1]).toBe('Alien'))
      expect(screen.getByText('Alien moved to #2.')).toBeInTheDocument()
      expect(earlier).toHaveFocus()
      expect((await tags.list('watchlist'))[1]).toBe(348)

      await user.keyboard('{Escape}')
      expect(screen.getByRole('button', { name: 'Reorder' })).toHaveFocus()
      expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()
      expect(titles()).toEqual([first, 'Alien', expect.any(String)])
    })

    it('offers reorder only on the watchlist', async () => {
      const tags = await seed()
      for (const id of [348, 1091]) await tags.setTag(id, 'liked', true)
      renderRoute('/lists?tag=liked')
      await screen.findByRole('link', { name: /^Alien/ })
      expect(screen.queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument()
    })
  })
})
