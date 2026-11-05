/**
 * Value transforms registered with Style Dictionary. Each is a pure function so it
 * can be unit-tested without running a build.
 */
import { FLUID_VIEWPORT, fluidClamp } from './fluid.ts';
import type { UnitValue } from './types.ts';

export const isUnitValue = (v: unknown): v is UnitValue =>
  typeof v === 'object' && v !== null && typeof (v as UnitValue).value === 'number' && typeof (v as UnitValue).unit === 'string';

/** "1.5rem", "320ms". Zero keeps its unit, since unitless 0 is invalid for durations. */
export const unitToCss = (v: UnitValue): string => `${v.value}${v.unit}`;

/**
 * CSS platform: DTCG dimension → CSS length, or clamp() when the token declares a fluid
 * maximum under `fluidKey` (e.g. "com.mikecurts.fluid").
 */
export function dimensionCss(
  value: unknown,
  extensions: Record<string, unknown> | undefined,
  fluidKey: string,
  viewport: { minPx: number; maxPx: number } = FLUID_VIEWPORT,
): string {
  if (!isUnitValue(value)) throw new Error(`Expected a DTCG dimension object, got ${JSON.stringify(value)}`);
  const fluid = extensions?.[fluidKey] as { max: UnitValue } | undefined;
  return fluid ? fluidClamp(value, fluid.max, { ...FLUID_VIEWPORT, ...viewport }) : unitToCss(value);
}

/**
 * Email platform: email clients don't support rem or clamp(), so lengths become px
 * from the static (minimum) value. em stays em (letter-spacing is relative anyway).
 */
export function dimensionEmail(value: unknown, rootPx = 16): string {
  if (!isUnitValue(value)) throw new Error(`Expected a DTCG dimension object, got ${JSON.stringify(value)}`);
  if (value.unit === 'rem') return `${Math.round(value.value * rootPx * 100) / 100}px`;
  return unitToCss(value);
}

/** DTCG duration → CSS time. */
export function durationCss(value: unknown): string {
  if (!isUnitValue(value)) throw new Error(`Expected a DTCG duration object, got ${JSON.stringify(value)}`);
  return unitToCss(value);
}

/** DTCG color as Style Dictionary hands it to a composite transform: a string or a 2025.10 color object. */
interface DtcgColor {
  colorSpace?: string;
  components: [number, number, number];
  alpha?: number;
  hex?: string;
}

/**
 * Any color value → CSS. Opaque colors keep their hex (stable, diffable output); colors
 * with alpha become rgb() with a slash alpha (CSS Color 4), which every evergreen
 * browser supports.
 */
export function colorCss(value: unknown): string {
  if (typeof value === 'string') return value;
  const c = value as DtcgColor;
  if (!c || !Array.isArray(c.components)) throw new Error(`Expected a DTCG color, got ${JSON.stringify(value)}`);
  const alpha = c.alpha ?? 1;
  if (alpha === 1 && c.hex) return c.hex.toLowerCase();
  const [r, g, b] = c.components.map((x) => Math.round(x * 255));
  return `rgb(${r} ${g} ${b} / ${Math.round(alpha * 1000) / 1000})`;
}

/** One DTCG 2025.10 shadow layer. */
interface DtcgShadow {
  color: unknown;
  offsetX: UnitValue;
  offsetY: UnitValue;
  blur: UnitValue;
  spread: UnitValue;
  inset?: boolean;
}

/**
 * DTCG shadow (a layer or an array of layers) → CSS box-shadow or text-shadow. Style Dictionary's
 * built-in shadow transform expects string parts; this accepts the strict DTCG 2025.10
 * object forms.
 */
export function shadowCss(value: unknown): string {
  const layers = (Array.isArray(value) ? value : [value]) as DtcgShadow[];
  return layers
    .map((s) => {
      for (const k of ['offsetX', 'offsetY', 'blur', 'spread'] as const) {
        if (!isUnitValue(s?.[k])) throw new Error(`Shadow ${k} must be a DTCG dimension, got ${JSON.stringify(s?.[k])}`);
      }
      // A zero spread is left out: the same value then works as a box-shadow and as a
      // text-shadow, which has no spread (CSS Text Decoration 4 §text-shadow).
      const lengths = s.spread.value === 0 ? [s.offsetX, s.offsetY, s.blur] : [s.offsetX, s.offsetY, s.blur, s.spread];
      const parts = lengths.map(unitToCss).join(' ');
      return `${s.inset ? 'inset ' : ''}${parts} ${colorCss(s.color)}`;
    })
    .join(', ');
}
