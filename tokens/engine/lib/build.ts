/**
 * The token build: load → resolve every input → gates → emit.
 *
 * Gates (standards/design-tokens.md §5) run on every input the site can show before
 * anything is written, so a failing palette never produces output a site could pick up.
 *
 * Outputs (dist/):
 *   css/<site>.css                        default input on the root, permutations' changed tokens
 *   css/contexts/<modifier>/<context>.css  runtime-switchable contexts (when configured)
 *   json/<site>.json · json/definitions.json · json/contexts/<modifier>.json
 *   ts/<site>.js + .d.ts                   typed ESM
 *   dtcg/<site>.tokens.json                strict DTCG 2025.10, aliases kept (default input)
 *   tailwind/theme.css · email/<site>.json (when configured)
 *   manifest.json · contrast-report.json
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadConfig } from './config.ts';
import { checkContrast, formatFailures, type ContrastReport } from './contrast.ts';
import { changed, cssFile, cssRule, emitted, inMedia, reducedMotionRule, toEmail, toEsm, toFlat, toManifest } from './emit.ts';
import { lintName } from './grammar.ts';
import { resolveTree, type Platform } from './resolve.ts';
import { loadResolver, type Resolver } from './resolver.ts';
import { toTailwind } from './tailwind.ts';
import { checkTierReferences, referencesIn, tierOf } from './tiers.ts';
import { extensionKeys, type ContextOutput, type EngineConfig, type Input, type ResolvedToken } from './types.ts';

export class GateError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Token gates failed (nothing was written):\n${problems.map((p) => `  ${p}`).join('\n')}`);
    this.problems = problems;
  }
}

export interface BuildResult {
  files: string[];
  contrast: ContrastReport;
  warnings: string[];
}

export interface BuildOptions {
  /** The token package: holds tokens.config.json and tokens.resolver.json. */
  root: string;
  /** Where outputs go; emptied first. */
  outDir: string;
}

/** The selector for one context: the first matching rule, else the template. */
export function contextSelector(output: ContextOutput, context: string): string {
  for (const rule of output.rules ?? []) {
    const m = new RegExp(rule.match).exec(context);
    if (m) return rule.selector.replaceAll('{context}', context).replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? '');
  }
  return output.selector.replaceAll('{context}', context);
}

/**
 * Every context of every modifier must define the same Tier 2 and Tier 3 names (a missing role
 * fails). Tier 1 may differ: a theme's raw palette is its own, and only its roles are a contract.
 */
export function checkCompleteness(resolver: Resolver): string[] {
  const problems: string[] = [];
  const roles = (paths: Set<string>) => new Set([...paths].filter((p) => tierOf(p.split('.')) !== 1));
  for (const [modifier, info] of Object.entries(resolver.modifiers())) {
    const [first, ...others] = info.contexts.map((c) => [c, roles(resolver.contextPaths(modifier, c))] as const);
    for (const [context, paths] of others) {
      const missing = [...first![1]].filter((p) => !paths.has(p));
      const extra = [...paths].filter((p) => !first![1].has(p));
      if (missing.length) problems.push(`${modifier}=${context} is missing ${missing.join(', ')} (defined by ${modifier}=${first![0]}).`);
      if (extra.length) problems.push(`${modifier}=${context} defines ${extra.join(', ')}, which ${modifier}=${first![0]} doesn't.`);
    }
  }
  return problems;
}

/** Inputs the contrast gate checks: the default, each permutation, and each context (or all combinations). */
export function inputsToCheck(config: EngineConfig, resolver: Resolver): { label: string; input: Input }[] {
  const base = resolver.normalizeInput(config.input);
  const out = [{ label: 'default', input: base }];
  for (const p of config.css.permutations) out.push({ label: p.name, input: resolver.normalizeInput({ ...base, ...p.input }) });
  for (const c of config.css.contexts) {
    for (const name of c.permutations) {
      const p = config.css.permutations.find((x) => x.name === name)!;
      for (const ctx of resolver.modifiers()[c.modifier]!.contexts) {
        out.push({ label: `${c.modifier}=${ctx}+${name}`, input: resolver.normalizeInput({ ...base, [c.modifier]: ctx, ...p.input }) });
      }
    }
  }
  const mods = Object.entries(resolver.modifiers());
  if (config.contrast.permutations === 'all') {
    let combos: Input[] = [{}];
    for (const [m, info] of mods) combos = combos.flatMap((c) => info.contexts.map((ctx) => ({ ...c, [m]: ctx })));
    for (const c of combos) out.push({ label: Object.entries(c).map(([m, v]) => `${m}=${v}`).join(','), input: c });
  } else {
    for (const [m, info] of mods) for (const ctx of info.contexts) out.push({ label: `${m}=${ctx}`, input: { ...base, [m]: ctx } });
  }
  return out;
}

export async function build(opts: BuildOptions): Promise<BuildResult> {
  const config = loadConfig(join(opts.root, 'tokens.config.json'));
  const resolver = loadResolver(join(opts.root, 'tokens.resolver.json'));
  const keys = extensionKeys(config.extensionNamespace);
  const base = resolver.normalizeInput(config.input);

  const memo = new Map<string, Promise<ResolvedToken[]>>();
  const resolveInput = (input: Input, platform: Platform = 'css') => {
    const key = `${platform}:${JSON.stringify(resolver.normalizeInput(input))}`;
    if (!memo.has(key)) memo.set(key, resolveTree(resolver.resolve(input), platform, config.extensionNamespace, config.fluid));
    return memo.get(key)!;
  };

  // ---- Gates ----------------------------------------------------------------------------
  const problems = checkCompleteness(resolver);
  const warnings: string[] = [];
  const contrast: ContrastReport = { results: [], errors: [] };
  const linted = new Set<string>();
  for (const { label, input } of inputsToCheck(config, resolver)) {
    const tokens = await resolveInput(input);
    for (const t of tokens) {
      if (linted.has(t.name)) continue;
      linted.add(t.name);
      problems.push(...lintName(t.name, t.path, config.grammar));
      if (t.tier !== 1 && !t.description) warnings.push(`${t.name} has no $description (when should it be used?).`);
    }
    problems.push(...checkTierReferences(tokens));
    const r = checkContrast(label, tokens, keys.contrast, config.contrast.alsoRequired);
    contrast.results.push(...r.results);
    contrast.errors.push(...r.errors);
  }
  const failures = formatFailures(contrast);
  if (failures) problems.push(...failures.split('\n'));
  const unique = [...new Set(problems)];
  if (unique.length) throw new GateError(unique);

  // ---- Resolve outputs ------------------------------------------------------------------
  const baseTokens = await resolveInput(base);
  const deprecated = new Set(baseTokens.filter((t) => t.deprecated).map((t) => t.path.join('.')));
  for (const t of baseTokens) {
    for (const ref of referencesIn(t.original)) {
      if (deprecated.has(ref)) warnings.push(`${t.path.join('.')} references deprecated {${ref}}.`);
    }
  }
  const permutations: Record<string, ResolvedToken[]> = { default: baseTokens };
  for (const p of config.css.permutations) permutations[p.name] = await resolveInput({ ...base, ...p.input });

  // ---- Emit -----------------------------------------------------------------------------
  rmSync(opts.outDir, { recursive: true, force: true });
  const files: string[] = [];
  const write = (rel: string, content: string) => {
    const path = join(opts.outDir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    files.push(rel);
  };
  const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
  const block = (selector: string, tokens: ResolvedToken[], decls?: Record<string, string>) => [
    cssRule(selector, tokens, decls),
    reducedMotionRule(selector, tokens, keys.reducedMotion),
  ];

  const rootTokens = emitted(baseTokens);
  const rules = block(config.css.root, rootTokens, config.css.declarations);
  for (const p of config.css.permutations) {
    rules.push(...inMedia(p.media, block(p.selector ?? config.css.root, changed(rootTokens, emitted(permutations[p.name]!)), p.declarations)));
  }

  for (const c of config.css.contexts) {
    const perContext: Record<string, ReturnType<typeof toFlat>> = {};
    for (const ctx of resolver.modifiers()[c.modifier]!.contexts) {
      const tokens = emitted(await resolveInput({ ...base, [c.modifier]: ctx }));
      perContext[ctx] = toFlat(tokens);
      const selector = contextSelector(c, ctx);
      const ctxRules = block(selector, c.diff ? changed(rootTokens, tokens) : tokens, c.declarations?.[ctx]);
      // A permutation inside this context: its changes against the context, scoped under it.
      for (const name of c.permutations) {
        const p = config.css.permutations.find((x) => x.name === name)!;
        const inside = emitted(await resolveInput({ ...base, [c.modifier]: ctx, ...p.input }));
        const scope = p.selector ? `:is(${selector}) ${p.selector}` : selector;
        ctxRules.push(...inMedia(p.media, block(scope, changed(tokens, inside), p.declarations)));
      }
      if (c.file === 'inline') rules.push(...ctxRules);
      else write(`css/contexts/${c.modifier}/${ctx}.css`, cssFile(config.banner, config.css.layer, ctxRules));
    }
    write(`json/contexts/${c.modifier}.json`, json(perContext));
  }
  write(`css/${config.name}.css`, cssFile(config.banner, config.css.layer, rules));

  write(`json/${config.name}.json`, json(Object.fromEntries(Object.entries(permutations).map(([p, t]) => [p, toFlat(emitted(t))]))));
  const definitions = baseTokens.filter((t) => t.tier === 1);
  write('json/definitions.json', json(toFlat(definitions)));
  const esm = toEsm(config.banner, permutations, definitions);
  write(`ts/${config.name}.js`, esm.js);
  write(`ts/${config.name}.d.ts`, esm.dts);
  write(`dtcg/${config.name}.tokens.json`, json(resolver.resolve(base)));

  const axisByPath = new Map<string, string>();
  for (const [m, info] of Object.entries(resolver.modifiers())) {
    for (const ctx of info.contexts) for (const p of resolver.contextPaths(m, ctx)) axisByPath.set(p, m);
  }
  write('manifest.json', json(toManifest(config.name, permutations, (p) => axisByPath.get(p) ?? 'set')));
  write('contrast-report.json', json(contrast));

  if (config.outputs.email) {
    const email: Record<string, ResolvedToken[]> = { default: await resolveInput(base, 'email') };
    for (const p of config.css.permutations) email[p.name] = await resolveInput({ ...base, ...p.input }, 'email');
    write(`email/${config.name}.json`, json(toEmail(email)));
  }
  if (config.outputs.tailwind) write('tailwind/theme.css', toTailwind(config.banner, config.outputs.tailwind, baseTokens));

  return { files, contrast, warnings: [...new Set(warnings)] };
}
