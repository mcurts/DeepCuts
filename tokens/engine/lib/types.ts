/**
 * Shared types for the token engine. The vocabulary follows standards/design-tokens.md:
 *
 * - Tier 1 "definitions": raw values. Any path root except `theme` and `component`.
 *   Exported to JSON and TS for tools; never emitted as CSS custom properties.
 * - Tier 2 "usage": path root `theme`. The CSS API every component reads.
 * - Tier 3 "component": path root `component`, emitted without that root
 *   (`component.button.primary.background` → `--button-primary-background`).
 *
 * A DTCG resolver document (tokens.resolver.json) says which files make up each axis
 * value; tokens.config.json says which combinations to build and where they go.
 */

/** DTCG 2025.10 dimension or duration value object. */
export interface UnitValue {
  value: number;
  unit: string;
}

export type Tier = 1 | 2 | 3;

/** A token after alias resolution and value transforms, for one input. */
export interface ResolvedToken {
  /** CSS custom property name without `--` (Tier 3 drops its `component` root). */
  name: string;
  /** Path segments from the source, e.g. ['theme', 'color', 'background', 'default']. */
  path: string[];
  tier: Tier;
  /** Final value for the platform the token was resolved for. */
  value: string | number;
  type: string | undefined;
  description: string | undefined;
  /** The authored value before resolution, e.g. "{theme.color.background.default}". */
  original: unknown;
  extensions: Record<string, unknown> | undefined;
  /** DTCG $deprecated: true, or a message naming the replacement. */
  deprecated: boolean | string | undefined;
}

/** A modifier input: one context name per modifier (DTCG Resolver §Inputs). */
export type Input = Record<string, string>;

/** One combination to build, and where its CSS goes. */
export interface Permutation {
  /** Label in the JSON, TS and manifest outputs, e.g. "inverted". "default" is reserved for the default input. */
  name: string;
  /** Overrides on the default input; unspecified modifiers keep their default. */
  input: Input;
  /**
   * CSS selector for this permutation's changed tokens. Omit it for a permutation the browser
   * chooses (with `media`): its tokens are then written under the scope they change.
   */
  selector?: string;
  /** A media query the permutation applies under, e.g. "(prefers-contrast: more)". */
  media?: string;
  /** Extra declarations written with the tokens, e.g. { "color-scheme": "dark" }. */
  declarations?: Record<string, string>;
}

/** Writes every context of one modifier under its own selector, for runtime switching. */
export interface ContextOutput {
  modifier: string;
  /** Selector template; `{context}` is replaced by the context name. */
  selector: string;
  /**
   * Selector overrides for some contexts, first match wins. `match` is a regex on the
   * context name; `selector` may use `{context}` and the regex groups ($1, $2…). Lets a
   * mode context scope under its palette: `^(.+)-inverted$` → `[data-palette="$1"] [data-mode="inverted"]`.
   */
  rules?: { match: string; selector: string }[];
  /** "separate" writes css/contexts/<modifier>/<context>.css; "inline" appends to the site CSS. */
  file: 'separate' | 'inline';
  /** false writes every token, not only the ones that differ from the default input. */
  diff: boolean;
  /** Extra declarations per context, e.g. { "midnight": { "color-scheme": "dark" } }. */
  declarations?: Record<string, Record<string, string>>;
  /**
   * Permutations (by name) to apply inside each context as well, so a mode works in every
   * theme: high contrast in each phosphor color, inverted in each palette. Written as the
   * permutation's changes against that context.
   */
  permutations: string[];
}

/** Tailwind v4 namespace mapping: theme variable prefix ← token path prefix, for some tiers. */
export interface TailwindNamespace {
  /** Tailwind theme namespace without dashes, e.g. "color", "font", "text", "radius". */
  namespace: string;
  /** Dotted token path prefix whose remaining path becomes the key, e.g. "theme.color". */
  from: string;
  /** true writes var(--token) so runtime theme switching works; false writes the value. */
  themed: boolean;
  /** For font sizes: dotted prefix of the line heights paired by key (`font.line-height`). */
  lineHeight?: string;
  /** Only tokens of this DTCG $type, when one prefix holds several (Tier 3 colors, shadows, radii). */
  type?: string;
  /**
   * Only tokens whose last path word is this property, which is dropped from the key, because the
   * utility already says it: `theme.font.body.family` → `--font-body` (`font-body`),
   * `component.button.radius` → `--radius-button` (`rounded-button`).
   */
  property?: string;
}

export interface TailwindConfig {
  namespaces: TailwindNamespace[];
  /** Theme namespaces to reset (`--color-*: initial`) so only token-backed utilities exist. */
  reset: string[];
  /** Extra theme variables; `{dotted.path}` is replaced by that token's value. */
  extra: Record<string, string>;
}

export interface GrammarConfig {
  /** Site categories beyond the standard ones, each with its property words ([] = category is the property). */
  categories: Record<string, string[]>;
  /**
   * Value words a site deliberately uses, with the reason: hue words that are brand vocabulary,
   * or numbers that name a domain value rather than a design value (a heading level, a match %).
   */
  allowedValueWords: Record<string, string>;
}

export interface EngineConfig {
  /** Site name: names output files (css/<name>.css) and appears in banners. */
  name: string;
  /** One-line banner for generated files: who generated them and where the source is. */
  banner: string;
  /** Vendor namespace for $extensions (reverse domain, DTCG §5.2.3). */
  extensionNamespace: string;
  /** Default input: one context per modifier. */
  input: Input;
  css: {
    /** Cascade layer for token declarations; null writes them unlayered. */
    layer: string | null;
    /** Selector for the default input. */
    root: string;
    /** Extra declarations on the root selector. */
    declarations?: Record<string, string>;
    permutations: Permutation[];
    contexts: ContextOutput[];
  };
  outputs: {
    email: boolean;
    tailwind: TailwindConfig | null;
  };
  grammar: GrammarConfig;
  /** Viewport range for fluid sizes, in px: the size is $value at minPx and the fluid max at maxPx. */
  fluid: { minPx: number; maxPx: number };
  contrast: {
    /** Dotted paths that must declare a contrast rule besides every `content` color. */
    alsoRequired: string[];
    /** "each" checks every context swapped into the default input; "all" checks the full cross-product. */
    permutations: 'each' | 'all';
  };
}

/** Contrast rule authored on a token under $extensions["<namespace>.contrast"]. */
export interface ContrastRule {
  /** Dotted paths of the backgrounds this token must be legible on. */
  on: string[];
  /** Minimum WCAG ratio: 4.5 for text (1.4.3), 3 for non-text UI (1.4.11). */
  min: number;
}

/** Extension keys, namespaced per site config (e.g. "com.mikecurts.contrast"). */
export const extensionKeys = (namespace: string) => ({
  contrast: `${namespace}.contrast`,
  fluid: `${namespace}.fluid`,
  reducedMotion: `${namespace}.reduced-motion`,
});
