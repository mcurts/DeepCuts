/**
 * A DTCG Resolver Module 2025.10 implementation: load tokens.resolver.json, validate it,
 * and resolve an input to one merged token tree.
 *
 * Spec: https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/
 *
 * The engine implements the resolver's first two stages (validate the input, then merge
 * sets and the chosen modifier contexts in resolutionOrder). Style Dictionary then does
 * the third (alias resolution) in resolve.ts. Style Dictionary 5 doesn't read resolver
 * documents yet, so this module is what lets the source stay standard. Any compliant
 * tool (Terrazzo today) can read the same files.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import type { Input } from './types.ts';

/** A DTCG token tree: groups and tokens, as authored. */
export type TokenTree = { [key: string]: unknown };

type Source = TokenTree & { $ref?: string };

interface SetDef {
  sources: Source[];
  description?: string;
}

interface ModifierDef {
  contexts: Record<string, Source[]>;
  default?: string;
  description?: string;
}

type OrderItem =
  | { $ref: string }
  | ({ type: 'set'; name: string } & SetDef)
  | ({ type: 'modifier'; name: string } & ModifierDef);

interface ResolverDoc {
  name?: string;
  version: string;
  description?: string;
  sets?: Record<string, SetDef>;
  modifiers?: Record<string, ModifierDef>;
  resolutionOrder: OrderItem[];
}

/** The only resolver version 2025.10 defines. */
export const RESOLVER_VERSION = '2025.10';

export class ResolverError extends Error {}

type Step = { kind: 'set'; name: string; def: SetDef } | { kind: 'modifier'; name: string; def: ModifierDef };

export interface ModifierInfo {
  contexts: string[];
  default: string | undefined;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isToken = (v: unknown): boolean => isObject(v) && '$value' in v;

/**
 * Merge `source` into `target` (DTCG Resolver §Order: later declarations win). A token
 * replaces the earlier token whole. Its fields are never mixed, so a mode can't
 * inherit half of another value. Groups merge key by key.
 */
export function mergeTree(target: TokenTree, source: TokenTree): TokenTree {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (isToken(value) || !isObject(value) || !isObject(existing) || isToken(existing)) {
      target[key] = structuredClone(value);
    } else {
      mergeTree(existing as TokenTree, value);
    }
  }
  return target;
}

/** Every token path (dotted) in a tree. */
export function tokenPaths(tree: TokenTree, prefix: string[] = []): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    if (key.startsWith('$')) continue;
    const path = [...prefix, key];
    if (isToken(value)) out.push(path.join('.'));
    else if (isObject(value)) out.push(...tokenPaths(value as TokenTree, path));
  }
  return out;
}

export class Resolver {
  readonly file: string;
  readonly doc: ResolverDoc;
  private readonly steps: Step[];
  private readonly cache = new Map<string, TokenTree>();

  constructor(file: string, doc: ResolverDoc) {
    this.file = file;
    this.doc = doc;
    if (doc.version !== RESOLVER_VERSION) {
      throw new ResolverError(`${file}: "version" must be "${RESOLVER_VERSION}" (got ${JSON.stringify(doc.version)}).`);
    }
    if (!Array.isArray(doc.resolutionOrder) || doc.resolutionOrder.length === 0) {
      throw new ResolverError(`${file}: "resolutionOrder" must list at least one set or modifier.`);
    }
    this.steps = doc.resolutionOrder.map((item) => this.step(item));
    const names = new Set<string>();
    for (const s of this.steps) {
      if (names.has(`${s.kind}:${s.name}`)) throw new ResolverError(`${file}: ${s.kind} "${s.name}" appears twice in resolutionOrder.`);
      names.add(`${s.kind}:${s.name}`);
      if (s.kind === 'modifier') this.checkModifier(s.name, s.def);
    }
  }

  private step(item: OrderItem): Step {
    if ('$ref' in item) {
      const m = /^#\/(sets|modifiers)\/(.+)$/.exec(item.$ref);
      if (!m) throw new ResolverError(`${this.file}: resolutionOrder can only reference #/sets/… or #/modifiers/… (got ${item.$ref}).`);
      const [, group, name] = m as unknown as [string, 'sets' | 'modifiers', string];
      const def = this.doc[group]?.[name];
      if (!def) throw new ResolverError(`${this.file}: ${item.$ref} doesn't exist.`);
      return group === 'sets' ? { kind: 'set', name, def: def as SetDef } : { kind: 'modifier', name, def: def as ModifierDef };
    }
    if (item.type === 'set') return { kind: 'set', name: item.name, def: item };
    return { kind: 'modifier', name: item.name, def: item };
  }

  private checkModifier(name: string, def: ModifierDef): void {
    const contexts = Object.keys(def.contexts ?? {});
    if (contexts.length === 0) throw new ResolverError(`${this.file}: modifier "${name}" has no contexts.`);
    if (def.default !== undefined && !contexts.includes(def.default)) {
      throw new ResolverError(`${this.file}: modifier "${name}" default "${def.default}" isn't one of its contexts.`);
    }
    for (const sources of Object.values(def.contexts)) {
      for (const s of sources) {
        if (s.$ref?.startsWith('#/modifiers/')) {
          throw new ResolverError(`${this.file}: modifier "${name}" references another modifier (${s.$ref}); only sets may be referenced.`);
        }
      }
    }
  }

  /** Modifiers in resolution order, with their contexts and default. */
  modifiers(): Record<string, ModifierInfo> {
    return Object.fromEntries(
      this.steps
        .filter((s): s is Extract<Step, { kind: 'modifier' }> => s.kind === 'modifier')
        .map((s) => [s.name, { contexts: Object.keys(s.def.contexts), default: s.def.default }]),
    );
  }

  /**
   * Validate an input and fill in defaults (Resolver §Inputs). Modifier names match
   * case-insensitively; context names must match exactly.
   */
  normalizeInput(input: Input): Input {
    const mods = this.modifiers();
    const byLower = new Map(Object.keys(mods).map((m) => [m.toLowerCase(), m]));
    const out: Input = {};
    for (const [key, value] of Object.entries(input)) {
      const name = byLower.get(key.toLowerCase());
      if (!name) throw new ResolverError(`Input names unknown modifier "${key}".`);
      if (!mods[name]!.contexts.includes(value)) {
        throw new ResolverError(`Input "${name}: ${value}" isn't a context of modifier "${name}" (${mods[name]!.contexts.join(', ')}).`);
      }
      out[name] = value;
    }
    for (const [name, info] of Object.entries(mods)) {
      if (out[name] !== undefined) continue;
      if (info.default === undefined) throw new ResolverError(`Input doesn't choose a context for modifier "${name}", which has no default.`);
      out[name] = info.default;
    }
    return out;
  }

  /** Load one source: an inline tree, a file reference, or a #/sets/… pointer. */
  private load(source: Source, seen: string[] = []): TokenTree[] {
    if (source.$ref === undefined) return [source];
    const { $ref, ...overrides } = source;
    if (seen.includes($ref)) throw new ResolverError(`${this.file}: circular reference ${[...seen, $ref].join(' → ')}.`);
    let trees: TokenTree[];
    if ($ref.startsWith('#/sets/')) {
      const set = this.doc.sets?.[$ref.slice('#/sets/'.length)];
      if (!set) throw new ResolverError(`${this.file}: ${$ref} doesn't exist.`);
      trees = set.sources.flatMap((s) => this.load(s, [...seen, $ref]));
    } else if ($ref.startsWith('#')) {
      throw new ResolverError(`${this.file}: sources may reference #/sets/… or a file, not ${$ref}.`);
    } else {
      const path = resolvePath(dirname(this.file), $ref);
      let cached = this.cache.get(path);
      if (!cached) {
        cached = JSON.parse(readFileSync(path, 'utf8')) as TokenTree;
        this.cache.set(path, cached);
      }
      trees = [cached];
    }
    // Sibling keys next to $ref are shallow overrides (Resolver §Reference objects).
    return Object.keys(overrides).length ? [...trees, overrides] : trees;
  }

  private merged(sources: Source[]): TokenTree {
    const tree: TokenTree = {};
    for (const s of sources) for (const t of this.load(s)) mergeTree(tree, t);
    return tree;
  }

  /** Resolve an input to one merged token tree (aliases not yet resolved). */
  resolve(input: Input): TokenTree {
    const full = this.normalizeInput(input);
    const tree: TokenTree = {};
    for (const s of this.steps) {
      const sources = s.kind === 'set' ? s.def.sources : s.def.contexts[full[s.name]!]!;
      mergeTree(tree, this.merged(sources));
    }
    return tree;
  }

  /** The token paths one context of a modifier defines on its own (for the completeness gate). */
  contextPaths(modifier: string, context: string): Set<string> {
    const def = this.steps.find((s) => s.kind === 'modifier' && s.name === modifier)!.def as ModifierDef;
    return new Set(tokenPaths(this.merged(def.contexts[context]!)));
  }
}

export const loadResolver = (file: string): Resolver =>
  new Resolver(file, JSON.parse(readFileSync(file, 'utf8')) as ResolverDoc);
