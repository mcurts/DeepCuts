/**
 * Tiers are read from the path root, so a reader (or a lint) can tell a token's tier
 * from its name alone. See standards/design-tokens.md §1.
 */
import type { Tier } from './types.ts';

export const TIER_2_ROOT = 'theme';
export const TIER_3_ROOT = 'component';

export const tierOf = (path: string[]): Tier => (path[0] === TIER_2_ROOT ? 2 : path[0] === TIER_3_ROOT ? 3 : 1);

/** CSS custom property name without `--`. Tier 3 drops its root: Frost's `button-primary-background`. */
export const cssName = (path: string[]): string => (tierOf(path) === 3 ? path.slice(1) : path).join('-');

/** Every `{dotted.path}` alias inside an authored value (strings, objects or arrays). */
export function referencesIn(original: unknown): string[] {
  const text = typeof original === 'string' ? original : JSON.stringify(original ?? null);
  return [...text.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]!);
}

/**
 * What each tier may reference: Tier 1 → Tier 1; Tier 2 → Tier 1 or 2; Tier 3 → Tier 2 or 3.
 * Tier 3 never reaches Tier 1, because a component that skipped Tier 2 would ignore themes and modes.
 */
const MAY_REFERENCE: Record<Tier, Tier[]> = { 1: [1], 2: [1, 2], 3: [2, 3] };

export function checkTierReferences(tokens: { path: string[]; original: unknown }[]): string[] {
  const errors: string[] = [];
  for (const t of tokens) {
    const from = tierOf(t.path);
    const refs = referencesIn(t.original);
    // A literal in Tier 3 would bypass every theme and mode: the component would ignore them.
    if (from === 3 && refs.length === 0) {
      errors.push(`${t.path.join('.')} (Tier 3) is a literal value; Tier 3 tokens must reference a Tier 2 or Tier 3 token.`);
    }
    for (const ref of refs) {
      const to = tierOf(ref.split('.'));
      if (!MAY_REFERENCE[from].includes(to)) {
        errors.push(`${t.path.join('.')} (Tier ${from}) references ${ref} (Tier ${to}); Tier ${from} may only reference Tier ${MAY_REFERENCE[from].join(' or ')}.`);
      }
    }
  }
  return errors;
}
