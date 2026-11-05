/**
 * Output formats: pure functions from resolved tokens to file contents, one per kind of
 * consumer (standards/design-tokens.md §4). Nothing here touches the file system.
 */
import { isUnitValue, unitToCss } from './transforms.ts';
import { referencesIn } from './tiers.ts';
import type { ResolvedToken } from './types.ts';

export type Flat = Record<string, string | number>;

/**
 * The CSS value of a token. A Tier 3 token that is exactly one alias is written as
 * var(--that-token), so it follows modes and themes on its own, and devtools show the
 * Tier 3 → Tier 2 chain. Everything else is the resolved value, because Tier 1 is never
 * emitted for a var() to point at.
 */
export function cssValue(t: ResolvedToken): string | number {
  if (t.tier === 3 && typeof t.original === 'string') {
    const refs = referencesIn(t.original);
    if (refs.length === 1 && t.original === `{${refs[0]}}`) {
      const [root, ...rest] = refs[0]!.split('.');
      if (root === 'theme') return `var(--theme-${rest.join('-')})`;
      if (root === 'component') return `var(--${rest.join('-')})`;
    }
  }
  return t.value;
}

/** Tier 2 and Tier 3 tokens only: the ones CSS may expose. */
export const emitted = (tokens: ResolvedToken[]) => tokens.filter((t) => t.tier !== 1);

/**
 * Tokens in `other` whose CSS differs from `base` (or that `base` lacks), plus every token
 * written as var() that depends on one of them, directly or through another var().
 *
 * The dependents matter because a custom property's var() is resolved on the element that
 * declares it, and descendants inherit the resolved value (CSS Variables §3). A Tier 3 token
 * declared once on :root would keep the default mode's color inside [data-mode="inverted"],
 * so each scope that changes a token re-declares the Tier 3 tokens that read it.
 */
export function changed(base: ResolvedToken[], other: ResolvedToken[]): ResolvedToken[] {
  const before = new Map(base.map((t) => [t.name, cssValue(t)]));
  const out = new Set(other.filter((t) => before.get(t.name) !== cssValue(t)).map((t) => t.name));
  const refOf = (t: ResolvedToken) => /^var\(--([a-z0-9-]+)\)$/.exec(String(cssValue(t)))?.[1];
  for (let grew = true; grew; ) {
    grew = false;
    for (const t of other) {
      const ref = refOf(t);
      if (ref && out.has(ref) && !out.has(t.name)) {
        out.add(t.name);
        grew = true;
      }
    }
  }
  return other.filter((t) => out.has(t.name));
}

const indent = (text: string, by = '  ') =>
  text
    .split('\n')
    .map((l) => (l ? by + l : l))
    .join('\n');

/** One rule declaring tokens (plus any extra declarations). Empty string if there's nothing to declare. */
export function cssRule(selector: string, tokens: ResolvedToken[], declarations: Record<string, string> = {}): string {
  const lines = [
    ...Object.entries(declarations).map(([p, v]) => `${p}: ${v};`),
    ...tokens.map((t) => `--${t.name}: ${cssValue(t)};`),
  ];
  if (lines.length === 0) return '';
  return `${selector} {\n${indent(lines.join('\n'))}\n}`;
}

/**
 * prefers-reduced-motion overrides for tokens that declare one under `key`. Ambient
 * loops are paused by components, not tokens, because a duration of 0 would make an
 * infinite animation spin.
 */
export function reducedMotionRule(selector: string, tokens: ResolvedToken[], key: string): string {
  const overrides = tokens.filter((t) => t.extensions?.[key] !== undefined);
  if (overrides.length === 0) return '';
  const body = overrides.map((t) => {
    const v = t.extensions![key];
    return `--${t.name}: ${isUnitValue(v) ? unitToCss(v) : String(v)};`;
  });
  return `@media (prefers-reduced-motion: reduce) {\n${indent(`${selector} {\n${indent(body.join('\n'))}\n}`)}\n}`;
}

/** Wrap rules in a media query, or return them unchanged without one. */
export function inMedia(media: string | undefined, rules: string[]): string[] {
  const body = rules.filter(Boolean).join('\n\n');
  if (!media || !body) return media ? [] : rules;
  return [`@media ${media} {\n${indent(body)}\n}`];
}

/** A CSS file: banner, then the rules, optionally inside one cascade layer. */
export function cssFile(banner: string, layer: string | null, rules: string[]): string {
  const body = rules.filter(Boolean).join('\n\n');
  if (!body) return `/* ${banner} */\n\n/* Nothing here differs from the default input. */\n`;
  const wrapped = layer ? `@layer ${layer} {\n${indent(body)}\n}` : body;
  return `/* ${banner} */\n\n${wrapped}\n`;
}

export const toFlat = (tokens: ResolvedToken[]): Flat => Object.fromEntries(tokens.map((t) => [t.name, t.value]));

/** Typed ESM: values per permutation, the Tier 1 definitions, and a `cssVar()` limited to real names. */
export function toEsm(banner: string, permutations: Record<string, ResolvedToken[]>, definitions: ResolvedToken[]): { js: string; dts: string } {
  const values = Object.fromEntries(Object.entries(permutations).map(([p, t]) => [p, toFlat(emitted(t))]));
  const names = [...new Set(Object.values(permutations).flatMap((t) => emitted(t).map((x) => x.name)))].sort();
  const keys = Object.keys(permutations);
  const js = [
    `// ${banner}`,
    `export const tokens = ${JSON.stringify(values, null, 2)};`,
    `export const definitions = ${JSON.stringify(toFlat(definitions), null, 2)};`,
    `export const permutations = ${JSON.stringify(keys)};`,
    `/** var(--name) for inline styles and canvas code. Prefer CSS for anything static. */`,
    `export const cssVar = (name) => \`var(--\${name})\`;`,
    '',
  ].join('\n');
  const dts = [
    `// ${banner}`,
    `export type TokenName =\n${names.map((n) => `  | '${n}'`).join('\n')};`,
    `export type Permutation = ${keys.map((k) => `'${k}'`).join(' | ')};`,
    `export declare const tokens: Record<Permutation, Record<TokenName, string | number>>;`,
    `export declare const definitions: Record<string, string | number>;`,
    `export declare const permutations: Permutation[];`,
    `export declare const cssVar: (name: TokenName) => string;`,
    '',
  ].join('\n');
  return { js, dts };
}

/** Categories email clients can use. Motion, shadows and site categories (motifs, textures) are left out. */
const EMAIL_CATEGORIES = ['color', 'font', 'space', 'size', 'border'];
const EMAIL_TYPES = ['color', 'fontFamily', 'fontWeight', 'dimension', 'number'];

/** Email-safe values: Tier 2 only, literal px and hex (the email platform has no rem or clamp()). */
export function toEmail(permutations: Record<string, ResolvedToken[]>): Record<string, Flat> {
  const keep = (t: ResolvedToken) => t.tier === 2 && EMAIL_CATEGORIES.includes(t.path[1]!) && EMAIL_TYPES.includes(t.type ?? '');
  return Object.fromEntries(Object.entries(permutations).map(([p, t]) => [p, toFlat(t.filter(keep))]));
}

export interface ManifestEntry {
  name: string;
  cssVar: string;
  path: string;
  tier: 2 | 3;
  /** The modifier (axis) whose contexts define this token, or "set" if it never varies. */
  axis: string;
  type: string | undefined;
  description: string | undefined;
  deprecated: boolean | string | undefined;
  /** The authored value, e.g. "{color.stone.050}". */
  references: unknown;
  values: Record<string, string | number>;
}

/** Every Tier 2 and Tier 3 token, described for the docs site and for LLM agents. */
export function toManifest(
  site: string,
  permutations: Record<string, ResolvedToken[]>,
  axisOf: (path: string) => string,
): { site: string; permutations: string[]; tokens: ManifestEntry[] } {
  const base = emitted(permutations.default ?? []);
  const tokens = base.map((t) => ({
    name: t.name,
    cssVar: `--${t.name}`,
    path: t.path.join('.'),
    tier: t.tier as 2 | 3,
    axis: axisOf(t.path.join('.')),
    type: t.type,
    description: t.description,
    deprecated: t.deprecated,
    references: t.original,
    values: Object.fromEntries(Object.entries(permutations).map(([p, ts]) => [p, ts.find((x) => x.name === t.name)!.value])),
  }));
  return { site, permutations: Object.keys(permutations), tokens };
}
