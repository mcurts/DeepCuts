// "Tune my picks" (/tune): optional onboarding in two steps (a favorite film → rate a few
// films). It doesn't ask for favourite genres, so taste comes
// only from tagged films. Hidden behind the `onboarding` feature flag until the flow is reworked.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { movieQueries } from '@/api/queries'
import { imageUrl, type MovieSummary } from '@/api/tmdb'
import { Logo } from '@/components/layout/Logo'
import { MovieSearch } from '@/components/movie/MovieSearch'
import { useHeaderHeight } from '@/hooks/useHeaderHeight'
import { useRouteFocus } from '@/hooks/useRouteFocus'
import { AccountChip } from '@/components/layout/AccountChip'
import { SkipLink } from '@/components/layout/SkipLink'
import { FavoriteStep } from './FavoriteStep'
import { RateStep } from './RateStep'
import { useTuneState } from './useTuneState'

/** "Tune my picks": optional two-step onboarding outside the tab-bar shell. */
export function TunePage() {
  useRouteFocus()
  const [state, update] = useTuneState()
  // Toasts (e.g. a tag that didn't save) appear just below this header (SonnerToaster.tsx).
  const header = useRef<HTMLElement>(null)
  useHeaderHeight(header)
  // The backdrop of the top popular film, as a moody background.
  const background = useQuery(movieQueries.discover()).data?.results[0]
  const image = imageUrl(background?.backdrop_path ?? null, 'w1280')

  // Each step change moves focus to its heading, instead of a page-wide live region.
  const main = useRef<HTMLElement>(null)
  const firstStep = useRef(true)
  useEffect(() => {
    // Not on first arrival: useRouteFocus already handles that.
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    const h1 = main.current?.querySelector('h1')
    if (h1) {
      h1.tabIndex = -1
      h1.focus()
    }
  }, [state.step])

  return (
    <div className="relative mx-auto min-h-svh w-full max-w-360 overflow-x-clip">
      <title>Tune my picks · Deep Cuts</title>
      <SkipLink />
      {image && (
        <img
          src={image}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-80 saturate-75"
        />
      )}
      {/* Darkens the background so text stays readable; step 2 blurs it more heavily. */}
      <div
        className={`absolute inset-0 ${
          state.step === 2
            ? 'bg-background/80 backdrop-blur-sm'
            : 'bg-linear-to-b from-background/10 via-background/70 via-55% to-background to-90% md:bg-radial md:from-background/50 md:via-background/80 md:to-background'
        }`}
      />
      <header
        ref={header}
        className="relative z-10 flex min-h-16 items-center justify-between gap-2.5 px-5 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2 md:px-8"
      >
        <Link
          to="/"
          aria-label="Deep Cuts, go to Home"
          className="inline-flex min-h-11 items-center"
        >
          <Logo decorative className="h-9 w-auto" />
        </Link>
        <AccountChip />
      </header>
      <div className="relative z-10 mx-5 mt-1 md:mx-auto md:w-full md:max-w-xl">
        {/* Picking a film in search here also sets it as the favorite for step 1. */}
        <MovieSearch onPick={(m: MovieSummary) => update({ favorite: m.id }, true)} />
      </div>

      <main
        id="main"
        ref={main}
        className={`relative z-2 flex min-h-[calc(100svh-8rem)] flex-col justify-end px-5 pt-16 pb-5 md:mx-auto md:justify-center md:px-10 md:py-6 ${
          state.step === 2 ? 'md:w-full' : 'md:w-full md:max-w-2xl'
        }`}
      >
        <p className="mb-3 text-sm font-bold tracking-wide text-content-muted">
          Step {state.step} of 2
        </p>
        {/* Only the current step renders. */}
        {state.step === 1 && <FavoriteStep state={state} update={update} />}
        {state.step === 2 && <RateStep state={state} update={update} />}
      </main>
    </div>
  )
}
