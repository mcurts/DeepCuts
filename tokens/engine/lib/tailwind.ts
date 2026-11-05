/**
 * Tailwind v4 theme output (https://tailwindcss.com/docs/theme), generated so that a
 * class name is always the token name: `theme.color.content.muted` → `text-content-muted`.
 * One grep finds the token and every use of it. The cost is some repetition
 * (`bg-action-primary-background`), which is accepted on purpose; shadcn/ui makes the same
 * trade with `bg-background` and `border-border`.
 *
 * Themed namespaces are written as var() references, so switching a theme or mode at
 * runtime changes them. The others are written as values.
 */
import { cssValue } from './emit.ts';
import { isUnitValue } from './transforms.ts';
import type { ResolvedToken, TailwindConfig, TailwindNamespace } from './types.ts';

/** Theme key: the path after the prefix, minus a trailing `default` (`background.default` → `background`). */
export function tailwindKey(path: string[], prefixLength: number): string {
  const rest = path.slice(prefixLength);
  return (rest.at(-1) === 'default' && rest.length > 1 ? rest.slice(0, -1) : rest).join('-');
}

/**
 * Line height as a unitless ratio of the font size, the way Tailwind writes it. Written as an exact
 * calc() rather than a rounded decimal: 1.1111 × 2.25rem is 39.998px, not 40px, and the error
 * adds up across a page of line boxes.
 */
function lineHeightRatio(size: unknown, lineHeight: unknown): string {
  if (typeof lineHeight === 'number') return String(lineHeight);
  if (isUnitValue(size) && isUnitValue(lineHeight) && size.unit === lineHeight.unit) {
    return lineHeight.value === size.value ? '1' : `calc(${lineHeight.value} / ${size.value})`;
  }
  throw new Error(`Can't pair line height ${JSON.stringify(lineHeight)} with size ${JSON.stringify(size)}: use the same unit, or a unitless number.`);
}

function namespaceLines(ns: TailwindNamespace, tokens: ResolvedToken[], byPath: Map<string, ResolvedToken>): string[] {
  const prefix = ns.from.split('.');
  const matches = tokens.filter(
    (t) =>
      prefix.every((p, i) => t.path[i] === p) &&
      t.path.length > prefix.length + (ns.property ? 1 : 0) &&
      (!ns.type || t.type === ns.type) &&
      (!ns.property || t.path.at(-1) === ns.property),
  );
  const lines: string[] = [];
  for (const t of matches) {
    if (ns.themed && t.tier === 1) {
      throw new Error(`Tailwind namespace "${ns.namespace}" is themed, but ${t.path.join('.')} is Tier 1, which has no CSS variable. Use themed: false.`);
    }
    const key = tailwindKey(ns.property ? t.path.slice(0, -1) : t.path, prefix.length);
    lines.push(`--${ns.namespace}-${key}: ${ns.themed ? `var(--${t.name})` : cssValue(t)};`);
    if (ns.lineHeight) {
      const lh = byPath.get(`${ns.lineHeight}.${t.path.slice(prefix.length).join('.')}`);
      if (!lh) throw new Error(`No line height at ${ns.lineHeight}.${t.path.slice(prefix.length).join('.')} for ${t.path.join('.')}.`);
      lines.push(`--${ns.namespace}-${key}--line-height: ${lineHeightRatio(t.original, lh.original)};`);
    }
  }
  return lines;
}

/** The generated `@theme` stylesheet for one site. */
export function toTailwind(banner: string, config: TailwindConfig, tokens: ResolvedToken[]): string {
  const byPath = new Map(tokens.map((t) => [t.path.join('.'), t]));
  const block = (header: string, namespaces: TailwindNamespace[], extra: string[]) => {
    const lines = namespaces.flatMap((ns) => namespaceLines(ns, tokens, byPath));
    const resets = config.reset
      .filter((r) => namespaces.some((ns) => ns.namespace === r))
      .map((r) => `--${r}-*: initial;`);
    const body = [...resets, ...lines, ...extra];
    return body.length ? `${header} {\n${body.map((l) => `  ${l}`).join('\n')}\n}\n` : '';
  };
  const interpolate = (v: string) =>
    v.replace(/\{([^{}]+)\}/g, (_, path: string) => {
      const t = byPath.get(path);
      if (!t) throw new Error(`Tailwind extra references unknown token {${path}}.`);
      return String(cssValue(t));
    });
  const extra = Object.entries(config.extra).map(([k, v]) => `${k}: ${interpolate(v)};`);
  return [
    `/* ${banner} */`,
    '',
    // static: emit every variable, even ones only referenced from code Tailwind can't see.
    block('@theme static inline', config.namespaces.filter((n) => n.themed), []),
    block('@theme inline', config.namespaces.filter((n) => !n.themed), extra),
  ]
    .filter((s, i) => i < 2 || s)
    .join('\n');
}
