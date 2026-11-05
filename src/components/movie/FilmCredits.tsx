// The small text lines under a film on Home and My Lists: who made it.
import type { Credits } from '@/api/tmdb'

/**
 * "Director: John Carpenter" and "Writer: Bill Lancaster" (plural with two names). A line is
 * left out when TMDB has no such credit, and both are left out until the details load.
 */
export function CreditLines({ credits }: { credits: Credits | undefined }) {
  const lines = [
    {
      label: (credits?.directors.length ?? 0) > 1 ? 'Directors' : 'Director',
      names: credits?.directors ?? [],
    },
    {
      label: (credits?.writers.length ?? 0) > 1 ? 'Writers' : 'Writer',
      names: credits?.writers ?? [],
    },
  ].filter((l) => l.names.length > 0)
  return (
    // Two reserved text rows let credits arrive without moving this card or anything below it.
    <span data-credit-lines="" className="mt-1 block min-h-10">
      {lines.map((l) => (
        <span key={l.label} className="block text-sm text-content-muted">
          {l.label}: <span className="text-content">{l.names.join(', ')}</span>
        </span>
      ))}
    </span>
  )
}
