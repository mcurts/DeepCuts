// The page textures (ADR-0040): faint scratches behind every page and film grain over it, as strong
// as the theme sets (ADR-0056, index.css). Used once around the whole app (main.tsx) and around
// the pre-rendered landing page (prerender.tsx, ADR-0057), so the two render the same markup and
// the app can replace the pre-rendered HTML without a visible change.
import type { ReactNode } from 'react'

/**
 * Wraps the app in its textures. Both are decoration only: hidden from assistive tech, pinned to
 * the window, and they let every click through.
 */
export function FilmTextures({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 film-scratch" />
      {children}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-60 film-grain" />
    </>
  )
}
