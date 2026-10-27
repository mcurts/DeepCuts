// The signed-out landing page at `/` (ADR-0034, ADR-0035, ADR-0040 §6a).
//
// The ticker, a one-column hero (label, the poster headline, the lede and two calls to action:
// "Get your ticket" to sign in, "See the program" down to the features), then "Tonight's
// program": the app's three ideas as three panels, in the same order as Home's shelves. Each has
// a small illustration and a line of copy. The sign-in page also offers the demo account for
// visitors without an invite (ADR-0025).
import { Link } from 'react-router'
import { TAGLINE } from '@/config/brand'
import { FeaturePanel } from './FeaturePanel'
import { PanelArt } from './PanelArt'
import { PANELS, type PanelId } from '@/config/panels'
import { PageHeading } from '@/components/ui/PageHeading'
import { Ticker } from '@/components/ui/Ticker'

// The ticker's lines (ADR-0040): one real sentence per feature, nothing invented.
const TICKER = [
  'Top Ten: rank the ten films you’d defend',
  'Watchlist: save a film the moment you hear about it',
  'Discovery: picks for your taste, with the reason why',
]

// What each feature promises. Plain and specific: only what the signed-in app really does.
const COPY: Record<PanelId, string> = {
  'top-ten': 'Rank the ten films you’d defend to anyone, in your order.',
  watchlist: 'Save a film the moment you hear about it. It waits for you on Home.',
  discovery:
    'Mark a few films “More like this” and get deep cuts picked for your taste, with the reason why.',
}

// The two calls to action share a size: at least 48px tall, in the display face.
const cta =
  'inline-flex min-h-12 items-center px-6 font-display text-xl tracking-widest case-display'

/** The landing page: ticker, hero, and the three-feature program. */
export function LandingPage() {
  return (
    <>
      <title>{`Deep Cuts · ${TAGLINE}`}</title>
      <Ticker items={TICKER} />
      <PageHeading
        size="poster"
        eyebrow="A Deep Cuts presentation —"
        title="Your movies,"
        highlight="close at hand"
        lede="Keep your all-time favourites, the films you want to see, and picks made for your taste, in one place."
      />
      <div className="-mt-2 mb-16 flex flex-wrap gap-4">
        {/* Signing in (or the demo account) is how you get in, so the ticket goes there. */}
        <Link
          to="/sign-in"
          state={{ from: '/' }}
          className={`${cta} rounded-button bg-button-cta-bg text-button-cta-fg shadow-button-cta hover:bg-button-cta-bg/90`}
        >
          Get your ticket
        </Link>
        <a
          href="#program"
          className={`${cta} border-2 border-button-secondary-border text-button-secondary-fg hover:border-accent hover:text-accent`}
        >
          See the program
        </a>
      </div>

      <section id="program" aria-labelledby="program-heading" className="scroll-mt-40">
        <div className="mb-6 flex items-end gap-6">
          <h2
            id="program-heading"
            className="font-display text-5xl leading-none tracking-wide case-display"
          >
            Tonight’s program
          </h2>
          <span aria-hidden="true" className="mb-3 hidden dashed-rule min-w-20 flex-1 sm:block" />
        </div>
        {/* Three columns while each can be 300px wide (from about 1000px), then two, then one. */}
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,--spacing(75)),1fr))] gap-5">
          {(Object.keys(COPY) as PanelId[]).map((id, i) => (
            <li key={id}>
              <FeaturePanel panel={PANELS[id]} feature={i + 1}>
                <PanelArt id={id} />
                <p className="mt-5 text-base text-fg-soft">{COPY[id]}</p>
              </FeaturePanel>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
