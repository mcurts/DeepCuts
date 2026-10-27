// The tag panel on the Detail page: the three tag toggles, then Save and Cancel.
//
// Changes are staged: tapping a tag only changes what's shown (following the ADR-0050 rule
// through `applyTag`: one tag per film, so picking one clears the others), and Save and Cancel appear as soon as anything differs from what's saved.
// Save writes the changes, confirms them in a toast ("Saved. The Thing: Like.") and
// closes Detail; the toast stays up on the page underneath. Cancel discards the draft and closes Detail.
// Search keeps one-tap tagging that saves at once (owner's choice, 2026-10-07).
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from 'react-aria-components'
import { TagToggle } from '@/components/movie/TagToggle'
import { TAGS } from '@/components/movie/tagDisplay'
import { notify } from '@/notify'
import { applyTag, SYSTEM_TAGS, type SystemTag, type TagSet } from '@/domain/tagRules'
import { useSetTag, useTagQueries } from '@/session/tagQueries'

const NO_TAGS: TagSet = new Set()

// Whether two tag sets hold the same tags.
const sameTags = (a: TagSet, b: TagSet) => a.size === b.size && [...a].every((t) => b.has(t))

/** "Saved. The Thing: Like.", or a note that the tags were cleared. */
function savedMessage(title: string, tags: TagSet): string {
  const labels = TAGS.filter((t) => tags.has(t.tag)).map((t) => t.label)
  return labels.length
    ? `Saved. ${title}: ${labels.join(', ')}.`
    : `Saved. ${title} has no tags now.`
}

/**
 * The film's tag toggles with staged Save and Cancel.
 * @param movieId - The TMDB id the tags belong to.
 * @param title - The film's title, used in the saved message.
 * @param onDismiss - Closes the Detail route after Save or Cancel.
 */
export function DetailTags({
  movieId,
  title,
  onDismiss,
}: {
  movieId: number
  title: string
  onDismiss: () => void
}) {
  const saved = useQuery(useTagQueries().forMovie(movieId)).data ?? NO_TAGS
  const setTag = useSetTag()
  // The unsaved selection, or null when the toggles simply show what's saved.
  const [draft, setDraft] = useState<TagSet | null>(null)
  const [saving, setSaving] = useState(false)

  const shown = draft ?? saved
  // Saving keeps the action row mounted even after the query cache catches up with the draft
  // (after a successful save it stays set), so the row never collapses during the exit transition.
  // It disappears only when the closing Detail route unmounts.
  const dirty = draft !== null && (!sameTags(draft, saved) || saving)

  function toggle(tag: SystemTag, on: boolean) {
    if (saving) return
    setDraft(applyTag(shown, tag, on))
  }

  async function save() {
    if (!draft || saving) return
    setSaving(true)
    let succeeded = false
    try {
      // The repository changes one tag at a time. Removals go first, then additions, which lands
      // exactly on the draft: the draft already follows the rules, so an addition never clears a
      // tag the person wants to keep. Each change is diffed against what's saved now, so after a
      // failed save, Save again only sends what's still missing.
      for (const tag of SYSTEM_TAGS) {
        if (saved.has(tag) && !draft.has(tag))
          await setTag.mutateAsync({ tmdbId: movieId, tag, on: false })
      }
      for (const tag of SYSTEM_TAGS) {
        if (!saved.has(tag) && draft.has(tag))
          await setTag.mutateAsync({ tmdbId: movieId, tag, on: true })
      }
      notify.success(savedMessage(title, draft))
      succeeded = true
      onDismiss()
    } catch {
      // The draft stays selected, so nothing the person picked is lost; the toast says to retry.
      notify.error(
        'Your changes weren’t all saved. Your picks are still selected, so try Save again.',
      )
    } finally {
      // A successful save immediately starts dismissal; unmount owns the final cleanup. On an
      // error the page stays open, so restore the controls for a retry.
      if (!succeeded) setSaving(false)
    }
  }

  function cancel() {
    // The route is about to unmount, which discards the draft. Keeping it for the 400ms fade
    // preserves the action row's dimensions and prevents the content below from jumping upward.
    onDismiss()
  }

  return (
    <>
      <div role="group" aria-label="Your tags" className="grid grid-cols-3 gap-1.5">
        {TAGS.map((t) => (
          <TagToggle
            key={t.tag}
            tag={t}
            isSelected={shown.has(t.tag)}
            onChange={(on) => toggle(t.tag, on)}
            className="min-h-17 flex-col gap-1.5 px-1 text-center"
          />
        ))}
      </div>
      {/* Reserve the complete 44px action row from first paint, so showing or hiding the buttons
          never moves the status line or streaming section. When dirty, the next Tab from a tag
          reaches Save; actions stay right-aligned (owner, 2026-10-07/09). */}
      <div data-detail-actions="" className="mt-5 flex min-h-11 justify-end gap-2">
        {dirty && (
          <>
            <Button
              onPress={save}
              // Not `isPending` or `isDisabled`: React Aria's pending announcer leaves an unlabelled
              // element that fails axe, and disabling the button would drop keyboard focus. A second
              // press while saving is ignored in `save` instead.
              aria-disabled={saving}
              className="flex min-h-11 animate-pop-in items-center justify-center gap-2 rounded-button bg-button-primary-bg px-5 font-display text-base tracking-widest text-button-primary-fg case-display hover:bg-button-primary-bg-hover aria-disabled:opacity-70"
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              onPress={cancel}
              isDisabled={saving}
              className="flex min-h-11 animate-pop-in items-center justify-center rounded-button border-2 border-button-secondary-border bg-button-secondary-bg px-5 font-display text-base tracking-widest text-button-secondary-fg case-display hover:border-accent"
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </>
  )
}
