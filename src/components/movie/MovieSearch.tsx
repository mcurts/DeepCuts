// The search field in the header of every page: type a title, pick a suggestion, open the film.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { ComboBox, Group, Input, ListBox, ListBoxItem, Popover } from 'react-aria-components'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { movieQueries } from '@/api/queries'
import { imageUrl, releaseYear, type MovieSummary } from '@/api/tmdb'
import { genreTone, primaryGenreName } from '@/domain/genres'
import { useDebouncedValue } from './useDebouncedValue'
import { useTagQueries } from '@/session/tagQueries'
import { Icon } from '@/components/ui/Icon'
import { LoadingImage } from '@/components/ui/LoadingImage'

// Four, as in the design: the list never needs to scroll, even at 320px (axe scrollable-region-focusable).
const MAX_SUGGESTIONS = 4

/**
 * The persistent search (design v2) shown on every page: an accessible combobox whose suggestions
 * open the film's detail page. On /search it also drives the `?q=` results list.
 * `onPick` lets onboarding remember the chosen film before navigating.
 */
export function MovieSearch({ onPick }: { onPick?: (movie: MovieSummary) => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const onSearchPage = pathname === '/search'
  // An over-long ?q= is ignored rather than truncated, matching the Search page (ADR-0014).
  const [text, setText] = useState(() => {
    const q = onSearchPage ? (params.get('q') ?? '') : ''
    return q.length <= 100 ? q : ''
  })
  // Search only once typing pauses for 300ms, instead of on every keystroke.
  const query = useDebouncedValue(text.trim(), 300)
  const { data } = useQuery(movieQueries.search(query))
  // Disliked films still appear, with a marker (design decision E4).
  const disliked = new Set(useQuery(useTagQueries().list('disliked')).data)
  const suggestions = query.length >= 2 ? (data?.results.slice(0, MAX_SUGGESTIONS) ?? []) : []

  // On the Search page the URL follows the field, so results and links stay shareable (ADR-0014).
  useEffect(() => {
    if (onSearchPage && query !== (params.get('q') ?? '')) {
      setParams(query ? { q: query } : {}, { replace: true })
    }
  }, [onSearchPage, query, params, setParams])

  // Opens a film's Detail page and clears the field.
  function open(movie: MovieSummary) {
    setText('')
    onPick?.(movie)
    navigate(`/movie/${movie.id}`)
  }

  // "Find" opens an exact title match, otherwise the best suggestion.
  function submit(event?: FormEvent) {
    event?.preventDefault()
    const wanted = text.trim().toLowerCase()
    const target = suggestions.find((m) => m.title.toLowerCase() === wanted) ?? suggestions[0]
    if (target) open(target)
  }

  return (
    <form role="search" onSubmit={submit} className="relative w-full">
      <ComboBox
        aria-label="Find a movie to view and tag"
        items={suggestions}
        inputValue={text}
        // Typing is capped at 100 characters, the longest query we accept.
        onInputChange={(value) => setText(value.slice(0, 100))}
        onSelectionChange={(key) => {
          const movie = suggestions.find((m) => m.id === key)
          if (movie) open(movie)
        }}
        // Free text is allowed (it's a search, not a pick-list), the popover may be empty, and it
        // opens as you type rather than on focus.
        allowsCustomValue
        allowsEmptyCollection
        menuTrigger="input"
      >
        {/* The Group is the popover's trigger, so the suggestion list matches the whole field's
            width (--trigger-width), not just the text input's. */}
        <Group className="focus-ring-within flex min-h-12 items-stretch rounded-field border-2 border-field-border bg-field-bg pl-3 focus-within:border-field-border-focus">
          <Icon name="search" className="size-5 shrink-0 self-center text-accent" />
          <Input
            // Enter with a highlighted suggestion selects it (React Aria); otherwise it acts as Find.
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.currentTarget.getAttribute('aria-activedescendant'))
                submit()
            }}
            placeholder="Find a movie to tag..."
            className="min-w-0 flex-1 bg-transparent px-3 text-base text-fg outline-none placeholder:text-fg-placeholder"
          />
          {/* Disabled until there's something to open. */}
          <button
            type="submit"
            disabled={suggestions.length === 0}
            className="w-18 bg-field-action-bg font-display text-base tracking-widest text-field-action-fg case-display hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-overlay disabled:text-fg-muted"
          >
            Find
          </button>
        </Group>
        <Popover
          offset={6}
          className="max-h-96 w-(--trigger-width) overflow-y-auto rounded-popover border-2 border-popover-border bg-popover-bg p-1 shadow-popover data-entering:animate-pop-in data-exiting:animate-pop-out"
        >
          <ListBox
            aria-label="Movie suggestions"
            renderEmptyState={() => (
              <p className="p-3.5 text-sm text-fg-muted">
                {query.length >= 2 ? 'No matching films' : 'Type at least two letters'}
              </p>
            )}
          >
            {/* One row per suggestion: poster, title and year · genre. Choosing it opens the film. */}
            {(movie: MovieSummary) => {
              const poster = imageUrl(movie.poster_path, 'w92')
              const meta = [releaseYear(movie.release_date), primaryGenreName(movie.genre_ids)]
              return (
                <ListBoxItem
                  id={movie.id}
                  textValue={movie.title}
                  style={genreTone(movie.genre_ids)}
                  className="border-b-border-2 flex min-h-16 cursor-pointer items-center gap-2.5 border-b border-l-3 border-l-(--tone) p-1.5 outline-none last:border-b-0 data-focused:bg-surface-overlay"
                >
                  {poster ? (
                    <LoadingImage src={poster} alt="" className="h-12 w-9 shrink-0 object-cover" />
                  ) : (
                    <span aria-hidden="true" className="h-12 w-9 shrink-0 bg-poster-placeholder" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <strong className="text-sm font-bold wrap-anywhere">{movie.title}</strong>
                    <small className="text-sm text-fg-muted">
                      {meta.filter(Boolean).join(' · ')}
                      {disliked.has(movie.id) && (
                        <span className="ml-2 text-tag-disliked">Less like this</span>
                      )}
                    </small>
                  </span>
                </ListBoxItem>
              )
            }}
          </ListBox>
        </Popover>
      </ComboBox>
    </form>
  )
}
