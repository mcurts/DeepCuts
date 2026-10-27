// My Lists (/lists): the films on each of the three tag lists (ADR-0050).
//
// Four tiles pick the list (`?tag=`, so it's linkable); the page accent switches to that tag's
// color (ADR-0020). Each film loads its details from TMDB, cached for a day. The films are VHS
// boxes on the same shelf grid as Home, at every width (ADR-0040 §6, §11). The watchlist is in the
// person's own order, and with two or more films it has a reorder mode (ADR-0041).
import { useQueries, useQuery } from '@tanstack/react-query'
import { lazy, Suspense, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router'
import { z } from 'zod'
import { movieQueries } from '@/api/queries'
import { creditsOf, summaryOf } from '@/api/tmdb'
import { CassetteCard } from '@/components/movie/CassetteCard'
import { CassetteSkeleton, CassetteSkeletonRow } from '@/components/movie/CassetteSkeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { PageHeading } from '@/components/ui/PageHeading'
import { ReorderStatus, ReorderToggle } from '@/components/ui/ReorderToggle'
import { SHELF_GRID } from '@/components/movie/ShelfSection'
import { tagColor, TAGS } from '@/components/movie/tagDisplay'
import { useReorderMode } from '@/hooks/useReorderMode'
import { SYSTEM_TAGS, type SystemTag } from '@/domain/tagRules'
import { useReorderWatchlist, useTagQueries } from '@/session/tagQueries'

// Reorder mode's tiles and drag and drop load the first time someone presses "Reorder".
const ReorderList = lazy(() =>
  import('@/components/movie/ReorderList').then((m) => ({ default: m.ReorderList })),
)

// ?tag= is untrusted; anything unknown falls back to Want to see (ADR-0014). That includes an old
// bookmark of the retired Seen list (`?tag=seen`, ADR-0050).
const paramsSchema = z.object({ tag: z.enum(SYSTEM_TAGS).catch('watchlist').default('watchlist') })

// Literal class names so Tailwind generates them (ADR-0020 page accent).
const PAGE_ACCENT: Record<SystemTag, string> = {
  watchlist: 'page-accent-watchlist',
  liked: 'page-accent-liked',
  disliked: 'page-accent-disliked',
}

/** The My Lists page. */
export function ListsPage() {
  const [params] = useSearchParams()
  const { tag } = paramsSchema.parse(Object.fromEntries(params))
  const queries = useTagQueries()
  // All three lists load at once, for the counts on the tiles.
  const counts = useQueries({ queries: TAGS.map((t) => queries.list(t.tag)) })
  const current = counts[SYSTEM_TAGS.indexOf(tag)]
  const ids = current?.data ?? []
  const label = TAGS.find((t) => t.tag === tag)?.label ?? ''

  return (
    <div className={PAGE_ACCENT[tag]}>
      <title>{`My Lists: ${label} · Deep Cuts`}</title>
      <PageHeading
        eyebrow="Your corner"
        title="My Lists"
        lede="Everything you’ve tagged, in one place."
      />

      {/* The four list tiles. The current one is marked with aria-current and its tag color. */}
      <nav aria-label="Lists" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {TAGS.map((t, i) => {
          const n = counts[i]?.data?.length ?? 0
          const active = t.tag === tag
          return (
            <Link
              key={t.tag}
              to={`?tag=${t.tag}`}
              aria-current={active ? 'true' : undefined}
              style={tagColor(t.tag) as CSSProperties}
              className={`flex min-h-27 flex-col items-start border p-3 md:min-h-34 ${
                active
                  ? 'border-(--tag) bg-(--tag)/10'
                  : 'rounded-card border-card-border bg-card-bg hover:border-border-control'
              }`}
            >
              <Icon name={t.icon} className="mb-auto size-5 text-(--tag)" />
              <strong className="mt-3 text-sm font-bold">{t.label}</strong>
              <span className="mt-0.5 text-sm text-fg-muted">
                {n} {n === 1 ? 'film' : 'films'}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Keyed by list, so switching lists always leaves reorder mode. */}
      <FilmList key={tag} tag={tag} label={label} ids={ids} loading={!!current?.isPending} />
    </div>
  )
}

/**
 * The films on one list, under a bar saying which list and how many. The watchlist is an ordered
 * list in the person's order, with the reorder toggle (two or more films, ADR-0041); the other
 * lists are newest first. While the list itself loads (`loading`), a row of placeholders stands in
 * for it, rather than the empty message, so the page doesn't jump when the films arrive.
 */
function FilmList({
  tag,
  label,
  ids,
  loading,
}: {
  tag: SystemTag
  label: string
  ids: number[]
  loading: boolean
}) {
  const ordered = tag === 'watchlist'
  const { active, toggle, message, announce, toggleRef, scopeRef } = useReorderMode(
    ordered && ids.length >= 2,
    'your watchlist',
  )
  const reorderWatchlist = useReorderWatchlist()
  // The watchlist's order is the person's, so it's an ordered list; the others are just sets.
  const List = ordered ? 'ol' : 'ul'

  return (
    // An unlabelled <section> (so not a landmark): the area within which Escape leaves reorder mode.
    <section ref={scopeRef}>
      {/* Wraps below the heading on narrow screens when the toggle is there. */}
      <div className="mt-4.5 mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border pb-2 text-sm text-fg-muted">
        <h2>
          Filtered by <strong className="text-contextual">{label}</strong>
        </h2>
        {/* As tall as the Reorder button (44px), so the row keeps its height when it appears. */}
        <div className="flex min-h-11 items-center gap-4">
          {/* No count until the list is in: "0 results" would be announced, then corrected. */}
          <span role="status">
            {!loading && `${ids.length} ${ids.length === 1 ? 'result' : 'results'}`}
          </span>
          {ordered && ids.length >= 2 && (
            <ReorderToggle ref={toggleRef} active={active} onPress={toggle} />
          )}
        </div>
      </div>
      {ordered && <ReorderStatus message={message} />}

      {loading ? (
        <CassetteSkeletonRow />
      ) : active ? (
        // Until reorder mode's code arrives (once, a moment), the list stays as it was.
        <Suspense fallback={<Films ids={ids} as={List} />}>
          <ReorderList ids={ids} announce={announce} onReorder={reorderWatchlist.mutate} />
        </Suspense>
      ) : ids.length > 0 ? (
        <Films ids={ids} as={List} />
      ) : (
        <EmptyState>
          Films you tag “{label}” will appear here. Use the search above, or open any film and tap{' '}
          {label}.
        </EmptyState>
      )}
    </section>
  )
}

/** The films as linked VHS boxes on the shelf grid. */
function Films({ ids, as: List }: { ids: number[]; as: 'ol' | 'ul' }) {
  return (
    <List className={SHELF_GRID}>
      {ids.map((id, i) => (
        <ListCassette key={id} id={id} stagger={i} />
      ))}
    </List>
  )
}

// One film on the list as a VHS box, with its director and writer. Shows a box-shaped
// placeholder, caption room included, until its details arrive, so the grid doesn't jump.
// `stagger`: its place on the list, so tiles that arrive together ripple in.
function ListCassette({ id, stagger }: { id: number; stagger: number }) {
  const { data: m } = useQuery(movieQueries.detail(id))
  if (!m) {
    return (
      <li aria-hidden="true" className="flex">
        <CassetteSkeleton />
      </li>
    )
  }
  return (
    <li className="flex">
      <CassetteCard item={{ movie: summaryOf(m), credits: creditsOf(m) }} stagger={stagger} />
    </li>
  )
}
