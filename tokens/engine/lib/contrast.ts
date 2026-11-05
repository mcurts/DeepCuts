/**
 * WCAG 2.x contrast math and the contrast gate.
 *
 * The gate is the enforcement half of the accessibility standard: every content and
 * control-border token declares which backgrounds it must work on, and the build
 * fails if any pairing is below its minimum. Tokens in the required groups that
 * declare no rule fail too, so a new color can't skip the check.
 */
import type { ContrastRule, ResolvedToken } from './types.ts';

/**
 * Whether a token must declare a contrast rule: every Tier 2 `content` color (text and
 * icons, WCAG 1.4.3), plus the paths a site lists (control and focus borders, 1.4.11).
 */
export function requiresContrast(t: ResolvedToken, alsoRequired: string[]): boolean {
  const path = t.path.join('.');
  if (alsoRequired.includes(path)) return true;
  return t.tier === 2 && t.path[1] === 'color' && t.name.split('-').includes('content');
}

/** Parse #rgb / #rrggbb (opaque only) into 0–255 channels. */
export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not an opaque hex color: "${hex}". Contrast-checked colors must be opaque.`);
  let h = m[1] as string;
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance (sRGB). */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two hex colors, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a));
  const lb = relativeLuminance(parseHex(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastResult {
  set: string;
  foreground: string;
  background: string;
  fgValue: string;
  bgValue: string;
  ratio: number;
  min: number;
  pass: boolean;
}

export interface ContrastReport {
  results: ContrastResult[];
  /** Structural problems: missing rules, unknown background paths. */
  errors: string[];
}

const dotted = (t: ResolvedToken) => t.path.join('.');

/**
 * Check every declared pairing in one resolved token set (one input). `ruleKey` is the
 * namespaced extension, e.g. "com.mikecurts.contrast".
 */
export function checkContrast(setId: string, tokens: ResolvedToken[], ruleKey: string, alsoRequired: string[]): ContrastReport {
  const byPath = new Map(tokens.map((t) => [dotted(t), t]));
  const results: ContrastResult[] = [];
  const errors: string[] = [];

  for (const token of tokens) {
    const path = dotted(token);
    // One rule, or several when a color needs different minimums on different grounds
    // (4.5:1 where it's text, 3:1 where it's a large mark).
    const declared = token.extensions?.[ruleKey] as ContrastRule | ContrastRule[] | undefined;
    if (!declared) {
      if (requiresContrast(token, alsoRequired)) {
        errors.push(`[${setId}] ${path} has no ${ruleKey} rule; every content color and required border must declare one.`);
      }
      continue;
    }
    const rules = Array.isArray(declared) ? declared : [declared];
    for (const { on, min } of rules.flatMap((r) => r.on.map((on) => ({ on, min: r.min })))) {
      const bg = byPath.get(on);
      if (!bg) {
        errors.push(`[${setId}] ${path} references unknown background ${on}.`);
        continue;
      }
      const ratio = contrastRatio(String(token.value), String(bg.value));
      results.push({
        set: setId,
        foreground: path,
        background: on,
        fgValue: String(token.value),
        bgValue: String(bg.value),
        ratio: Math.round(ratio * 100) / 100,
        min,
        // Compare unrounded so 4.499 never passes as "4.5".
        pass: ratio >= min,
      });
    }
  }
  return { results, errors };
}

/** Human-readable failure summary for the console. Empty string when all pass. */
export function formatFailures(report: ContrastReport): string {
  const lines = [
    ...report.errors,
    ...report.results
      .filter((r) => !r.pass)
      .map((r) => `[${r.set}] ${r.foreground} (${r.fgValue}) on ${r.background} (${r.bgValue}): ${r.ratio}:1 < ${r.min}:1`),
  ];
  return lines.join('\n');
}
