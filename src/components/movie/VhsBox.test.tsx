// VhsBox: decorative faces, and the mouse position it reports for the CSS to turn the box.
import { act, fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MovieSummary } from '@/api/tmdb'
import { VhsBox } from './VhsBox'

const film: Pick<MovieSummary, 'id' | 'title' | 'poster_path' | 'release_date' | 'genre_ids'> = {
  id: 1091,
  title: 'The Thing',
  poster_path: '/thing.jpg',
  release_date: '1982-06-25',
  genre_ids: [27],
}

/** Renders the box inside a link marked as its target, as Discover does. */
function renderInLink(movie = film) {
  const { container } = render(
    <a href="#film" data-vhs-target="">
      <VhsBox movie={movie} />
    </a>,
  )
  const link = container.querySelector('a')
  const box = container.querySelector<HTMLElement>('.vhs-scene')
  if (!link || !box) throw new Error('VhsBox did not render')
  return { link, box }
}

describe('VhsBox', () => {
  it('is decorative: hidden from screen readers, so the link keeps its own name', () => {
    const { box } = renderInLink()
    expect(box).toHaveAttribute('aria-hidden', 'true')
    expect(box.querySelector('img')).toHaveAttribute('alt', '')
  })

  it('carries one badge on its cover, so it turns with the box: rank, ticket or match', () => {
    const badge = (b: Parameters<typeof VhsBox>[0]['badge']) => {
      const { container } = render(<VhsBox movie={film} badge={b} />)
      // After the poster and the genre sticker, on the front face.
      const front = container.querySelector('.vhs-front')
      const last = front?.lastElementChild
      return last?.hasAttribute('data-genre-sticker') ? null : last
    }
    expect(badge({ kind: 'rank', rank: 3 })).toHaveTextContent('#3')
    expect(badge({ kind: 'ticket' })).toHaveTextContent('Admit one')
    expect(badge({ kind: 'match', match: 92 })).toHaveTextContent('92%Match')
    expect(badge(undefined)).toBeNull()
  })

  it('prints the title on the spine and the cassette label, and the year on the spine', () => {
    const { box } = renderInLink()
    expect(box.querySelector('.vhs-spine-title')).toHaveTextContent('The Thing')
    expect(box.querySelector('.vhs-edge-label')).toHaveTextContent('The Thing')
    expect(box.querySelector('.vhs-spine-band')).toHaveTextContent('’82')
    expect(box.querySelector('[data-genre-sticker="horror"]')).toBeInTheDocument()
  })

  it('shows a placeholder and no year band text when TMDB has no poster or date', () => {
    const { box } = renderInLink({ ...film, poster_path: null, release_date: '' })
    expect(box.querySelector('img')).toBeNull()
    expect(box.querySelector('.bg-poster-placeholder-background')).toBeInTheDocument()
    expect(box.querySelector('.vhs-spine-band')).toBeEmptyDOMElement()
  })

  /** Lets the per-frame mouse animation run for `ms` (fake timers drive animation frames). */
  const runFrames = (ms: number) => act(() => vi.advanceTimersByTime(ms))

  it('eases into the hover pose toward where the mouse is, measured against the box', () => {
    vi.useFakeTimers()
    const { link, box } = renderInLink()
    box.getBoundingClientRect = () => ({ left: 100, top: 0, width: 200, height: 400 }) as DOMRect
    fireEvent.pointerEnter(link, { pointerType: 'mouse', clientX: 150, clientY: 300 })
    expect(link).toHaveAttribute('data-vhs-active')
    // It starts at rest and eases in, rather than snapping.
    expect(Number(link.style.getPropertyValue('--vhs-h'))).toBeLessThan(0.1)
    runFrames(2000)
    expect(link.style.getPropertyValue('--vhs-h')).toBe('1.000')
    expect(link.style.getPropertyValue('--vhs-px')).toBe('-0.500')
    expect(link.style.getPropertyValue('--vhs-py')).toBe('0.500')
    // Over the text below the box: held at the bottom edge (clamped to 1).
    fireEvent.pointerMove(link, { pointerType: 'mouse', clientX: 300, clientY: 900 })
    runFrames(2000)
    expect(link.style.getPropertyValue('--vhs-px')).toBe('1.000')
    expect(link.style.getPropertyValue('--vhs-py')).toBe('1.000')
    vi.useRealTimers()
  })

  it('eases back to rest on leaving, then hands the box back to the CSS', () => {
    vi.useFakeTimers()
    const { link, box } = renderInLink()
    box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 400 }) as DOMRect
    fireEvent.pointerEnter(link, { pointerType: 'mouse', clientX: 200, clientY: 200 })
    runFrames(2000)
    fireEvent.pointerLeave(link, { pointerType: 'mouse' })
    runFrames(100)
    // Still on its way back, and still raised above its neighbours.
    expect(link).toHaveAttribute('data-vhs-active')
    expect(Number(link.style.getPropertyValue('--vhs-h'))).toBeGreaterThan(0.2)
    runFrames(2000)
    expect(link).not.toHaveAttribute('data-vhs-active')
    vi.useRealTimers()
  })

  it('ignores touch and pen, which turn the box by scrolling instead', () => {
    const { link } = renderInLink()
    fireEvent.pointerEnter(link, { pointerType: 'touch', clientX: 10, clientY: 10 })
    expect(link).not.toHaveAttribute('data-vhs-active')
  })

  it('stays still under reduced motion', () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') })) as never
    const { link } = renderInLink()
    fireEvent.pointerEnter(link, { pointerType: 'mouse', clientX: 10, clientY: 10 })
    expect(link).not.toHaveAttribute('data-vhs-active')
    window.matchMedia = matchMedia
  })
})
