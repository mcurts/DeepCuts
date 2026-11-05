/**
 * Fluid sizing: turns a DTCG min dimension plus an `<namespace>.fluid.max` extension
 * into a CSS clamp() that grows linearly between two viewport widths.
 * Kept out of the source JSON because clamp() isn't a valid DTCG dimension.
 */
import type { UnitValue } from './types.ts';

export const FLUID_VIEWPORT = { minPx: 360, maxPx: 1440, rootPx: 16 };

const toRem = (d: UnitValue, rootPx: number): number => {
  if (d.unit === 'rem') return d.value;
  if (d.unit === 'px') return d.value / rootPx;
  throw new Error(`Fluid sizes must use rem or px, got "${d.unit}".`);
};

const round = (n: number) => Math.round(n * 10000) / 10000;

export function fluidClamp(min: UnitValue, max: UnitValue, vp = FLUID_VIEWPORT): string {
  const minRem = toRem(min, vp.rootPx);
  const maxRem = toRem(max, vp.rootPx);
  const minVw = vp.minPx / vp.rootPx;
  const maxVw = vp.maxPx / vp.rootPx;
  // Linear interpolation: size = intercept + slope * 100vw.
  const slope = (maxRem - minRem) / (maxVw - minVw);
  const intercept = minRem - slope * minVw;
  const [lo, hi] = minRem <= maxRem ? [minRem, maxRem] : [maxRem, minRem];
  return `clamp(${round(lo)}rem, ${round(intercept)}rem + ${round(slope * 100)}vw, ${round(hi)}rem)`;
}
