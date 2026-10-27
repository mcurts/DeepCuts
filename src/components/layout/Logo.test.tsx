// Tests for the logo: one accessible image named "Deep Cuts", or nothing for assistive tech when
// it's decorative (a link around it carries the name), in every seasonal costume; and the
// Halloween costume appears in October only; the tagline comes with any costume when asked for;
// and no costume uses a `style` attribute, which the CSP blocks in the pre-rendered HTML (ADR-0057).
import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Logo } from './Logo'

// Fixed dates, so the tests never depend on today's date.
const JULY = new Date(2026, 6, 4)
const OCTOBER = new Date(2026, 9, 13)

describe('Logo', () => {
  it.each([
    ['standard', JULY],
    ['Halloween', OCTOBER],
  ])('exposes a single accessible image named "Deep Cuts" (%s)', (_, date) => {
    render(<Logo date={date} />)
    expect(screen.getByRole('img', { name: 'Deep Cuts' })).toBeInTheDocument()
  })

  it.each([
    ['standard', JULY],
    ['Halloween', OCTOBER],
  ])('is hidden from assistive tech when decorative (%s)', (_, date) => {
    const { container } = render(<Logo decorative date={date} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('wears the Halloween costume from Oct 1 to Oct 31 only', () => {
    const costume = (date: Date) =>
      render(<Logo date={date} />).container.querySelector('svg.halloween-logo')
    expect(costume(new Date(2026, 9, 1, 0))).not.toBeNull()
    expect(costume(new Date(2026, 9, 31, 23, 59))).not.toBeNull()
    expect(costume(new Date(2026, 8, 30, 23, 59))).toBeNull()
    expect(costume(new Date(2026, 10, 1, 0))).toBeNull()
  })

  it('gives each Halloween logo its own filter and mask ids', () => {
    const { container } = render(
      <>
        <Logo date={OCTOBER} />
        <Logo date={OCTOBER} decorative />
      </>,
    )
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    for (const id of ids) expect(id).toMatch(/^[\w-]+$/)
  })

  it.each([
    ['standard', JULY],
    ['Halloween', OCTOBER],
  ])('shows the tagline under the artwork only when asked (%s)', (_, date) => {
    const { container, rerender } = render(<Logo date={date} />)
    expect(screen.queryByText('The B-sides of cinema')).toBeNull()
    rerender(<Logo date={date} tagline taglineClassName="hidden md:block" />)
    const tagline = screen.getByText('The B-sides of cinema')
    // Right after the artwork, so the costume's stylesheet can space and light it.
    expect(container.querySelector('svg')?.nextElementSibling).toBe(tagline)
    expect(tagline).toHaveClass('logo-tagline', 'hidden', 'md:block')
  })

  // The header's logo is in the pre-rendered landing page (ADR-0057), in whichever costume is in
  // season when the build runs, so every costume must work without inline styles.
  it.each([
    ['standard', JULY],
    ['Halloween', OCTOBER],
  ])('renders to HTML without style attributes (%s)', (_, date) => {
    expect(renderToString(<Logo date={date} tagline />)).not.toMatch(/\sstyle="/)
  })
})
