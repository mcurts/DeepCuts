// Fallback pages.
import { Link } from 'react-router'
import { HOME } from '@/config/features'

/** Shown for unknown URLs and when a page crashes, with a way back to Search. */
export function RouteError() {
  return (
    <main id="main" className="p-6">
      {/* React 19 moves <title> into the document head. */}
      <title>Something went wrong · Deep Cuts</title>
      <h1 className="font-display text-4xl tracking-wide case-display">Something went wrong</h1>
      <p className="mt-2 text-fg-muted">
        <Link to={HOME.path} className="text-accent underline">
          Back to {HOME.label}
        </Link>
      </p>
    </main>
  )
}
