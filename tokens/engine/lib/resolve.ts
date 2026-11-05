/**
 * Thin wrapper around Style Dictionary: resolves aliases in one merged token tree, applies
 * the value transforms, and returns plain ResolvedToken objects. Everything after this
 * point (gates, emitters) is pure and doesn't know about Style Dictionary, which keeps
 * the emitters easy to test and the tool swappable.
 */
import StyleDictionary from 'style-dictionary';
import type { DesignTokens, TransformedToken } from 'style-dictionary/types';
import type { TokenTree } from './resolver.ts';
import { cssName, tierOf } from './tiers.ts';
import { colorCss, dimensionCss, dimensionEmail, durationCss, shadowCss } from './transforms.ts';
import { extensionKeys, type ResolvedToken } from './types.ts';

export type Platform = 'css' | 'email';

type SdToken = TransformedToken;

const hooks = (namespace: string, viewport: { minPx: number; maxPx: number }) => {
  const fluidKey = extensionKeys(namespace).fluid;
  const byType = (type: string) => (t: SdToken) => t.$type === type;
  return {
    transforms: {
      'sb/dimension-css': { type: 'value' as const, filter: byType('dimension'), transform: (t: SdToken) => dimensionCss(t.$value, t.$extensions as Record<string, unknown> | undefined, fluidKey, viewport) },
      'sb/dimension-email': { type: 'value' as const, filter: byType('dimension'), transform: (t: SdToken) => dimensionEmail(t.$value) },
      'sb/duration-css': { type: 'value' as const, filter: byType('duration'), transform: (t: SdToken) => durationCss(t.$value) },
      // transitive: these run again after an alias resolves, so a shadow or color that
      // references another token is transformed from its final value.
      'sb/shadow-css': { type: 'value' as const, transitive: true, filter: byType('shadow'), transform: (t: SdToken) => shadowCss(t.$value) },
      // Every color goes through colorCss: Style Dictionary's built-in color/css drops DTCG
      // alpha, which scrims and shadows need, and one tested path keeps hex output stable.
      'sb/color-css': { type: 'value' as const, transitive: true, filter: byType('color'), transform: (t: SdToken) => colorCss(t.$value) },
    },
  };
};

const BASE = ['sb/color-css', 'fontFamily/css', 'cubicBezier/css', 'sb/duration-css', 'sb/shadow-css'];
const TRANSFORMS: Record<Platform, string[]> = {
  css: [...BASE, 'sb/dimension-css'],
  email: [...BASE, 'sb/dimension-email'],
};

/** Resolve every token in a merged tree for one platform. */
export async function resolveTree(
  tokens: TokenTree,
  platform: Platform,
  namespace: string,
  viewport: { minPx: number; maxPx: number } = { minPx: 360, maxPx: 1440 },
): Promise<ResolvedToken[]> {
  const sd = new StyleDictionary({
    tokens: structuredClone(tokens) as DesignTokens,
    usesDtcg: true,
    hooks: hooks(namespace, viewport),
    log: { verbosity: 'silent', warnings: 'disabled' },
    platforms: { [platform]: { transforms: TRANSFORMS[platform] } },
  });
  const { allTokens } = await sd.getPlatformTokens(platform);
  return allTokens.map((t) => ({
    name: cssName(t.path),
    path: t.path,
    tier: tierOf(t.path),
    value: t.$value as string | number,
    type: t.$type,
    description: t.$description,
    original: t.original.$value,
    extensions: t.$extensions as Record<string, unknown> | undefined,
    deprecated: t.$deprecated as boolean | string | undefined,
  }));
}
