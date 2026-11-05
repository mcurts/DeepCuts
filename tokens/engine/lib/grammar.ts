/**
 * The naming grammar (standards/design-tokens.md §2), enforced.
 *
 *   Tier 2: theme-{category}-[{concept}-[{variant}-]]{property}[-{emphasis}][-{state}]
 *   Tier 3:       {component}-[{variant}-]{property}[-{state}]
 *
 * Categories and properties are a closed list; concept and variant words are each
 * site's own. Tier 1 is named by value (`color-stone-100`) and isn't linted here.
 */
import { tierOf } from './tiers.ts';
import type { GrammarConfig } from './types.ts';

/** Standard categories and their property words. [] means the category is the property. */
export const STANDARD_CATEGORIES: Record<string, string[]> = {
  color: ['background', 'content', 'border', 'decorative'],
  font: ['family', 'size', 'weight', 'line-height', 'letter-spacing', 'width'],
  space: [],
  size: [],
  border: ['radius', 'width'],
  shadow: [],
  motion: ['duration', 'easing', 'distance'],
  focus: ['width', 'offset'],
  opacity: [],
};

/** Properties a Tier 3 token can name: every standard property plus layout properties. */
export const TIER_3_PROPERTIES = [
  ...new Set([
    ...Object.values(STANDARD_CATEGORIES).flat(),
    ...['shadow', 'space', 'size', 'opacity', 'padding', 'margin', 'gap', 'inset', 'height', 'offset', 'color'],
  ]),
];

/** Abbreviations: full words only. Scale steps (xs, m, 2xl) are steps, not abbreviations. */
export const BANNED_WORDS: Record<string, string> = {
  fg: 'content',
  bg: 'background',
  btn: 'button',
  decor: 'decorative',
  alt: 'secondary',
  txt: 'content',
  clr: 'color',
  sm: 's',
  md: 'm',
  lg: 'l',
};

/** Homonyms (Curtis): words with too many meanings to name a concept. */
export const HOMONYMS = ['type', 'text'];

/** Words that describe a value, not a role. Allowed in Tier 1 only, or per site with a reason. */
export const VALUE_WORDS = [
  'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'violet', 'pink', 'magenta', 'cyan', 'teal',
  'navy', 'gray', 'grey', 'black', 'white', 'brown', 'beige', 'cream', 'gold', 'silver', 'lime',
  'indigo', 'sky', 'coral', 'lavender', 'amber', 'crimson', 'scarlet', 'maroon', 'olive', 'aqua',
];

/** States sit after the property. `focus` is excluded because it is also a concept (theme-color-focus-border). */
const ORDERED_STATES = ['hover', 'active', 'visited', 'selected', 'disabled'];

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Index of the first property word in `segs`, matching multi-word properties (line-height). */
function findProperty(segs: string[], properties: string[]): number {
  for (let i = 0; i < segs.length; i++) {
    for (const p of properties) {
      const words = p.split('-');
      if (segs.slice(i, i + words.length).join('-') === p) return i;
    }
  }
  return -1;
}

/** Lint one Tier 2 or Tier 3 token name. Returns problems; empty means it follows the grammar. */
export function lintName(name: string, path: string[], grammar: GrammarConfig): string[] {
  const tier = tierOf(path);
  if (tier === 1) return [];
  const problems: string[] = [];
  const say = (msg: string) => problems.push(`${name}: ${msg}`);

  if (!KEBAB.test(name)) {
    say('use lowercase kebab-case words.');
    return problems;
  }
  const segs = name.split('-');
  for (const s of segs) {
    if (BANNED_WORDS[s]) say(`"${s}" is an abbreviation; write "${BANNED_WORDS[s]}".`);
    if (HOMONYMS.includes(s)) say(`"${s}" is a homonym; name the concept more precisely.`);
    if (VALUE_WORDS.includes(s) && !grammar.allowedValueWords[s]) {
      say(`"${s}" names a value, not a role. Value words belong in Tier 1 (or list it in grammar.allowedValueWords with a reason).`);
    }
    if (/^\d+$/.test(s) && !grammar.allowedValueWords[s]) {
      say(`"${s}" is a literal value; Tier ${tier} names use roles and t-shirt scale steps (or list a domain number, like a heading level, in grammar.allowedValueWords).`);
    }
  }

  if (tier === 3) {
    if (findProperty(segs.slice(1), TIER_3_PROPERTIES) === -1) {
      say(`a Tier 3 name needs a property word (${TIER_3_PROPERTIES.join(', ')}).`);
    }
    return problems;
  }

  const categories = { ...STANDARD_CATEGORIES, ...grammar.categories };
  const category = segs[1]!;
  const properties = categories[category];
  if (!properties) {
    say(`unknown category "${category}". Standard: ${Object.keys(STANDARD_CATEGORIES).join(', ')}; declare site categories in grammar.categories.`);
    return problems;
  }
  const rest = segs.slice(2);
  if (rest.length === 0) say(`needs at least one word after the category "${category}".`);
  if (properties.length === 0 || rest.length === 0) return problems;

  const at = findProperty(rest, properties);
  if (at === -1) {
    say(`"${category}" tokens need a property word (${properties.join(', ')}).`);
    return problems;
  }
  const early = rest.slice(0, at).find((s) => ORDERED_STATES.includes(s));
  if (early) say(`state "${early}" goes after the property: theme-${category}-…-{property}-${early}.`);
  return problems;
}
