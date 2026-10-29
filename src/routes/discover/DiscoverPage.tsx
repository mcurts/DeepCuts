// Home (/), signed in: the app's three ideas as three full-width shelves, stacked in the order
// Top Ten, Watchlist, Discovery (ADR-0033, ADR-0040 §6b).
//
// Each shelf is a row of VHS boxes that wraps as its list grows: the whole Top Ten (ADR-0036)
// with each box's rank on a tab and the next open slot, the first watchlist films, and
// Discovery's picks. With likes, the picks come from the recommendation scorer (ADR-0026) with a
// match stamp and the reason why (PickReason). Without likes, they are a starter shelf of acclaimed,
// lesser-known older films (ADR-0042, minus any you've tagged), with a hint to like a few films. Each pick has quick actions under it (issue #76):
// Want to see, Like, Not for me (ADR-0050), saved at once with Undo. On tuned picks a press is also saved
// with the pick's scores, for the weights lab to learn from (ADR-0045). Every box names the film's director
// and writer, from its details (the same cached call Detail makes). The Top Ten shelf has a reorder mode (ADR-0041).
//
// Loading holds still (no jumps): every film that's still loading has a box-shaped placeholder in
// its own place (CassetteSkeleton), a list that's still loading shows one row of them, and each
// tile rises in as its film arrives (CassetteCard).
import { useQueries, useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useRef, useState } from 'react'
import { Link } from 'react-router'
import { movieQueries } from '@/api/queries'
import { creditsOf, summaryOf } from '@/api/tmdb'
import { FEATURES } from '@/config/features'
import type { FeedbackEntry } from '@/domain/learnWeights'
import { SCORER_VERSION } from '@/domain/scorer'
import { TOP_TEN_SIZE } from '@/domain/topTen'
import { CassetteCard, type CassetteItem } from '@/components/movie/CassetteCard'
import { CassetteSkeleton, CassetteSkeletonRow } from '@/components/movie/CassetteSkeleton'
import { EmptySlot } from '@/components/movie/EmptySlot'
import { focusHeaderSearch } from './headerSearch'
import { Icon } from '@/components/ui/Icon'
import { PageHeading } from '@/components/ui/PageHeading'
import { ReorderStatus, ReorderToggle } from '@/components/ui/ReorderToggle'
import { useReorderMode } from '@/hooks/useReorderMode'
import { PANELS } from '@/config/panels'
import { PickActions } from './PickActions'
import { PickReason } from './PickReason'
import { quickAction, type QuickAction } from '@/components/movie/quickActions'
import { SHELF_GRID, ShelfSection } from '@/components/movie/ShelfSection'
import { Ticker } from '@/components/ui/Ticker'
import { notify, notifyWithUndo, TAG_ERROR } from '@/notify'
import { useQuickTag, useTagQueries } from '@/session/tagQueries'
import { useReorderTopTen, useTopTen } from '@/session/topTenQueries'
import { useFeedbackLog } from '@/session/useFeedbackLog'
import { HOME_PICKS, LIMITS, useRecommendations } from '@/session/useRecommendations'

// Reorder mode's tiles and drag and drop load the first time someone presses "Reorder".
const ReorderList = lazy(() =>
  import('@/components/movie/ReorderList').then((m) => ({ default: m.ReorderList })),
)

// How many watchlist films Home shows: the first ones in the person's order (newest first until
// they reorder, ADR-0041), the same ones the scorer already loads, so the shelf costs no extra
// calls. My Lists has them all.
const WATCHLIST_PREVIEW = LIMITS.watchlist

/** Home: the headline, then the three shelves (ADR-0033, ADR-0040). */
export function HomePage() {
  // Discovery's picks are worked out once here and shared by the ticker and the shelf, so the
  // scorer runs once. The two lists are cached queries, so reading them twice costs nothing.
  const discovery = useDiscoveryPicks()
  const topTenQuery = useTopTen()
  const topTen = topTenQuery.data ?? []
  const watchlistQuery = useQuery(useTagQueries().list('watchlist'))
  const watchlist = watchlistQuery.data ?? []
  return (
    <>
      <title>Home · Deep Cuts</title>
      {/* Its first facts come from the two lists: keep its room until they're in. */}
      <Ticker
        items={tickerItems(topTen.length, watchlist.length, discovery)}
        loading={topTenQuery.isPending || watchlistQuery.isPending}
      />
      <PageHeading
        size="hero"
        title="Your movies,"
        highlight="close at hand"
        lede="The films you love, want to see, and a few worth going deeper for."
      />
      <TopTenShelf ids={topTen} loading={topTenQuery.isPending} />
      <WatchlistShelf ids={watchlist} loading={watchlistQuery.isPending} />
      <DiscoveryShelf discovery={discovery} />
    </>
  )
}

/**
 * The person's Top Ten (ADR-0036), all of it, in their order: #1 first, then the next open slot
 * until all ten are ranked. Films are added and removed from their Detail page. With two or more
 * films, "Reorder" switches the shelf to reorder mode (ADR-0041) until "Done".
 * @param loading - The list itself is still loading: show a row of placeholders.
 */
function TopTenShelf({ ids, loading }: { ids: readonly number[]; loading: boolean }) {
  // A single film has nowhere to move (and a list can shrink in another tab mid-reorder).
  const { active, toggle, message, announce, toggleRef, scopeRef } = useReorderMode(
    ids.length >= 2,
    'your Top Ten',
  )
  const reorderTopTen = useReorderTopTen()

  // One details call per film (cached for a day and shared with Detail). Each film holds its
  // place with a placeholder until it has loaded; the rank comes from the list, so it stays right
  // even if one film is slow. A film whose details failed leaves the shelf, as before.
  const details = useQueries({ queries: ids.map((id) => movieQueries.detail(id)) })
  const films = ids.flatMap((id, i): FilmSlot[] => {
    const query = details[i]
    const movie = query?.data
    if (movie)
      return [{ id, item: { movie: summaryOf(movie), credits: creditsOf(movie), rank: i + 1 } }]
    return query?.isPending ? [{ id }] : []
  })

  return (
    <ShelfSection
      id="top-ten"
      feature={1}
      title={PANELS['top-ten'].title}
      // The star the Top Ten wears on Detail, in its color (ADR-0035).
      icon={<Icon name="star" className="size-10 shrink-0 text-favourite" />}
      // No "3 of 10 ranked" count (owner, 2026-10-13): the dashed rule runs to the edge instead.
      ref={scopeRef}
      meta={ids.length >= 2 && <ReorderToggle ref={toggleRef} active={active} onPress={toggle} />}
    >
      <ReorderStatus message={message} />
      {loading ? (
        <CassetteSkeletonRow />
      ) : active ? (
        // Until reorder mode's code arrives (once, a moment), the shelf stays as it was.
        <Suspense fallback={<RankedList films={films} />}>
          <ReorderList ids={ids} announce={announce} onReorder={reorderTopTen.mutate} />
        </Suspense>
      ) : (
        <RankedList
          films={films}
          openSlot={ids.length < TOP_TEN_SIZE ? ids.length + 1 : undefined}
        />
      )}
    </ShelfSection>
  )
}

/** One film's place on a shelf: its tile once its details have loaded (`item`), until then a
 * placeholder. */
interface FilmSlot {
  id: number
  item?: CassetteItem
}

/** A film's tile, or its placeholder while it loads. `stagger`: its place in the row. */
function SlotTile({ slot, stagger }: { slot: FilmSlot; stagger: number }) {
  return slot.item ? <CassetteCard item={slot.item} stagger={stagger} /> : <CassetteSkeleton />
}

/**
 * The Top Ten as linked tiles, then the next open slot (`openSlot`, its rank) when there's room.
 * An ordered list: the order is the meaning, and screen readers announce it. The open slot is
 * the list's next place, so it's an item too.
 */
function RankedList({ films, openSlot }: { films: FilmSlot[]; openSlot?: number | undefined }) {
  return (
    <ol className={SHELF_GRID}>
      {films.map((slot, i) => (
        <li key={slot.id} className="flex">
          <SlotTile slot={slot} stagger={i} />
        </li>
      ))}
      {openSlot !== undefined && (
        <li>
          <EmptySlot
            mark={`#${openSlot}`}
            title="Add a film"
            note="Slot still open. Find a film, then add it from its page."
            onPress={focusHeaderSearch}
          />
        </li>
      )}
    </ol>
  )
}

/**
 * The first films on the watchlist; My Lists has them all.
 * @param loading - The list itself is still loading: show a row of placeholders.
 */
function WatchlistShelf({ ids, loading }: { ids: readonly number[]; loading: boolean }) {
  // Like the Top Ten: a placeholder in each film's place until it loads; failed films leave.
  const shown = ids.slice(0, WATCHLIST_PREVIEW)
  const details = useQueries({ queries: shown.map((id) => movieQueries.detail(id)) })
  const films = shown.flatMap((id, i): FilmSlot[] => {
    const query = details[i]
    const movie = query?.data
    if (movie)
      return [{ id, item: { movie: summaryOf(movie), credits: creditsOf(movie) } }]
    return query?.isPending ? [{ id }] : []
  })

  return (
    <ShelfSection
      id="watchlist"
      feature={2}
      title={PANELS.watchlist.title}
      to="/lists?tag=watchlist"
      // The Want to see bookmark, in its tag color, so the shelf reads as that tag's list.
      icon={<Icon name="bookmark" className="size-10 shrink-0 text-tag-watchlist" />}
    >
      {loading ? (
        <CassetteSkeletonRow />
      ) : (
        <ul className={SHELF_GRID}>
          {ids.length > 0 ? (
            films.map((slot, i) => (
              <li key={slot.id} className="flex">
                <SlotTile slot={slot} stagger={i} />
              </li>
            ))
          ) : (
            <li>
              <EmptySlot
                title="Nothing on the bill yet"
                note="Search for a film to save it"
                onPress={focusHeaderSearch}
              />
            </li>
          )}
        </ul>
      )}
    </ShelfSection>
  )
}

/**
 * The ticker's live facts (ADR-0040), most important first. An empty list drops its item rather
 * than showing a zero, and only scorer picks count as picks (the starter shelf isn't tuned).
 */
function tickerItems(topTen: number, watchlist: number, discovery: DiscoveryPicks): string[] {
  const tuned = discovery.usePicks && !discovery.loading ? discovery.picks : []
  const top = tuned[0]
  return [
    topTen > 0 && `Top Ten: ${topTen} of 10 ranked`,
    watchlist > 0 && `Watchlist: ${watchlist} ${watchlist === 1 ? 'film' : 'films'}`,
    tuned.length > 0 && `Discovery: ${tuned.length} new ${tuned.length === 1 ? 'pick' : 'picks'}`,
    top?.match !== undefined && `Top pick: ${top.movie.title}, ${top.match}% match`,
  ].filter((item): item is string => item !== false)
}

/** A Discovery tile: a cassette, plus why the scorer picked it (tuned picks only). */
type ShelfPick = CassetteItem & { reason?: string }

/** How the scorer saw a pick: what's saved with a quick-action press (ADR-0045). */
type Scores = Pick<FeedbackEntry, 'parts' | 'penalty'>

/** Discovery's picks and their state, from `useDiscoveryPicks`. */
type DiscoveryPicks = ReturnType<typeof useDiscoveryPicks>

/**
 * Discovery's picks (ADR-0026): the scorer's when there are likes, else a starter shelf of
 * acclaimed, lesser-known older films (ADR-0042), never this week's blockbusters. (The big
 * featured card is gone, owner 2026-10-09: the top pick is simply the first box.)
 */
function useDiscoveryPicks() {
  const tuned = useRecommendations(HOME_PICKS)
  const starter = useQuery(movieQueries.deepCuts())
  // Every film you've tagged stays out of the starter picks, not just disliked ones (owner,
  // 2026-10-15): a film you saved or liked with a quick action shouldn't come back. The
  // scorer's picks already leave out every tagged film. Your Top Ten films stay out too
  // (ADR-0043): a favourite you already ranked isn't a discovery.
  const tagged = useQuery(useTagQueries().all()).data
  const topTenQuery = useTopTen()
  const topTen = topTenQuery.data ?? []
  const excluded = tagged && new Set([...tagged.map((r) => r.tmdbId), ...topTen])
  // Whether you have likes isn't known until your lists have loaded (a moment on a passkey
  // account, ADR-0031). Until then the shelf counts as loading: choosing the starter shelf early
  // would flash its hint and could hold starter picks for someone who has likes.
  const listsKnown = tagged !== undefined && !topTenQuery.isPending

  // Use the scorer's picks when there are likes and the scorer has (or is still finding) picks;
  // otherwise fall back to the starter shelf so the panel is never empty.
  const usePicks = tuned.hasLikes && (tuned.loading || tuned.recommendations.length > 0)
  // While the scorer is still loading (both passes, ADR-0028), show nothing rather than early
  // picks that would reshuffle when the re-rank arrives.
  const shown: ShelfPick[] = (
    usePicks
      ? (tuned.loading ? [] : tuned.recommendations).map((r) => ({
          movie: r.movie,
          match: r.match,
          reason: r.reason,
        }))
      : (starter.data?.results ?? [])
          .filter((m) => !excluded?.has(m.id))
          .map((movie) => ({ movie }))
  ).slice(0, HOME_PICKS)
  // How the scorer saw each tuned pick, saved with a quick-action press so the weights lab can
  // learn from it (ADR-0045). Starter picks aren't scored, so they have none.
  const scores = new Map<number, Scores>(
    usePicks
      ? tuned.recommendations.map((r) => [r.movie.id, { parts: r.parts, penalty: r.penalty }])
      : [],
  )
  // Director and writer for each tile: one details call per film, cached for a day and shared
  // with Detail (and with the scorer's re-rank, so most picks are already loaded). A tile shows
  // its film at once, and its credit lines fill in when the details arrive.
  const details = useQueries({ queries: shown.map((i) => movieQueries.detail(i.movie.id)) })
  const picks = shown.map((item, i) => {
    const data = details[i]?.data
    return data ? { ...item, credits: creditsOf(data) } : item
  })
  return {
    picks,
    scores,
    usePicks,
    loading: !listsKnown || (usePicks ? tuned.loading : starter.isPending),
    failed: listsKnown && !usePicks && starter.isError,
    listsKnown,
  }
}

/** The Discovery shelf: the picks, a loading placeholder, or what went wrong. */
function DiscoveryShelf({ discovery }: { discovery: DiscoveryPicks }) {
  const { picks, scores, usePicks, loading, failed, listsKnown } = discovery
  const shelf = useHeldPicks(picks, scores, !loading && !failed && picks.length > 0)
  return (
    <ShelfSection id="discovery" feature={3} title={PANELS.discovery.title}>
      {/* Only the untuned feed explains itself: it's the one line that tells you what to do. */}
      {listsKnown && !usePicks && !failed && (
        <p className="-mt-2 mb-6 text-base text-fg-soft">
          Mark a few films “More like this” to tune these picks to you.
        </p>
      )}
      {shelf.items ? (
        <ul className={SHELF_GRID}>
          {shelf.items.map((pick, i) => (
            <li key={pick.movie.id} className="flex flex-col">
              <CassetteCard item={pick} stagger={i} />
              {pick.reason && <PickReason reason={pick.reason} title={pick.movie.title} />}
              <PickActions
                title={pick.movie.title}
                stamped={pick.stamp}
                busy={shelf.busy === pick.movie.id}
                onAct={(tag) => shelf.act(pick.movie, tag)}
                onUndo={() => shelf.undo(pick.movie.id)}
              />
            </li>
          ))}
        </ul>
      ) : loading ? (
        <>
          <p role="status" className="sr-only">
            Finding films…
          </p>
          <ShelfSkeleton />
        </>
      ) : failed ? (
        // The error chip (ADR-0040 §9): what failed and what to do.
        <p
          role="status"
          className="w-fit border-2 border-dashed border-danger px-4 py-3 font-label text-base text-fg"
        >
          Discovery is unavailable right now. Try again in a moment.
        </p>
      ) : (
        <ul className={SHELF_GRID}>
          <li>
            <EmptySlot
              title="Mark a few films “More like this” to get your first picks"
              note="Films marked “Less like this” stay on that list in My Lists."
            />
          </li>
        </ul>
      )}
      {/* The weights lab is a dev-server tool, so the link only shows there (FEATURES.labs). */}
      {usePicks && FEATURES.labs && (
        <p className="mt-6 text-sm text-fg-muted">
          Curious how these are ranked?{' '}
          <Link to="/lab/weights" className="text-accent underline">
            Tune the weights
          </Link>
        </p>
      )}
    </ShelfSection>
  )
}

/**
 * Discovery's picks, held still while you work through them with the quick actions (issue #76,
 * the owner's "stamp in place"). Each action re-runs the scorer, which drops the tagged film and
 * can reorder the rest; instead, the first full set of picks is kept for as long as Home is open,
 * a tagged pick stays in its place with a stamp and Undo, and new picks arrive the next time
 * Home opens. Credit lines that load later still fill in, from the details cache.
 * Each press is also saved with the pick's scores, and Undo takes it back out (ADR-0045).
 * @param scores - How the scorer saw each tuned pick, by film id (none for starter picks).
 * @param ready - The picks are complete (not loading, not failed, not empty): hold them.
 */
function useHeldPicks(picks: ShelfPick[], scores: ReadonlyMap<number, Scores>, ready: boolean) {
  const quickTag = useQuickTag()
  const feedback = useFeedbackLog()
  const [held, setHeld] = useState<ShelfPick[]>()
  // The scores as they were when the picks were held: a tagged pick leaves the live picks, but
  // its press should be saved with the scores it was shown with.
  const [heldScores, setHeldScores] = useState<ReadonlyMap<number, Scores>>(new Map())
  // Hold the first complete set (state set during render: React re-renders at once with it).
  if (ready && !held) {
    setHeld(picks)
    setHeldScores(scores)
  }
  // What each pick was stamped with, and the film saving right now.
  const [stamps, setStamps] = useState<ReadonlyMap<number, QuickAction['tag']>>(new Map())
  const [busy, setBusy] = useState<number>()
  // Each stamped pick's undo and its toast's close, kept outside state so the toast's Undo
  // (created once) always finds the current one.
  const undos = useRef(
    new Map<number, { tag: QuickAction['tag']; undo: () => Promise<void>; dismiss: () => void }>(),
  )

  const stamp = (id: number, tag: QuickAction['tag'] | undefined) =>
    setStamps((prev) => {
      const next = new Map(prev)
      if (tag) next.set(id, tag)
      else next.delete(id)
      return next
    })

  const undo = async (id: number) => {
    const entry = undos.current.get(id)
    if (!entry) return
    undos.current.delete(id)
    entry.dismiss()
    stamp(id, undefined)
    setBusy(id)
    try {
      await entry.undo()
      feedback?.remove(id)
    } catch {
      // Nothing changed: keep the stamp and the way back.
      undos.current.set(id, entry)
      stamp(id, entry.tag)
      notify.error(TAG_ERROR)
    } finally {
      setBusy(undefined)
    }
  }

  const act = async (movie: CassetteItem['movie'], tag: QuickAction['tag']) => {
    setBusy(movie.id)
    try {
      const undoTag = await quickTag(movie.id, tag)
      const shown = heldScores.get(movie.id)
      if (shown)
        feedback?.add({
          tmdbId: movie.id,
          action: tag,
          ...shown,
          scorerVersion: SCORER_VERSION,
          at: new Date().toISOString(),
        })
      stamp(movie.id, tag)
      const dismiss = notifyWithUndo(quickAction(tag).done(movie.title), () => void undo(movie.id))
      undos.current.set(movie.id, { tag, undo: undoTag, dismiss })
    } catch {
      notify.error(TAG_ERROR)
    } finally {
      setBusy(undefined)
    }
  }

  // Credit lines for every held pick, from the same cached details calls the picks make (so no
  // extra requests): a stamped pick drops out of the live picks but keeps its credits, even ones
  // that loaded after the shelf was held.
  const details = useQueries({
    queries: (held ?? []).map((h) => movieQueries.detail(h.movie.id)),
  })
  const items = held?.map((h, i) => {
    const data = details[i]?.data
    const item = data ? { ...h, credits: creditsOf(data) } : h
    const tag = stamps.get(h.movie.id)
    return tag ? { ...item, stamp: tag } : item
  })
  return { items, busy, act, undo }
}

/**
 * Box-shaped placeholders for the picks while they load (ADR-0040 §9), one per pick to come, so
 * the shelf doesn't jump when the picks arrive.
 */
function ShelfSkeleton() {
  return (
    <ul aria-hidden="true" data-loading-section="grid" className={SHELF_GRID}>
      {Array.from({ length: HOME_PICKS }, (_, i) => (
        <li key={i} className="flex">
          <CassetteSkeleton />
        </li>
      ))}
    </ul>
  )
}
