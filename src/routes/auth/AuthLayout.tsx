// The minimal layout for the account pages outside the main shell: Sign in and
// Create an account. A Back button, the logo and one narrow column; no search,
// so nothing competes with the form.
import { useRef, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { HOME } from '@/config/features'
import { Logo } from '@/components/layout/Logo'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { useHeaderHeight } from '@/hooks/useHeaderHeight'
import { SkipLink } from '@/components/layout/SkipLink'

/**
 * The shared frame of the account pages: skip link, Back + logo header, a narrow `<main>` and the
 * legal footer.
 */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  // Toasts appear just below this header (SonnerToaster.tsx).
  const header = useRef<HTMLElement>(null)
  useHeaderHeight(header)
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-300 flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <title>{`${title} · Deep Cuts`}</title>
      <SkipLink />
      <header
        ref={header}
        className="flex min-h-16 items-center justify-between gap-2.5 border-b-2 border-border px-5 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2 md:px-8"
      >
        {/* Back to the previous page; a page opened directly (no history) goes home. */}
        <Button
          onPress={() => (location.key === 'default' ? navigate(HOME.path) : navigate(-1))}
          className="-ml-2 flex min-h-11 items-center gap-1 px-2 text-sm text-content-accent"
        >
          <Icon name="back" /> Back
        </Button>
        <Link
          to={HOME.path}
          aria-label={`Deep Cuts, go to ${HOME.label}`}
          className="inline-flex min-h-11 items-center"
        >
          <Logo decorative align="end" className="h-9 w-auto" />
        </Link>
      </header>

      <main id="main" className="mx-auto grid w-full max-w-md flex-1 content-start gap-4 px-5 py-6">
        {children}
      </main>
      <SiteFooter className="mx-auto mt-10 w-full max-w-md px-5" />
    </div>
  )
}
