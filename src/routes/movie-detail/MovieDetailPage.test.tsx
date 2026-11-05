// Tests for the Detail page: tag toggles follow the rules, streaming logos aren't interactive,
// back navigation, the disliked marker in Search (behind its flag), the Top Ten sticker, and
// "not found" for bad ids.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createLocalTopTenRepository } from '@/adapters/local/LocalTopTenRepository'
import { findToast, renderRoute } from '@/test/renderRoute'

// The demo account's Top Ten in this browser (renderRoute signs in as the demo account), read and
// seeded through its real store.
const demoTopTen = () => createLocalTopTenRepository('account-demo-top-ten')
const seedTopTen = async (ids: number[]) => {
  for (const id of ids) await demoTopTen().add(id)
}

describe('movie detail', () => {
  it('focuses its first button and traps Tab within the Detail experience', async () => {
    const user = userEvent.setup()
    renderRoute('/movie/1091')
    const back = await screen.findByRole('button', { name: 'Back to previous screen' })
    await waitFor(() => expect(back).toHaveFocus())

    // Shift+Tab from the first focusable control wraps to the last, then Tab returns to Back.
    await user.tab({ shift: true })
    await user.tab()
    expect(back).toHaveFocus()
  })

  it('provider badges are not interactive', async () => {
    renderRoute('/movie/1091')
    const section = await screen.findByRole('region', { name: /Where to watch/ })
    await within(section).findByRole('img', { name: 'Disney Plus' })
    expect(within(section).queryAllByRole('link')).toHaveLength(0)
    expect(within(section).queryAllByRole('button')).toHaveLength(0)
  })

  it('tag toggles follow the tag rule: one at a time', async () => {
    const user = userEvent.setup()
    renderRoute('/movie/1091')
    const group = await screen.findByRole('group', { name: 'Your tags' })
    const btn = (name: string) => within(group).getByRole('button', { name })
    // The rules apply to the staged selection, before anything is saved.
    const pressed = () =>
      within(group)
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.textContent)
    await user.click(btn('Want to see'))
    expect(pressed()).toEqual([expect.stringMatching(/^Want to see/)])
    await user.click(btn('More like this'))
    expect(pressed()).toEqual([expect.stringMatching(/^More like this/)])
    await user.click(btn('Less like this'))
    expect(pressed()).toEqual([expect.stringMatching(/^Less like this/)])
    // Pressing the chosen one again clears it.
    await user.click(btn('Less like this'))
    expect(pressed()).toEqual([])
  })

  it('saves changes, announces them, then fades back to the source', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091')
    const group = await screen.findByRole('group', { name: 'Your tags' })
    const btn = (name: string) => within(group).getByRole('button', { name })
    // The 44px action slot is reserved from first paint, but no misleading action appears until
    // something changes.
    expect(document.querySelector('[data-detail-actions]')).toHaveClass('min-h-11')
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    await user.click(btn('More like this'))
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    // Undoing the change by hand hides them again: nothing differs from what's saved.
    await user.click(btn('More like this'))
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()

    // Save writes the tag, confirms it in a toast, then closes the Detail overlay.
    await user.click(btn('More like this'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await findToast('Saved. The Thing: More like this.')).toBeInTheDocument()
    // The action row stays in place for the fade and disappears only when Detail unmounts.
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))

    // What was saved is really saved: My Lists has it after the overlay closes.
    await act(() => router.navigate('/lists?tag=liked'))
    expect(await screen.findByRole('link', { name: /The Thing/ })).toBeInTheDocument()
  })

  it('a cancelled change saves nothing', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091')
    const group = await screen.findByRole('group', { name: 'Your tags' })
    await user.click(within(group).getByRole('button', { name: 'Want to see' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    await act(() => router.navigate('/lists?tag=watchlist'))
    expect(await screen.findByText(/will appear here/)).toBeInTheDocument()
  })

  it('a disliked film stays in Search with a marker', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091', { features: { searchPage: true } })
    const group = await screen.findByRole('group', { name: 'Your tags' })
    await user.click(within(group).getByRole('button', { name: 'Less like this' }))
    // Detail stages tag changes until Save.
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/^Saved\./)
    await act(() => router.navigate('/search?q=thing'))
    const row = await screen.findByRole('link', { name: /The Thing/ })
    expect(within(row).getByText('Less like this')).toBeInTheDocument()
  })

  it('back returns to the previous screen, or home (Discover) on a direct visit', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091')
    await screen.findByRole('heading', { level: 1, name: 'The Thing' })
    await user.click(screen.getByRole('button', { name: 'Back to previous screen' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('Escape closes the Detail overlay with the same fade', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091')
    await screen.findByRole('heading', { level: 1, name: 'The Thing' })
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(document.querySelector('.detail-page')).toHaveAttribute('data-closing'),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('has one back button (top), which returns to the previous screen', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/lists')
    await act(() => router.navigate('/movie/1091'))
    await screen.findByRole('heading', { level: 1, name: 'The Thing' })
    // The bottom Back button was removed once Save and Cancel arrived.
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back to previous screen' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/lists'))
  })

  describe('Top Ten', () => {
    it('adds the film, shows its rank on the sticker, and keeps it after a reload', async () => {
      const user = userEvent.setup()
      const { unmount } = renderRoute('/movie/1091')
      const sticker = await screen.findByRole('button', { name: 'Your pick? Add to Top 10' })
      await user.click(sticker)

      const notice = await screen.findByText(/#1 in Top 10/)
      // Focus follows the change, so keyboard and screen-reader users hear the result.
      await waitFor(() => expect(notice.closest('[data-top-ten-pick]')).toHaveFocus())
      expect(
        screen.queryByRole('button', { name: 'Your pick? Add to Top 10' }),
      ).not.toBeInTheDocument()
      expect(await demoTopTen().list()).toEqual([1091])
      expect(await findToast('Added The Thing to your Top Ten.')).toBeInTheDocument()
      // A Top Ten is not a tag: no tag was turned on.
      const group = screen.getByRole('group', { name: 'Your tags' })
      for (const button of within(group).getAllByRole('button'))
        expect(button).toHaveAttribute('aria-pressed', 'false')

      unmount()
      renderRoute('/movie/1091')
      expect(await screen.findByText(/#1 in Top 10/)).toBeInTheDocument()
    })

    it('Remove takes the film out and brings the sticker back', async () => {
      await seedTopTen([5, 1091, 7])
      const user = userEvent.setup()
      renderRoute('/movie/1091')
      await user.click(await screen.findByRole('button', { name: 'Remove from Top Ten' }))
      const sticker = await screen.findByRole('button', { name: 'Your pick? Add to Top 10' })
      await waitFor(() => expect(sticker).toHaveFocus())
      expect(await demoTopTen().list()).toEqual([5, 7])
      expect(await findToast('Removed The Thing from your Top Ten.')).toBeInTheDocument()
    })

    it('a full Top Ten shows a note instead of the sticker', async () => {
      await seedTopTen([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      renderRoute('/movie/1091')
      expect(await screen.findByText('Your Top Ten is full.')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Your pick? Add to Top 10' }),
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Remove from Top Ten' })).not.toBeInTheDocument()
    })

    it('a failed save keeps the sticker and says so', async () => {
      const user = userEvent.setup()
      renderRoute('/movie/1091')
      const sticker = await screen.findByRole('button', { name: 'Your pick? Add to Top 10' })
      // Imitate a browser that refuses to store anything (e.g. storage full).
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      try {
        await user.click(sticker)
        expect(await findToast(/^Couldn’t update your Top Ten/)).toBeInTheDocument()
        expect(sticker).toBeInTheDocument()
      } finally {
        setItem.mockRestore()
      }
    })

    it('a film in a full Top Ten can still be removed', async () => {
      await seedTopTen([1, 2, 3, 4, 5, 6, 7, 8, 9, 1091])
      renderRoute('/movie/1091')
      // The sticker shows the film's rank.
      expect(await screen.findByText(/#10 in Top 10/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Remove from Top Ten' })).toBeInTheDocument()
    })
  })

  it.each(['/movie/abc', '/movie/-1', '/movie/999'])('shows not found for %s', async (path) => {
    renderRoute(path)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Film not found' }),
    ).toBeInTheDocument()
  })
})
