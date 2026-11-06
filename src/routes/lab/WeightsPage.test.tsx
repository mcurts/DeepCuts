// Tests for the weights lab: sliders, settings in the URL, reset, and the feature flag.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { createLocalFeedbackLog } from '@/adapters/local/LocalFeedbackLog'
import { SCORE_PARTS, SCORER_VERSION, type ScorePart } from '@/domain/scorer'
import { renderRoute } from '@/test/renderRoute'

/** Likes The Thing on its Detail page, then opens `path`, as a person would. */
async function likeThenOpen(path: string, options: Parameters<typeof renderRoute>[1] = {}) {
  const user = userEvent.setup()
  const rendered = renderRoute('/movie/1091', options)
  const group = await screen.findByRole('group', { name: 'Your tags' })
  await user.click(within(group).getByRole('button', { name: 'More like this' }))
  // Detail stages tag changes until Save.
  await user.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText(/^Saved\./)
  await act(() => rendered.router.navigate(path))
  return { user, ...rendered }
}

describe('weights lab', () => {
  it('asks for likes first when there are none', async () => {
    renderRoute('/lab/weights')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tune the weights' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Mark a few films “More like this” first/)).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('shows a labelled, described slider per part and the ranked picks', async () => {
    await likeThenOpen('/lab/weights')
    const support = await screen.findByRole('slider', { name: 'Recommended by your likes' })
    expect(support).toHaveValue('17')
    expect(support).toHaveAccessibleDescription(
      'How many of your liked films recommend it, or share its series.',
    )
    // Twelve score parts, genre variety and the dislike penalty.
    expect(screen.getAllByRole('slider')).toHaveLength(14)
    expect(screen.getByRole('slider', { name: 'Dislike penalty' })).toHaveValue('15')
    expect(screen.getByRole('slider', { name: 'Same writer' })).toHaveValue('5')
    expect(screen.getByRole('slider', { name: 'Same series' })).toHaveValue('7')

    // The picks table comes first; the score spread table follows it.
    const [table] = await screen.findAllByRole('table')
    if (!table) throw new Error('no picks table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.length).toBeGreaterThan(0)
    // At the defaults nothing has moved.
    for (const row of rows) expect(row).toHaveTextContent(/^1?\d.*–\d+%/)
    expect(screen.getByText(/support: 0\.17/)).toBeInTheDocument()
    expect(screen.getByText(/support: 0\.17/)).toHaveTextContent('dislikePenalty: 0.15')
    expect(within(table).getByRole('columnheader', { name: /Avoid/ })).toBeInTheDocument()
  })

  it('shows how spread out the scores are', async () => {
    await likeThenOpen('/lab/weights')
    const heading = await screen.findByRole('heading', { name: 'Score spread' })
    expect(heading).toBeVisible()
    expect(screen.getByText(/run from \d+% to \d+% match/)).toBeInTheDocument()
    const tables = await screen.findAllByRole('table')
    const spread = tables.at(-1)
    if (!spread) throw new Error('no spread table')
    // A row per part, plus the dislike penalty.
    expect(within(spread).getAllByRole('row')).toHaveLength(1 + 12 + 1)
    expect(within(spread).getByRole('rowheader', { name: 'Dislike penalty' })).toBeInTheDocument()
  })

  it('keeps settings in the URL, scales them to 100%, and ignores bad values', async () => {
    await likeThenOpen(
      '/lab/weights?support=50&genre=50&quality=0&deepCut=0&decade=0&language=0&keywords=0&director=0&writer=0&series=0&cast=0&studio=0&diversity=999&penalty=30',
    )
    expect(await screen.findByRole('slider', { name: 'Genre fit' })).toHaveValue('50')
    // Out-of-range diversity falls back to the default 3.
    expect(screen.getByRole('slider', { name: 'Genre variety' })).toHaveValue('3')
    const settings = screen.getByText(/support: 0\.50/)
    expect(settings).toHaveTextContent('genre: 0.50')
    expect(settings).toHaveTextContent('diversityPenalty: 0.03')
    expect(settings).toHaveTextContent('dislikePenalty: 0.30')
  })

  it('updates the URL from the keyboard and resets to the defaults', async () => {
    const { user, router } = await likeThenOpen('/lab/weights')
    const deepCut = await screen.findByRole('slider', { name: 'Deep cut' })
    await act(() => deepCut.focus())
    await user.keyboard('{ArrowRight}')
    expect(router.state.location.search).toContain('deepCut=12')
    expect(deepCut).toHaveValue('12')

    await user.click(screen.getByRole('link', { name: 'Reset to defaults' }))
    expect(router.state.location.search).toBe('')
    expect(screen.getByRole('slider', { name: 'Deep cut' })).toHaveValue('11')
  })

  it('warns when every weight is zero', async () => {
    await likeThenOpen(
      '/lab/weights?support=0&genre=0&quality=0&deepCut=0&decade=0&language=0&keywords=0&director=0&writer=0&series=0&cast=0&studio=0',
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Every weight is at zero')
  })

  describe('learn from your presses', () => {
    // Saves `count` presses on Home's picks for the demo account: Wants have high quality, Nopes
    // low, so quality is what tells them apart.
    function savePresses(count: number) {
      const log = createLocalFeedbackLog('feedback-demo:demo')
      for (let i = 0; i < count; i++) {
        const want = i % 2 === 1
        log.add({
          tmdbId: 1000 + i,
          action: want ? 'watchlist' : 'disliked',
          parts: {
            ...(Object.fromEntries(SCORE_PARTS.map((p) => [p, 0.5])) as Record<ScorePart, number>),
            quality: want ? 0.9 : 0.1,
          },
          penalty: 0,
          scorerVersion: SCORER_VERSION,
          at: '2026-10-15T12:00:00.000Z',
        })
      }
    }

    it('says how many presses it still needs', async () => {
      savePresses(4)
      await likeThenOpen('/lab/weights')
      const panel = await screen.findByRole('region', { name: 'Learn from your presses' })
      expect(panel).toHaveTextContent('Want 2 · More 0 · Less 2')
      expect(panel).toHaveTextContent('30 presses, at least 5 yeses and 5 noes, are needed')
      expect(panel).toHaveTextContent('4 so far')
    })

    it('suggests weights from enough presses and puts them on the sliders', async () => {
      savePresses(40)
      const { user, router } = await likeThenOpen('/lab/weights?diversity=5')
      const panel = await screen.findByRole('region', { name: 'Learn from your presses' })
      expect(panel).toHaveTextContent(/call 100% of your presses right/)
      await user.click(within(panel).getByRole('link', { name: 'Use these weights' }))
      const search = new URLSearchParams(router.state.location.search)
      expect(Number(search.get('quality'))).toBeGreaterThan(90)
      expect(search.get('diversity')).toBe('5')
      expect(search.get('penalty')).toBe('0')
      expect(screen.getByRole('slider', { name: 'Rating' })).toHaveValue(search.get('quality'))
    })
  })

  it('is linked from Discover once there are picks', async () => {
    const { user, router } = await likeThenOpen('/')
    await user.click(await screen.findByRole('link', { name: 'Tune the weights' }))
    expect(router.state.location.pathname).toBe('/lab/weights')
  })

  it('does not exist outside the dev server: the old address goes to Discover', async () => {
    const { router } = renderRoute('/discover/weights', { features: { labs: false } })
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    renderRoute('/lab/weights', { features: { labs: false } })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeVisible()
  })

  it('sends the old address to the lab on the dev server', async () => {
    const { router } = renderRoute('/discover/weights')
    await waitFor(() => expect(router.state.location.pathname).toBe('/lab/weights'))
  })
})
