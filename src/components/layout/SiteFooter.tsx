// The site's legal footer (owner, 2026-10-13): the copyright with the owner's name and site, and
// the attribution TMDB's terms of use require. Shown at the foot of the main shell, the account
// pages and Detail; the full-screen Tune onboarding leaves it out so nothing competes with it.
// It also shows the release version (ADR-0048, ADR-0049), so anyone reporting a problem can say
// which one. Builds outside a deploy say "dev build" instead. The theme chooser sits here too
// (ADR-0056): every visitor can reach it, signed in or not, without it competing with the page.
import { ThemePicker } from './ThemePicker'

/**
 * The legal footer: "© 2026 Mike Curts · mikecurts.com. All rights reserved. · v1.2.0", the
 * TMDB credit and the theme chooser. Side by side from `sm`, stacked on phones.
 * @param className - Placement from the layout (width, gutters, top margin).
 * @param version - The release shown (`1.2.0`, or `dev`); the build's own unless a story sets one.
 */
export function SiteFooter({
  className = '',
  version = __APP_VERSION__,
}: {
  className?: string
  version?: string
}) {
  // The current year, so the notice never goes stale.
  const year = new Date().getFullYear()
  return (
    <footer className={className}>
      <div className="flex flex-col gap-2 border-t-2 border-dashed border-border pt-5 font-label text-sm text-fg-muted sm:flex-row sm:justify-between sm:gap-6">
        <p>
          © {year} Mike Curts ·{' '}
          <a href="https://mikecurts.com" className="underline underline-offset-4 hover:text-fg">
            mikecurts.com
          </a>
          . All rights reserved. · {version === 'dev' ? 'dev build' : `v${version}`}
        </p>
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </div>
      <ThemePicker className="mt-4 font-label text-sm text-fg-muted" />
    </footer>
  )
}
