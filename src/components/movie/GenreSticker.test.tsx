// Tests for the VHS genre sticker: it shows the first known genre's short label, stays hidden from
// screen readers, is 54px at the same −10° slant on every film, gives each film its
// own wear filter, and renders nothing without a known genre. Its shadow falls downward, a little
// differently for each genre.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GenreSticker } from './GenreSticker'
import { stickerShadow } from './stickerShadow'

const sticker = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-genre-sticker]')

describe('GenreSticker', () => {
  it('prints the first known genre’s short label and is hidden from screen readers', () => {
    const { container } = render(<GenreSticker genreIds={[999, 878, 27]} seed={1091} />)
    const el = sticker(container)
    expect(el).toHaveAttribute('data-genre-sticker', 'science-fiction')
    expect(el).toHaveTextContent('Sci-Fi')
    expect(el).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders nothing when no genre is known', () => {
    const { container } = render(<GenreSticker genreIds={[999]} seed={1} />)
    expect(sticker(container)).toBeNull()
  })

  it('is 54px, at the same −10° slant for every film', () => {
    const a = sticker(render(<GenreSticker genreIds={[27]} seed={1091} />).container)
    const b = sticker(render(<GenreSticker genreIds={[27]} seed={348} />).container)
    expect(a?.style.width).toBe('54px')
    expect(a?.style.rotate).toBe('-10deg')
    expect(b?.style.rotate).toBe('-10deg')
  })

  it('gives each sticker its own wear filter, seeded by the film', () => {
    const { container } = render(
      <>
        <GenreSticker genreIds={[27]} seed={1091} />
        <GenreSticker genreIds={[27]} seed={348} />
      </>,
    )
    const filters = [...container.querySelectorAll('filter')]
    expect(new Set(filters.map((f) => f.id)).size).toBe(2)
    expect(filters.map((f) => f.querySelector('feTurbulence')?.getAttribute('seed'))).toEqual([
      '91',
      '48',
    ])
  })

  it('casts a soft shadow that always falls downward, placed a little differently per genre', () => {
    const slugs = ['action', 'comedy', 'drama', 'horror', 'mystery', 'science-fiction', 'western']
    const offsets = slugs.map((slug) => {
      const [x = 0, y = 0] = stickerShadow(slug).split(' ').map(parseFloat)
      return { x, y }
    })
    for (const { x, y } of offsets) {
      expect(y).toBeGreaterThanOrEqual(1)
      expect(Math.abs(x)).toBeLessThanOrEqual(1.5)
    }
    // Not one shadow for all: several different placements across genres.
    expect(new Set(offsets.map(({ x, y }) => `${x},${y}`)).size).toBeGreaterThan(3)
    // Stable: the same genre always gets the same shadow.
    expect(stickerShadow('horror')).toBe(stickerShadow('horror'))
  })
})
