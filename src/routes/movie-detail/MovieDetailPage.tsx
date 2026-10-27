// The Detail page (/movie/:id): one film's details, your tags for it, and where to watch it.
//
// Information only (ADR-0018): no ratings or reviews of our own. It has its own full-bleed
// layout, with the film's backdrop behind the page.
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from 'react-aria-components'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { movieQueries } from '@/api/queries'
import { certification, formatRuntime, imageUrl, providersFor, releaseYear } from '@/api/tmdb'
import { Icon } from '@/components/ui/Icon'
import { LoadingImage } from '@/components/ui/LoadingImage'
import { HOME } from '@/config/features'
import { Logo } from '@/components/layout/Logo'
import { MovieSearch } from '@/components/movie/MovieSearch'
import { SkipLink } from '@/components/layout/SkipLink'
import { DetailTags } from './DetailTags'
import { DetailTopTen } from './DetailTopTen'
import { SiteFooter } from '@/components/layout/SiteFooter'
import './MovieDetailPage.css'

// The :id in the URL is untrusted: it must be a positive whole number of sensible size.
const idSchema = z.coerce.number().int().positive().max(99_999_999)
// Ratings and streaming services are shown for one country for now.
const REGION = 'US'

// CSS stores the shared motion token as a duration, which can be expressed in ms or seconds.
function milliseconds(value: string) {
  const amount = Number.parseFloat(value)
  if (!Number.isFinite(amount)) return 400
  return value.trim().endsWith('ms') ? amount : amount * 1000
}

/** Length-aware title scale from design v2 (55 and 95 character thresholds). */
function titleSize(title: string) {
  if (title.length > 95) return 'text-3xl md:text-5xl leading-tight'
  if (title.length > 55) return 'text-4xl md:text-6xl leading-none'
  return 'text-5xl md:text-7xl leading-none'
}

/** The Detail page: shows the film, or "not found" for a malformed id. */
export function MovieDetailPage() {
  const parsed = idSchema.safeParse(useParams().id)
  const { closing, dismiss } = useDetailDismiss()
  return (
    <DetailLayout closing={closing} onDismiss={dismiss}>
      {parsed.success ? <MovieDetail id={parsed.data} onDismiss={dismiss} /> : <NotFound />}
    </DetailLayout>
  )
}

/**
 * Fades Detail away before changing routes. The same `motion.enter` token controls both
 * directions, so an enter and dismiss always feel like one interaction. The small JavaScript
 * fallback exists because CSS animation events are not guaranteed (for example in test DOMs).
 */
function useDetailDismiss() {
  const navigate = useNavigate()
  const location = useLocation()
  const [closing, setClosing] = useState(false)
  const timeout = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timeout.current !== null) window.clearTimeout(timeout.current)
    },
    [],
  )

  const dismiss = useCallback(
    (destination?: string) => {
      // Ignore every later close request while the first one is playing out.
      if (closing) return
      setClosing(true)

      // The global reduced-motion rule makes the CSS animation effectively instant; navigation
      // must do the same instead of leaving people waiting for an invisible 400ms animation.
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      const page = document.querySelector<HTMLElement>('.detail-page')
      const duration = reduced
        ? 0
        : milliseconds(page ? getComputedStyle(page).animationDuration : '')
      timeout.current = window.setTimeout(() => {
        // A direct visit has no useful history entry. Other Detail visits return to their source.
        if (destination) navigate(destination)
        else if (location.key === 'default') navigate(HOME.path)
        else navigate(-1)
      }, duration)
    },
    [closing, location.key, navigate],
  )

  useEffect(() => {
    // Detail can be opened by pointer, keyboard or a direct URL. A document listener means Escape
    // works in all three cases, even before focus moves inside the freshly opened route. Controls
    // that use Escape first (such as the movie-search list) prevent default and keep precedence.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) dismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [dismiss])

  return {
    closing,
    dismiss,
  }
}

// Detail opens above the app shell (design v2): back, logo and search float on top.
function DetailLayout({
  children,
  closing,
  onDismiss,
}: {
  children: ReactNode
  closing: boolean
  onDismiss: (destination?: string) => void
}) {
  const layoutRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Detail is an overlay-like route. Its Back control is the first meaningful action, so it
    // receives focus rather than letting the page-heading route helper steal it after data loads.
    backRef.current?.focus()
  }, [])

  useEffect(() => {
    const trapTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const layout = layoutRef.current
      if (!layout?.contains(document.activeElement)) return
      // Query only keyboard-reachable controls inside this route. The selector deliberately omits
      // tabindex=-1 headings and decorative content, while preserving the visible Skip link.
      const focusable = [
        ...layout.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hasAttribute('inert'))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trapTab)
    return () => document.removeEventListener('keydown', trapTab)
  }, [])

  return (
    // Once the fade begins this route is no longer actionable; the destination will receive
    // focus through its normal route-focus handling after the animation completes.
    <div
      ref={layoutRef}
      className="detail-page relative mx-auto min-h-svh w-full max-w-360 overflow-x-clip"
      data-closing={closing || undefined}
      inert={closing}
    >
      <SkipLink />
      <Button
        ref={backRef}
        onPress={() => onDismiss()}
        aria-label="Back to previous screen"
        className="absolute top-[max(1.125rem,env(safe-area-inset-top))] left-5 z-10 grid size-12 place-items-center border-2 border-border-emphasis bg-surface-raised hover:border-accent hover:text-accent md:fixed"
      >
        <Icon name="back" className="size-6" />
      </Button>
      <Button
        onPress={() => onDismiss(HOME.path)}
        aria-label="Deep Cuts, go to Home"
        className="absolute top-[max(1.5rem,env(safe-area-inset-top))] right-5 z-10 inline-flex min-h-11 items-center md:fixed md:right-8"
      >
        <Logo decorative align="end" className="h-9 w-auto" />
      </Button>
      <div className="absolute top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] right-5 left-5 z-10 md:fixed md:top-[max(1.125rem,env(safe-area-inset-top))] md:right-auto md:left-1/2 md:w-full md:max-w-lg md:-translate-x-1/2">
        <MovieSearch />
      </div>
      <main id="main">{children}</main>
      {/* Above the backdrop, which is fixed behind the page from `md`, and in the details'
          column there, so it sits on the solid side of the fade. */}
      <SiteFooter className="relative z-1 mt-10 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:ml-auto md:max-w-xl md:pr-13 md:pl-6" />
    </div>
  )
}

// The film itself, once its id is known to be valid.
function MovieDetail({ id, onDismiss }: { id: number; onDismiss: () => void }) {
  const movie = useQuery(movieQueries.detail(id))
  const providers = useQuery(movieQueries.providers(id))

  if (movie.isPending)
    return (
      <p role="status" className="px-5 pt-40">
        Loading film…
      </p>
    )
  if (movie.isError) return <NotFound />

  const m = movie.data
  const backdrop = imageUrl(m.backdrop_path, 'w1280')
  const rating = certification(m, REGION)
  // "1982 · 1h 49m · Horror, Science Fiction" (empty parts are skipped).
  const meta = [
    releaseYear(m.release_date),
    formatRuntime(m.runtime),
    m.genres.map((g) => g.name).join(', '),
  ].filter(Boolean)
  const watch = providers.data ? providersFor(providers.data, REGION) : []

  return (
    <article className="relative min-h-svh">
      <title>{`${m.title} · Deep Cuts`}</title>
      {/* The backdrop spans the full width at its own 16:9 shape (TMDB backdrops are 16:9), so
          no screen shape crops its sides. On phones it sits at the top and fades into the page.
          From md the layer is fixed behind the page: the image sits at the top and fades out at
          its foot, and an overlay darkens the right side where the text sits. Scrims keep text
          readable over any image (ADR-0009). */}
      <div className="relative w-full md:fixed md:inset-0">
        <div className="relative aspect-video w-full">
          {backdrop && <LoadingImage src={backdrop} alt="" className="size-full object-cover" />}
          {/* On screens taller than 16:9 the image ends above the bottom, so blend its edge. */}
          <div className="absolute inset-0 hidden bg-linear-to-b from-transparent from-60% to-surface md:block" />
        </div>
        <div className="absolute inset-0 bg-linear-to-b from-surface/70 via-transparent via-35% to-surface md:hidden" />
        <div className="absolute inset-0 hidden bg-linear-to-r from-transparent from-25% via-surface/85 via-55% to-surface to-75% md:block" />
        <div className="absolute inset-0 hidden bg-linear-to-b from-surface/60 via-transparent via-20% md:block" />
      </div>

      <div className="relative z-1 -mt-12 flex flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:mt-0 md:ml-auto md:min-h-svh md:w-full md:max-w-xl md:justify-center md:pt-24 md:pr-13 md:pb-10 md:pl-6">
        {/* Top Ten (ADR-0036): a sticker in the top-left corner of the details, set apart from
            the tags below. Pressing it saves at once; it then becomes a short notice. */}
        <DetailTopTen movieId={m.id} title={m.title} className="mb-4" />
        <h1
          className={`font-display tracking-wide text-balance wrap-anywhere case-display ${titleSize(m.title)}`}
        >
          {m.title}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
          <span>{meta.join(' · ')}</span>
          {rating && (
            <span
              className="border-2 border-border-control px-1.5 py-0.5"
              aria-label={`Rated ${rating}`}
            >
              {rating}
            </span>
          )}
        </p>
        {/* Synopses are the one long text in the typewriter face, so the line stays under ~65
            characters (owner, 2026-10-13). */}
        {m.overview && (
          <p className="my-3.5 max-w-prose leading-relaxed text-fg-soft">{m.overview}</p>
        )}

        {/* The three tag toggles, with Save and Cancel once anything changes (ADR-0050 rule). */}
        <DetailTags movieId={m.id} title={m.title} onDismiss={onDismiss} />

        {/* A clear break between your tags and the streaming info (owner, 2026-10-07). */}
        <section aria-labelledby="where-to-watch" className="mt-12">
          <h2 id="where-to-watch" className="mb-2.5 font-label text-sm tracking-widest text-accent">
            Where to watch ({REGION})
          </h2>
          {/* Service logos (with the name as alt text), or a short message. The message is as
              tall as a row of logos (32px): from `md` the details column is centred in the
              window, so a few pixels' growth here would nudge the whole column, title and all. */}
          {watch.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-3.5">
              {watch.map((p) => {
                const logo = imageUrl(p.logo_path, 'w92')
                return (
                  <li key={p.provider_id} title={p.provider_name}>
                    {logo ? (
                      <img src={logo} alt={p.provider_name} width={32} height={32} />
                    ) : (
                      <span className="text-sm">{p.provider_name}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="flex min-h-8 items-center text-sm text-fg-muted">
              {providers.isPending
                ? 'Checking providers…'
                : 'Not streaming in your region right now.'}
            </p>
          )}
          {/* Attribution required for JustWatch data. */}
          <p className="mt-3 text-xs text-fg-muted">Streaming availability data from JustWatch.</p>
        </section>
      </div>
    </article>
  )
}

// Shown for an unknown or malformed film id.
function NotFound() {
  return (
    <div className="px-5 pt-40">
      <title>Film not found · Deep Cuts</title>
      <h1 className="font-display text-5xl case-display">Film not found</h1>
      <p className="mt-2 text-fg-muted">
        We couldn’t find that film.{' '}
        <Link to={HOME.path} className="text-accent underline">
          Go to {HOME.label}
        </Link>
      </p>
    </div>
  )
}
