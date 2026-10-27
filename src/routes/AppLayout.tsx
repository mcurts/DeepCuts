// The app shell around Home, Search, My Lists and Account (ADR-0040): the header (logo, search and
// the account menu), the page, and the legal footer (SiteFooter). There is no tab bar: the logo
// goes Home and the account menu holds My Lists, at every width. (Detail and Sign in have their
// own layouts.) Signed out, the header is just the logo and Sign in: search leads only to
// signed-in pages (ADR-0034).
import { useRef } from 'react'
import { Link, Outlet } from 'react-router'
import { FEATURES } from '@/config/features'
import { TAGLINE } from '@/config/brand'
import { AccountChip } from '@/components/layout/AccountChip'
import { Icon } from '@/components/ui/Icon'
import { Logo } from '@/components/layout/Logo'
import { MovieSearch } from '@/components/movie/MovieSearch'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SkipLink } from '@/components/layout/SkipLink'
import { useHeaderHeight } from '@/hooks/useHeaderHeight'
import { useRouteFocus } from '@/hooks/useRouteFocus'
import { useSession } from '@/session/SessionContext'

/**
 * Shell (ADR-0021, ADR-0033, ADR-0040): a sticky header, the page in a 1200px column, and the
 * TMDB credit as the footer.
 */
export function AppLayout() {
  useRouteFocus()
  // Toasts appear just below this header (SonnerToaster.tsx).
  const header = useRef<HTMLElement>(null)
  useHeaderHeight(header)
  const signedIn = useSession().session.kind === 'account'
  return (
    // Full window width, so the header's bar and the ticker can span it; their contents and
    // <main> are centred within the 1200px column (`max-w-300`). A column, with <main> growing, so
    // the footer sits at the bottom of the window on short pages. The bottom padding keeps the
    // footer clear of the iPhone home bar.
    <div className="flex min-h-dvh w-full flex-col overflow-x-clip pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <SkipLink />
      {/* The header stays pinned to the top while the page scrolls.
          Below `lg`: two rows (logo + account, then a full-width search). From `lg`: one row with
          the search centred between logo and account. The DOM order (logo, search, account) is
          the desktop reading order; below `lg`, `order-last` moves the search to its own row, so
          keyboard focus goes logo → search → account there. */}
      <header ref={header} className="sticky top-0 z-20 border-b-2 border-border bg-surface">
        <div className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-x-3 gap-y-4 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 md:px-8 lg:flex-nowrap lg:gap-x-8 lg:py-5">
          {/* From `md`, nudged down 8px, so the wordmark itself lines up with the search field
              beside it (from `lg`) and the tagline hangs below (owner, 2026-10-15). A transform,
              so the header height doesn't change. The name includes the tagline the link shows
              (WCAG 2.5.3, Label in Name), so a voice control user can say what they see. */}
          <Link
            to="/"
            aria-label={`Deep Cuts, ${TAGLINE}, go to Home`}
            className="inline-flex min-h-11 shrink-0 flex-col items-start justify-center gap-1 md:translate-y-2"
          >
            {/* The tagline shows from `md` only: phones keep their header height (owner,
                2026-10-15). */}
            <Logo
              decorative
              tagline
              taglineClassName="hidden md:block"
              className="h-9 w-auto md:h-10"
            />
          </Link>
          {/* Grows to fill the row up to a readable width; the auto margins then centre it.
            `min-w-0` lets it shrink below the input's built-in width (else it overflows at 320px). */}
          {signedIn && (
            <div className="order-last min-w-0 basis-full lg:order-none lg:mx-auto lg:max-w-lg lg:flex-1 lg:basis-auto">
              <MovieSearch />
            </div>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {/* "Tune my picks" onboarding is hidden behind a feature flag for now. */}
            {FEATURES.onboarding && signedIn && (
              <Link
                to="/tune"
                aria-label="Tune my picks"
                title="Tune my picks"
                className="grid size-11 place-items-center border-2 border-border-control text-accent hover:border-accent"
              >
                <Icon name="heart" />
              </Link>
            )}
            <AccountChip />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-300 flex-1 px-5 pt-5 pb-3 md:px-8 md:pt-6">
        {/* The current page renders here. */}
        <Outlet />
      </main>

      <SiteFooter className="mx-auto mt-10 w-full max-w-300 px-5 md:px-8" />
    </div>
  )
}
