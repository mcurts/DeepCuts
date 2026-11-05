// Feature flags: finished-but-hidden work stays in the codebase, tested, until the owner turns it on.
// To turn a feature on or off, change its value in FEATURES below.

/** Every feature flag and what it controls. */
export type Features = {
  /** "Tune my picks" onboarding (/tune and the header heart). Off until the flow is reworked. */
  onboarding: boolean
  /**
   * The design and tuning labs (/lab/vhs, /lab/weights) and Discover's "Tune the weights" link.
   * Dev server only, never on the live site. It's `import.meta.env.DEV`, so
   * a production build leaves the labs' code out entirely (see router.tsx). Tests can turn it off.
   */
  labs: boolean
  /** The optional Search page (/search, "Quick add"). The header search always opens films. */
  searchPage: boolean
}

/** The flags the app runs with. */
export const FEATURES: Features = {
  onboarding: false,
  labs: import.meta.env.DEV,
  searchPage: false,
}

/**
 * Where "home" is: the page the app opens on, and where Back, sign-out and error pages go when
 * there's nowhere better. Welcome is always Home; Search is never a primary destination.
 */
export function homeOf() {
  return { path: '/', label: 'Home' } as const
}

/** Home for the app's real flags (see `homeOf`). */
export const HOME = homeOf()
