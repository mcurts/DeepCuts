// "Skip to content" (WCAG 2.4.1): the first thing a keyboard user reaches on every layout (the app
// shell, Detail, Sign in and Tune), so it lives with the other app-shell pieces.

/**
 * "Skip to content": hidden until a keyboard user tabs to it, then jumps past the header to
 * <main> (WCAG 2.4.1).
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-50 bg-accent-background px-3 py-2 font-bold text-accent-content focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      Skip to content
    </a>
  )
}
