// Fallback pages.
import { Link } from 'react-router'
import { HOME } from '@/config/features'

/** Shown inside the app shell when a URL does not match a page. */
export function NotFound() {
  return (
    <div className="py-6">
      {/* React 19 moves <title> into the document head. */}
      <title>Page not found · Deep Cuts</title>
      <h1 className="font-display text-4xl tracking-wide case-display">Page not found</h1>
      <p className="mt-2 text-content-muted">
        <Link to={HOME.path} className="text-content-accent underline">
          Back to {HOME.label}
        </Link>
      </p>
    </div>
  )
}

/** Shown when a route crashes, with a landmark when no page layout could render one. */
export function RouteError() {
  return (
    <main id="main" className="p-6">
      {/* React 19 moves <title> into the document head. */}
      <title>Something went wrong · Deep Cuts</title>
      <h1 className="font-display text-4xl tracking-wide case-display">Something went wrong</h1>
      <p className="mt-2 text-content-muted">
        <Link to={HOME.path} className="text-content-accent underline">
          Back to {HOME.label}
        </Link>
      </p>
    </main>
  )
}
