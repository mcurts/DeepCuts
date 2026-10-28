// Tests for Home (signed in): its three shelves in order (ADR-0040), the Top Ten in its ranked
// order with the next open slot (ADR-0036) and its reorder mode (ADR-0041), the ticker, and the
// Discovery panel: the deep-cuts starter shelf without likes (ADR-0042), scored picks with a match and the reason with
// likes or a Top Ten (ADR-0043), and the quick actions on each pick (issue #76).
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { createLocalFeedbackLog } from '@/adapters/local/LocalFeedbackLog'
import { createLocalTagRepository } from '@/adapters/local/LocalTagRepository'
import { SCORE_PARTS, SCORER_VERSION } from '@/domain/scorer'
import { createLocalTopTenRepository } from '@/adapters/local/LocalTopTenRepository'
import { findToast, renderRoute } from '@/test/renderRoute'
import { candidateDetailFixtures, searchFixture } from '@/test/msw/fixtures'
import { server } from '@/test/msw/server'

/** The first (top-ranked) pick in the Discovery panel, once the picks have loaded. */
async function firstPick() {
  return within(await firstTile()).getByRole('link')
}

/** The first Discovery pick's whole tile: its link, reason line and quick actions. */
async function firstTile() {
  const panel = await screen.findByRole('region', { name: 'Discover Some Deep Cuts' })
  // The skeleton tiles are aria-hidden, so they never match.
  const [first] = await within(panel).findAllByRole('listitem')
  if (!first) throw new Error('no picks')
  return first
}

describe('home', () => {
  it('stacks Top Ten, the watchlist and Discovery as three shelves, features 1 to 3', async () => {
    renderRoute('/')
    await screen.findByRole('heading', { level: 2, name: 'Your Top Ten of All Time' })
    // Only the shelves: the toast area is a region too, once Sonner has loaded.
    const shelves = screen
      .getAllByRole('region')
      .filter((r) => r.getAttribute('aria-labelledby')?.startsWith('shelf-'))
    expect(shelves.map((r) => r.getAttribute('aria-labelledby'))).toEqual([
      'shelf-top-ten',
      'shelf-watchlist',
      'shelf-discovery',
    ])
    expect(shelves.map((r) => within(r).getByText(/^Feature Nº/).textContent)).toEqual([
      'Feature Nº 1',
      'Feature Nº 2',
      'Feature Nº 3',
    ])
    // The headline ends in the blood-red highlight, but still reads as one sentence.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Your movies, close at hand' }),
    ).toBeInTheDocument()
  })

  it('returns a retired Discover URL to Home', async () => {
    const { router } = renderRoute('/discover')
    await screen.findByRole('heading', { level: 1, name: 'Your movies, close at hand' })
    expect(router.state.location.pathname).toBe('/')
  })

  it('starts a new account on acclaimed, lesser-known older films, not popular ones (ADR-0042)', async () => {
    let url: URL | undefined
    server.use(
      http.get('/api/tmdb/discover/movie', ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json(searchFixture)
      }),
    )
    renderRoute('/')
    expect(await firstPick()).toHaveAccessibleName(/^The Thing/)
    // The vote band that keeps blockbusters out, on one of the first ten pages.
    expect(url?.searchParams.get('vote_count.lte')).toBe('3000')
    expect(url?.searchParams.get('vote_average.gte')).toBe('7')
    expect(Number(url?.searchParams.get('page'))).toBeGreaterThanOrEqual(1)
    expect(Number(url?.searchParams.get('page'))).toBeLessThanOrEqual(10)
  })

  it('reserves the picks while the film list loads', async () => {
    server.use(
      http.get('/api/tmdb/discover/movie', async () => {
        await delay(250)
        return HttpResponse.json(searchFixture)
      }),
    )

    renderRoute('/')
    // Discovery's own status (the Top Ten shelf has one too, for reorder mode).
    const discovery = await screen.findByRole('region', { name: 'Discover Some Deep Cuts' })
    expect(await within(discovery).findByRole('status')).toHaveTextContent('Finding films…')
    expect(document.querySelector('[data-loading-section="grid"]')).toBeInTheDocument()
    expect(await firstPick()).toHaveAccessibleName(/^The Thing/)
  })

  it('holds a Top Ten film’s place while it loads, so the shelf doesn’t jump', async () => {
    await createLocalTopTenRepository('account-demo-top-ten').add(348)
    // Alien's details are slow; every other film answers at once (the default handler).
    server.use(
      http.get('/api/tmdb/movie/348', async () => {
        await delay(250)
        return HttpResponse.json(candidateDetailFixtures[348])
      }),
    )
    renderRoute('/')
    const panel = await screen.findByRole('region', { name: 'Your Top Ten of All Time' })
    // The open slot is #2 from the start: a placeholder (hidden from screen readers) holds #1.
    await within(panel).findByRole('button', { name: /^Add a film/ })
    const [first, second] = panel.querySelectorAll('ol > li')
    expect(first?.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    expect(second).toHaveTextContent('#2')
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
    // Then Alien takes its place.
    expect(await within(panel).findByRole('link', { name: /^#1 Alien/ })).toBeInTheDocument()
  })

  it('shows the picks as VHS cassettes, two across, with credits and no featured card', async () => {
    renderRoute('/')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your movies, close at hand' }),
    ).toBeInTheDocument()
    expect(await firstPick()).toHaveAccessibleName(/^The Thing/)
    // The big featured card is gone (owner, 2026-10-09): the top pick is the first cassette.
    expect(screen.queryByText(/featured deep cut/i)).not.toBeInTheDocument()
    const panel = screen.getByRole('region', { name: 'Discover Some Deep Cuts' })
    const alien = within(panel).getByRole('link', { name: /Alien.*1979 · Horror/ })
    // Each box wears its VHS genre sticker, which stays out of the link's accessible name.
    expect(alien.querySelector('[data-genre-sticker="horror"]')).toHaveTextContent('Horror')
    // Director and writer fill in from the film's details, without any likes.
    await waitFor(() => expect(alien).toHaveTextContent('Director: Ridley Scott'))
    expect(alien).toHaveTextContent('Writer: Dan O’Bannon')
    // The title is clamped to two lines visually; the full title stays in the page and on hover.
    const title = within(alien).getByRole('heading', { level: 3, name: 'Alien' })
    expect(title).toHaveClass('line-clamp-2')
    expect(title).toHaveAttribute('title', 'Alien')
  })

  it('the Top Ten starts with an open slot that sends you to search, and shows a film added from Detail', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/')
    const panel = await screen.findByRole('region', { name: 'Your Top Ten of All Time' })
    await user.click(await within(panel).findByRole('button', { name: /^Add a film/ }))
    expect(screen.getByRole('combobox', { name: 'Find a movie to view and tag' })).toHaveFocus()

    await act(() => router.navigate('/movie/1091'))
    await user.click(await screen.findByRole('button', { name: 'Your pick? Add to Top 10' }))
    await screen.findByText(/#1 in Top 10/)
    await act(() => router.navigate('/'))
    const updated = await screen.findByRole('region', { name: 'Your Top Ten of All Time' })
    expect(
      await within(updated).findByRole('link', { name: /^#1 The Thing.*1982 · Horror/ }),
    ).toBeInTheDocument()
    // The open slot moves on to #2.
    expect(within(updated).getByText('#2')).toBeInTheDocument()
  })

  it('shows the Top Ten in its ranked order, numbered, as an ordered list', async () => {
    const topTen = createLocalTopTenRepository('account-demo-top-ten')
    await topTen.add(348) // Alien
    await topTen.add(1091) // The Thing
    renderRoute('/')
    const panel = await screen.findByRole('region', { name: 'Your Top Ten of All Time' })
    await within(panel).findByRole('link', { name: /^#2 The Thing/ })
    const links = within(panel).getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/movie/348', '/movie/1091'])
    expect(links[0]).toHaveAccessibleName(/^#1 Alien/)
    // The rank is also the box's mustard tab (decorative; the caption says it to screen readers).
    expect(links[0]?.querySelector('[aria-hidden="true"]')).toHaveTextContent('#1')
  })

  describe('reordering the Top Ten (ADR-0041)', () => {
    /** Seeds the demo account's Top Ten: Alien, The Thing, then a third film (790). */
    async function seed() {
      const topTen = createLocalTopTenRepository('account-demo-top-ten')
      for (const id of [348, 1091, 790]) await topTen.add(id)
      return topTen
    }
    /** The films' titles on the shelf, in the order shown. */
    const titles = (panel: HTMLElement) =>
      within(panel)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent?.replace(/^#\d+ /, ''))

    it('offers no reorder with one film', async () => {
      await createLocalTopTenRepository('account-demo-top-ten').add(348)
      renderRoute('/')
      const panel = await screen.findByRole('region', { name: 'Your Top Ten of All Time' })
      await within(panel).findByRole('link', { name: /^#1 Alien/ })
      expect(within(panel).queryByRole('button', { name: 'Reorder' })).not.toBeInTheDocument()
    })

    it('moves a film by keyboard alone, says where it went, keeps focus and saves', async () => {
      const topTen = await seed()
      const user = userEvent.setup()
      renderRoute('/')
      const panel = await screen.findByRole('region', { name: 'Your Top Ten of All Time' })
      await within(panel).findByRole('link', { name: /^#3 / })
      const third = titles(panel)[2] as string

      // Tab to "Reorder" and press Enter: the tiles become move buttons, and that's announced.
      const toggle = within(panel).getByRole('button', { name: 'Reorder' })
      toggle.focus()
      await user.keyboard('{Enter}')
      expect(toggle).toHaveTextContent('Done')
      expect(within(panel).getByRole('status')).toHaveTextContent(/^Reordering your Top Ten/)
      const earlier = await within(panel).findByRole('button', { name: `Move ${third} earlier` })
      // The open "Add a film" slot and the links step aside while reordering.
      expect(within(panel).queryByRole('link')).not.toBeInTheDocument()
      expect(within(panel).queryByRole('button', { name: /Add a film/ })).not.toBeInTheDocument()
      // The first film can't go earlier, and the last can't go later.
      expect(within(panel).queryByRole('button', { name: 'Move Alien earlier' })).toBeNull()
      expect(within(panel).queryByRole('button', { name: `Move ${third} later` })).toBeNull()

      earlier.focus()
      await user.keyboard('{Enter}')
      await waitFor(() => expect(titles(panel)).toEqual(['Alien', third, 'The Thing']))
      expect(within(panel).getByRole('status')).toHaveTextContent(`${third} moved to #2.`)
      expect(within(panel).getByRole('button', { name: `Move ${third} earlier` })).toHaveFocus()

      // Once it's #1 there's no "earlier" button, so focus lands on its "later" button.
      await user.keyboard('{Enter}')
      await waitFor(() => expect(titles(panel)).toEqual([third, 'Alien', 'The Thing']))
      expect(within(panel).getByRole('status')).toHaveTextContent(`${third} moved to #1.`)
      expect(within(panel).getByRole('button', { name: `Move ${third} later` })).toHaveFocus()
      expect(await topTen.list()).toEqual([790, 348, 1091])

      // "Done" brings the links back in the new order.
      await user.click(toggle)
      expect(within(panel).getByRole('status')).toHaveTextContent('Done reordering.')
      const links = within(panel).getAllByRole('link')
      expect(links.map((l) => l.getAttribute('href'))).toEqual([
        '/movie/790',
        '/movie/348',
        '/movie/1091',
      ])
    })

    it('Escape leaves reorder mode and puts focus on Reorder', async () => {
      await seed()
      const user = userEvent.setup()
      renderRoute('/')
      const panel = await screen.findByRole('region', { name: 'Your Top Ten of All Time' })
      await within(panel).findByRole('link', { name: /^#3 / })
      await user.click(within(panel).getByRole('button', { name: 'Reorder' }))
      within(panel).getByRole('button', { name: 'Move Alien later' }).focus()
      await user.keyboard('{Escape}')
      const toggle = within(panel).getByRole('button', { name: 'Reorder' })
      expect(toggle).toHaveFocus()
      expect(within(panel).getByRole('status')).toHaveTextContent('Done reordering.')
      expect(within(panel).queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()
      // Escape outside the shelf (here, with focus on the page) changes nothing.
      await user.click(toggle)
      ;(document.activeElement as HTMLElement).blur()
      await user.keyboard('{Escape}')
      expect(within(panel).getByRole('button', { name: 'Done' })).toBeInTheDocument()
    })

    it('shows the latest list when it changed in another tab mid-reorder', async () => {
      const topTen = await seed()
      const user = userEvent.setup()
      renderRoute('/')
      const panel = await screen.findByRole('region', { name: 'Your Top Ten of All Time' })
      await within(panel).findByRole('link', { name: /^#3 / })
      await user.click(within(panel).getByRole('button', { name: 'Reorder' }))
      const later = await within(panel).findByRole('button', { name: 'Move Alien later' })
      // Another tab removes The Thing, so this tab's new order no longer fits the stored list.
      await topTen.remove(1091)
      await user.click(later)
      expect(
        await findToast('Your Top Ten changed somewhere else. Here’s the latest order.'),
      ).toBeInTheDocument()
      await waitFor(() => expect(titles(panel)).toHaveLength(2))
      expect(await topTen.list()).toEqual([348, 790])
    })

    it('puts the order back and says so when the save fails', async () => {
      const topTen = await seed()
      const user = userEvent.setup()
      renderRoute('/')
      const panel = await screen.findByRole('region', { name: 'Your Top Ten of All Time' })
      await within(panel).findByRole('link', { name: /^#3 / })
      await user.click(within(panel).getByRole('button', { name: 'Reorder' }))
      const later = await within(panel).findByRole('button', { name: 'Move Alien later' })
      // Imitate a browser that refuses to store anything (e.g. storage full).
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      try {
        await user.click(later)
        expect(await findToast('Your new order wasn’t saved. Try again.')).toBeInTheDocument()
        expect(titles(panel).slice(0, 2)).toEqual(['Alien', 'The Thing'])
      } finally {
        setItem.mockRestore()
      }
      expect(await topTen.list()).toEqual([348, 1091, 790])
    })
  })

  it('starts the watchlist shelf with an empty slot that sends you to search', async () => {
    const user = userEvent.setup()
    renderRoute('/')
    const panel = await screen.findByRole('region', { name: 'My Watchlist' })
    await user.click(await within(panel).findByRole('button', { name: /^Nothing on the bill yet/ }))
    expect(screen.getByRole('combobox', { name: 'Find a movie to view and tag' })).toHaveFocus()
  })

  it('shows the latest watchlist films with their ADMIT ONE tickets; the heading opens the list', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091')
    const group = await screen.findByRole('group', { name: 'Your tags' })
    await user.click(within(group).getByRole('button', { name: 'Want to see' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/^Saved\./)
    await act(() => router.navigate('/'))
    const panel = await screen.findByRole('region', { name: 'My Watchlist' })
    const thing = await within(panel).findByRole('link', { name: /The Thing.*1982 · Horror/ })
    expect(thing.querySelector('[data-genre-sticker="horror"]')).toBeInTheDocument()
    expect(within(thing).getByText('Admit one')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: 'My Watchlist' })).toHaveAttribute(
      'href',
      '/lists?tag=watchlist',
    )
  })

  it('shows the watchlist in the order you chose on My Lists (ADR-0041)', async () => {
    const tags = createLocalTagRepository(undefined, undefined, 'account-demo-tags')
    for (const id of [348, 1091]) await tags.setTag(id, 'watchlist', true)
    // Newest first would be The Thing, then Alien; the saved order puts Alien first.
    await tags.reorder('watchlist', [348, 1091])
    renderRoute('/')
    const panel = await screen.findByRole('region', { name: 'My Watchlist' })
    await within(panel).findByRole('link', { name: /^The Thing/ })
    const films = within(panel)
      .getAllByRole('link')
      .map((l) => l.getAttribute('href'))
      .filter((href) => href?.startsWith('/movie/'))
    expect(films).toEqual(['/movie/348', '/movie/1091'])
  })

  it('leaves disliked films out of the feed (ADR-0017)', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091')
    const group = await screen.findByRole('group', { name: 'Your tags' })
    await user.click(within(group).getByRole('button', { name: 'Less like this' }))
    // Detail stages tag changes until Save.
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/^Saved\./)
    await act(() => router.navigate('/'))
    expect(await firstPick()).toHaveAccessibleName(/^Alien/)
    expect(screen.queryByRole('link', { name: /The Thing/ })).not.toBeInTheDocument()
  })

  describe('quick actions on the picks (issue #76)', () => {
    /** The Discovery tile (its list item) for a film, once the picks have loaded. */
    async function pickTile(title: RegExp) {
      const panel = await screen.findByRole('region', { name: 'Discover Some Deep Cuts' })
      const link = await within(panel).findByRole('link', { name: title })
      const tile = link.closest('li')
      if (!tile) throw new Error('no tile')
      return tile
    }

    it('saves a pick in one tap, stamps it in place, and undoes it from the tile', async () => {
      const user = userEvent.setup()
      renderRoute('/')
      const tile = await pickTile(/^The Thing/)
      // Three actions after the tile's link, named in full with the film.
      const actions = within(tile).getByRole('group', { name: 'Quick actions for The Thing' })
      expect(
        within(actions)
          .getAllByRole('button')
          .map((b) => b.getAttribute('aria-label')),
      ).toEqual(['Want to see The Thing', 'More like this The Thing', 'Less like this The Thing'])
      await user.click(within(actions).getByRole('button', { name: 'Want to see The Thing' }))

      await findToast('Added The Thing to your watchlist.')
      // The pick stays where it was, stamped, and focus moves to its Undo.
      expect(within(tile).getByRole('link')).toHaveAccessibleName(/On your watchlist\./)
      // It keeps its credit lines, though it has left the live picks.
      await waitFor(() => expect(within(tile).getByRole('link')).toHaveTextContent('Director:'))
      const undo = within(tile).getByRole('button', { name: 'Undo Want to see for The Thing' })
      expect(undo).toHaveFocus()
      // It's on the watchlist shelf now.
      const watchlist = screen.getByRole('region', { name: 'My Watchlist' })
      expect(await within(watchlist).findByRole('link', { name: /^The Thing/ })).toBeInTheDocument()

      await user.click(undo)
      // Back as it was: off the watchlist, the strip back, focus on the button that was pressed.
      await waitFor(() =>
        expect(
          within(watchlist).queryByRole('link', { name: /^The Thing/ }),
        ).not.toBeInTheDocument(),
      )
      expect(within(tile).getByRole('button', { name: 'Want to see The Thing' })).toHaveFocus()
      expect(within(tile).getByRole('link')).not.toHaveAccessibleName(/On your watchlist/)
    })

    it('undoes from the toast too, putting back the tags the film had', async () => {
      const user = userEvent.setup()
      // Alien is already disliked, so it stays out of the starter picks (it's tagged).
      const tags = createLocalTagRepository(undefined, undefined, 'account-demo-tags')
      await tags.setTag(348, 'disliked', true)
      renderRoute('/')
      // Tagged films leave the starter picks, so Alien isn't offered; use The Thing.
      expect(screen.queryByRole('link', { name: /^Alien/ })).not.toBeInTheDocument()
      const tile = await pickTile(/^The Thing/)
      await user.click(within(tile).getByRole('button', { name: 'Less like this The Thing' }))
      const toast = await findToast('The Thing won’t be picked again.')
      const region = toast.closest('section') ?? document.body
      // A plain click: a pointer press on a toast starts Sonner's swipe, which calls
      // setPointerCapture, missing in jsdom.
      fireEvent.click(within(region).getByRole('button', { name: 'Undo' }))
      await waitFor(() =>
        expect(within(tile).getByRole('link')).not.toHaveAccessibleName(/Less like this/),
      )
      // The Thing is back to no tags; Alien still has its own.
      expect(await tags.getTags(1091)).toEqual(new Set())
      expect(await tags.getTags(348)).toEqual(new Set(['disliked']))
    })

    it('saves a press on a tuned pick with its scores, and Undo takes it back (ADR-0045)', async () => {
      const user = userEvent.setup()
      const tags = createLocalTagRepository(undefined, undefined, 'account-demo-tags')
      await tags.setTag(1091, 'liked', true)
      const log = createLocalFeedbackLog('feedback-demo:demo')
      renderRoute('/')
      const tile = await pickTile(/^The Fog/)
      await user.click(within(tile).getByRole('button', { name: 'Less like this The Fog' }))
      await findToast('The Fog won’t be picked again.')
      const [entry] = log.list()
      expect(entry).toMatchObject({
        tmdbId: 790,
        action: 'disliked',
        scorerVersion: SCORER_VERSION,
      })
      expect(Object.keys(entry?.parts ?? {})).toEqual([...SCORE_PARTS])
      expect(entry?.penalty).toBe(0)

      await user.click(
        within(tile).getByRole('button', { name: 'Undo Less like this for The Fog' }),
      )
      await waitFor(() => expect(log.list()).toEqual([]))
    })

    it('saves no press on a starter pick: it was never scored', async () => {
      const user = userEvent.setup()
      renderRoute('/')
      const tile = await pickTile(/^The Thing/)
      await user.click(within(tile).getByRole('button', { name: 'More like this The Thing' }))
      await findToast('Got it: more films like The Thing.')
      expect(within(tile).getByRole('link')).toHaveAccessibleName(/More like this\./)
      expect(createLocalFeedbackLog('feedback-demo:demo').list()).toEqual([])
    })

    it('a picked film is gone the next time Home opens', async () => {
      const user = userEvent.setup()
      const { router } = renderRoute('/')
      const tile = await pickTile(/^The Thing/)
      await user.click(within(tile).getByRole('button', { name: 'Want to see The Thing' }))
      await findToast('Added The Thing to your watchlist.')
      await act(() => router.navigate('/lists'))
      await act(() => router.navigate('/'))
      expect(await firstPick()).toHaveAccessibleName(/^Alien/)
      // It's on the watchlist shelf now, but no longer a Discovery pick.
      const discovery = screen.getByRole('region', { name: 'Discover Some Deep Cuts' })
      expect(within(discovery).queryByRole('link', { name: /^The Thing/ })).not.toBeInTheDocument()
    })
  })

  it('drops a pick tagged on its Detail page once you are back on Home', async () => {
    const user = userEvent.setup()
    renderRoute('/')
    // Open the pick, tag it there and save, which closes Detail back to Home.
    await user.click(await firstPick())
    const group = await screen.findByRole('group', { name: 'Your tags' })
    await user.click(within(group).getByRole('button', { name: 'Less like this' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('heading', { level: 1, name: 'Your movies, close at hand' })
    // The shelf is built from the saved tags, not the ones from before the save: the next film
    // moves up and the tagged one is gone.
    expect(await firstPick()).toHaveAccessibleName(/^Alien/)
    expect(screen.queryByRole('link', { name: /^The Thing/ })).not.toBeInTheDocument()
  })

  it.each(['?genres=27,53', '?genres=27;DROP', '?genres='])(
    'ignores %s: favourite genres are gone (ADR-0032)',
    async (qs) => {
      renderRoute(`/${qs}`)
      expect(
        await screen.findByText('Mark a few films “More like this” to tune these picks to you.'),
      ).toBeInTheDocument()
    },
  )
})

describe('home with likes (ADR-0026)', () => {
  it('ranks films recommended by your likes, with a real match and the reason', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091')
    const group = await screen.findByRole('group', { name: 'Your tags' })
    await user.click(within(group).getByRole('button', { name: 'More like this' }))
    // Detail stages tag changes until Save.
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/^Saved\./)
    await act(() => router.navigate('/'))

    const feature = await firstPick()
    // Tuned picks drop the "like a few films" hint.
    expect(
      screen.queryByText('Mark a few films “More like this” to tune these picks to you.'),
    ).not.toBeInTheDocument()
    expect(feature).toHaveTextContent(/\d+% match/)
    // The match is also the box's blood-red stamp.
    expect(within(feature).getByText(/^\d+%$/)).toBeInTheDocument()
    // "Why this pick?" sits after the tile's link; pressing it opens the full sentence.
    const reason = within(await firstTile()).getByRole('button', {
      name: 'Why this pick? (The Fog)',
    })
    await userEvent.click(reason)
    expect(await screen.findByRole('dialog', { name: 'Why The Fog was picked' })).toHaveTextContent(
      'Same director as The Thing',
    )
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // The re-rank loaded the top candidates' directors (ADR-0028): The Fog shares John Carpenter
    // with The Thing, which lifts it to the top spot.
    expect(feature).toHaveTextContent('The Fog')
    // Picks only appear once both passes are in, so the top pick never changes under you.
    const discovery = screen.getByRole('region', { name: 'Discover Some Deep Cuts' })
    expect(within(discovery).queryByRole('status')).not.toBeInTheDocument()
    // Tiles name the director and writer; the old "Directed by X, like Y" reason is gone.
    await waitFor(() => expect(feature).toHaveTextContent('Director: John Carpenter'))
    expect(feature).not.toHaveTextContent('Directed by')
    const panel = screen.getByRole('region', { name: 'Discover Some Deep Cuts' })
    const halloween = within(panel).getByRole('link', { name: /Halloween/ })
    expect(halloween).toHaveTextContent(/\d+% match/)
    await waitFor(() => expect(halloween).toHaveTextContent('Writers: John Carpenter, Debra Hill'))
    // The liked film itself is never recommended back.
    expect(screen.queryByRole('link', { name: /^The Thing/ })).not.toBeInTheDocument()
  })

  it('sums the lists up in the ticker: real counts and the top pick, no zeros (ADR-0040)', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/1091')
    const group = await screen.findByRole('group', { name: 'Your tags' })
    await user.click(within(group).getByRole('button', { name: 'More like this' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/^Saved\./)
    await act(() => router.navigate('/'))
    await firstPick()
    // The screen-reader copy of the ticker is the first list on the page.
    const [ticker] = screen.getAllByRole('list')
    if (!ticker) throw new Error('no ticker')
    const facts = within(ticker)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    // Nothing on the Top Ten or the watchlist yet, so those items are left out.
    expect(facts).toEqual([
      expect.stringMatching(/^Discovery: \d+ new picks?$/),
      expect.stringMatching(/^Top pick: The Fog, \d+% match$/),
    ])
  })
})

describe('home with a Top Ten (ADR-0043)', () => {
  it('tunes the picks from your Top Ten alone, and never suggests a Top Ten film', async () => {
    // The Thing is in the Top Ten but has no tags at all.
    await createLocalTopTenRepository('account-demo-top-ten').add(1091)
    renderRoute('/')

    const feature = await firstPick()
    // Scored picks, not the starter shelf: a match and the reason, from the Top Ten film.
    expect(feature).toHaveTextContent(/\d+% match/)
    await userEvent.click(within(await firstTile()).getByRole('button', { name: /^Why this pick/ }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('The Thing')
    // The open bubble hides the page from assistive tech, so close it before reading on.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(feature).toHaveTextContent('The Fog')
    // The Top Ten film itself is never recommended back.
    const panel = screen.getByRole('region', { name: 'Discover Some Deep Cuts' })
    expect(within(panel).queryByRole('link', { name: /^The Thing/ })).not.toBeInTheDocument()
  })

  it('leaves Top Ten films out of the starter shelf too', async () => {
    // TMDB recommends nothing for Alien here, so the scorer has no picks and the starter shelf
    // (The Thing, then Alien) shows instead.
    await createLocalTopTenRepository('account-demo-top-ten').add(348)
    renderRoute('/')

    expect(await firstPick()).toHaveAccessibleName(/^The Thing/)
    const panel = screen.getByRole('region', { name: 'Discover Some Deep Cuts' })
    expect(within(panel).queryByRole('link', { name: /^Alien/ })).not.toBeInTheDocument()
  })
})

describe('home with a liked film in a series (ADR-0032, ADR-0037)', () => {
  it('suggests the next released film in the series, not later ones or an announced one', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute('/movie/4488')
    const group = await screen.findByRole('group', { name: 'Your tags' })
    await user.click(within(group).getByRole('button', { name: 'More like this' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/^Saved\./)
    await act(() => router.navigate('/'))

    // TMDB recommends nothing for it here, so the pick comes from the series: only the next film.
    const feature = await firstPick()
    expect(feature).toHaveTextContent('Friday the 13th Part 2')
    await userEvent.click(within(await firstTile()).getByRole('button', { name: /^Why this pick/ }))
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Next in the series after Friday the 13th',
    )
    // The open bubble hides the page from assistive tech, so close it before reading on.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const titles = screen
      .getAllByRole('link', { name: /Friday the 13th Part/ })
      .map((l) => l.textContent)
    expect(titles.join(' ')).toMatch(/Part 2/)
    expect(titles.join(' ')).not.toMatch(/Part III/)
    expect(screen.queryByText(/Announced/)).not.toBeInTheDocument()
  })
})

describe('home over the rate limit (ADR-0029)', () => {
  it('asks once for a film the limiter refused, instead of again on every re-render', async () => {
    // The Thing is in the Top Ten; every film it recommends is refused with a 429, as when a
    // reload goes over the per-client limit.
    await createLocalTopTenRepository('account-demo-top-ten').add(1091)
    const asks = new Map<string, number>()
    server.use(
      http.get('/api/tmdb/movie/:id', ({ params }) => {
        const id = String(params.id)
        if (!candidateDetailFixtures[Number(id)]) return undefined
        asks.set(id, (asks.get(id) ?? 0) + 1)
        return HttpResponse.json(
          { error: 'rate_limited' },
          { status: 429, headers: { 'Retry-After': '60' } },
        )
      }),
    )
    renderRoute('/', { appRetries: true })
    await screen.findByRole('heading', { level: 2, name: 'Your Top Ten of All Time' })
    await waitFor(() => expect(asks.size).toBeGreaterThan(0))
    // Give a loop time to show itself: before the fix, each refused film was asked for again
    // every time the shelves re-rendered (781 times each in a live run).
    await act(() => new Promise((resolve) => setTimeout(resolve, 1500)))
    expect(Math.max(...asks.values())).toBe(1)
  })
})
