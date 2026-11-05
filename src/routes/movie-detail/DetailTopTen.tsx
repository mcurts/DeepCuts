// The Top Ten slot on the Detail page: the top-left corner of the film's details.
//
// It shows one of three things, depending on the person's Top Ten:
// - the film is in it:      the "Your pick: #4 in Top 10" sticker, with a small Remove button
// - there's room for it:    the "Your pick? Add to Top 10" sticker
// - the list is full:       "Your Top Ten is full." (choosing a film to replace it comes with the
//                           Top Ten management screen)
// Unlike the tags, a press saves at once: there's nothing to stage, and Remove undoes it.
//
// This file owns the behavior; TopTenSticker, TopTenPick and TopTenNotice only draw. Replacing a
// design later means swapping one component here.
import { useEffect, useRef } from 'react'
import { TopTenNotice } from './TopTenNotice'
import { TopTenPick, TopTenSticker } from './TopTenSticker'
import { isTopTenFull, TopTenFullError } from '@/domain/topTen'
import { notify } from '@/notify'
import { useChangeTopTen, useTopTen } from '@/session/topTenQueries'

/**
 * The Top Ten sticker or notice for one film. Each change is confirmed (or reported) in a toast.
 * @param movieId - The TMDB id of the film on this Detail page.
 * @param title - The film's title, for the toasts.
 */
export function DetailTopTen({
  movieId,
  title,
  className = '',
}: {
  movieId: number
  title: string
  className?: string
}) {
  const topTen = useTopTen()
  const change = useChangeTopTen()
  // After a press, the pressed control is replaced by the other one, which would drop keyboard
  // focus to the page. So remember to move focus to whatever replaces it.
  const focusNext = useRef(false)
  const stickerRef = useRef<HTMLButtonElement>(null)
  // The "Your pick" sticker or the "full" notice, whichever is shown.
  const noticeRef = useRef<HTMLParagraphElement>(null)

  const list = topTen.data ?? []
  // Which of the three things to show (null until the list has loaded).
  const shown = !topTen.isSuccess
    ? null
    : list.includes(movieId)
      ? 'member'
      : isTopTenFull(list)
        ? 'full'
        : 'sticker'

  useEffect(() => {
    if (!focusNext.current) return
    focusNext.current = false
    // The pick or notice gets focus, so a screen reader reads it ("Your pick: #4 in Top 10");
    // after a removal, the sticker does. Whichever is rendered now holds its ref.
    ;(noticeRef.current ?? stickerRef.current)?.focus()
  }, [shown])

  function save(on: boolean) {
    // Set before the change starts, so it's in place whenever the new list lands in the cache.
    focusNext.current = true
    change.mutate(
      { tmdbId: movieId, on },
      {
        onSuccess: () =>
          notify.success(
            on ? `Added ${title} to your Top Ten.` : `Removed ${title} from your Top Ten.`,
          ),
        onError: (error) => {
          // A full list (filled elsewhere, e.g. another tab): the re-fetched list shows the "full"
          // notice, which then takes focus. Anything else keeps the sticker (and focus).
          if (error instanceof TopTenFullError) {
            notify.error(`Your Top Ten is full, so ${title} wasn’t added.`)
            return
          }
          focusNext.current = false
          notify.error('Couldn’t update your Top Ten. Please try again.')
        },
      },
    )
  }

  // Until the list loads (or if it can't), show nothing rather than a control that might be wrong.
  // The slot keeps its height either way, so the title below never jumps: 82px (`min-h-20.5`) is
  // the height of both stickers (TopTenSticker.css; measured at 320, 390 and 1280px), the tallest
  // thing it holds. The shorter "full" notice sits at the top of the slot.
  const content =
    shown === 'member' ? (
      <TopTenPick
        ref={noticeRef}
        rank={list.indexOf(movieId) + 1}
        onRemove={() => save(false)}
        pending={change.isPending}
      />
    ) : shown === 'full' ? (
      <TopTenNotice ref={noticeRef}>Your Top Ten is full.</TopTenNotice>
    ) : shown === 'sticker' ? (
      <TopTenSticker ref={stickerRef} onPress={() => save(true)} pending={change.isPending} />
    ) : null

  return (
    <div data-detail-top-ten="" className={`flex min-h-20.5 flex-col items-start ${className}`}>
      {content}
    </div>
  )
}
