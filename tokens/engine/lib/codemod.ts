/**
 * Applies a token rename map to source files, so a rename never depends on someone
 * remembering every file (standards/design-tokens.md §6).
 *
 * A rename map is { "old-name": "new-name" } in CSS-name form (no `--`). Matches are
 * whole names only: renaming `space-m` never touches `space-ml` or `theme-space-m`.
 */

export type CodemodMode =
  /** CSS custom properties: `--old` → `--new` (var() references and declarations). */
  | 'css-var'
  /** Bare names, e.g. JS strings and token names in docs: `old` → `new`. */
  | 'word'
  /**
   * Tailwind theme keys inside class names: `text-fg-muted` with key `fg-muted`. The key
   * follows a utility prefix, and variants (`hover:`, `md:`), `!` and opacity (`/50`) are kept.
   */
  | 'tailwind';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tailwind utilities that take a theme key. A key only matches right after one of these,
 * so renaming `surface` can't touch the `surface` inside `bg-card-surface`.
 */
const sides = (base: string, s: string[]) => [base, ...s.map((x) => `${base}-${x}`)];
export const TAILWIND_PREFIXES = [
  'bg', 'text', 'ring', 'ring-offset', 'outline', 'fill', 'stroke', 'from', 'via', 'to', 'decoration', 'divide',
  'accent', 'caret', 'placeholder', 'shadow', 'inset-shadow', 'drop-shadow', 'text-shadow', 'font', 'leading',
  'tracking', 'ease', 'animate', 'blur', 'max-w', 'min-w', 'w', 'h', 'size',
  ...sides('border', ['t', 'r', 'b', 'l', 'x', 'y', 's', 'e']),
  ...sides('rounded', ['t', 'r', 'b', 'l', 's', 'e', 'tl', 'tr', 'bl', 'br', 'ss', 'se', 'es', 'ee']),
];

/** Apply a rename map to one text. Returns the new text and how many names were replaced. */
export function applyRenames(
  text: string,
  renames: Record<string, string>,
  mode: CodemodMode,
  prefixes: string[] = TAILWIND_PREFIXES,
): { text: string; count: number } {
  const names = Object.keys(renames).sort((a, b) => b.length - a.length);
  if (names.length === 0) return { text, count: 0 };
  const lead = mode === 'css-var' ? '--' : mode === 'tailwind' ? '-' : '';
  const alternatives = names.map(escape).join('|');
  // A name is whole when the characters around it can't continue a kebab-case name. In
  // Tailwind mode the key must follow a known utility prefix at the start of a class.
  const utilities = [...prefixes].sort((a, b) => b.length - a.length).map(escape).join('|');
  const before = mode === 'tailwind' ? `(?<=(?:^|[\\s"'\`{:!])(?:${utilities}))` : '(?<![A-Za-z0-9_-])';
  // In Tailwind mode a match followed by ':' is a CSS property (`text-shadow: …`) or a variant
  // name, never a class, so it's left alone.
  const after = mode === 'tailwind' ? '(?![A-Za-z0-9_-]|\\s*:)' : '(?![A-Za-z0-9_-])';
  const re = new RegExp(`${before}${escape(lead)}(${alternatives})${after}`, 'g');
  let count = 0;
  const out = text.replace(re, (_, name: string) => {
    count++;
    return `${lead}${renames[name]}`;
  });
  return { text: out, count };
}
