# Design tokens

Every color, font, radius, shadow and motion value in Deep Cuts comes from a design token in `tokens/`. The tokens follow the site-builder **design tokens standard v1.0**: Brad Frost's three tiers, concept-first names, W3C DTCG 2025.10 JSON, and a DTCG resolver document for the themes. The site-builder engine (`tokens/engine/`, vendored) builds them, and Tailwind reads the result, so **a class name is always a token name**. The decision is ADR-0058 in the docs repo.

## The tiers

| Tier                | Folder                                                                                                                                 | Example                                                                | Who may use it                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **1 · Definitions** | `tokens/src/tier-1-definitions/` (shared ramps and scales), `tokens/src/themes/<id>/palette.json` (each theme's raw colors, free-form) | `color.orange.500`, `palette.mustard.default`, `space.4`               | Other tokens, plus Tailwind's spacing and type scales (`p-4`, `text-sm`). Never emitted as CSS variables. |
| **2 · Usage**       | `tokens/src/themes/<id>/*.json` (roles every theme fills) and `tokens/src/tier-2-usage/` (motion, the Halloween logo)                  | `theme.color.content.muted` → `text-content-muted`                     | Every component                                                                                           |
| **3 · Component**   | `tokens/src/tier-3-component/<component>.json`                                                                                         | `component.button.primary.background` → `bg-button-primary-background` | That component                                                                                            |

**Recorded deviation:** Tailwind's numeric spacing and type scales (`gap-2`, `text-sm`) read Tier 1 directly. That's the Tailwind idiom every Tailwind reader expects, and it's still one scale.

## Names

`theme-{category}-[{concept}-[{variant}-]]{property}[-{emphasis}][-{state}]`, concept before property. The Tailwind key is the name without `theme-color-` and without a trailing `default`.

| Token                                                                           | Class                                               |
| ------------------------------------------------------------------------------- | --------------------------------------------------- |
| `theme.color.background.default`                                                | `bg-background`                                     |
| `theme.color.content.muted`                                                     | `text-content-muted`                                |
| `theme.color.accent.background` + `theme.color.accent.content` (the text on it) | `bg-accent-background text-accent-content`          |
| `theme.color.content.accent` (accent-colored text on the page)                  | `text-content-accent`                               |
| `theme.color.border.accent`                                                     | `border-border-accent`                              |
| `theme.color.match-20.background` + `.content`                                  | `fill-match-20-background`, `text-match-20-content` |
| `component.field.border-invalid`                                                | `group-data-invalid:border-field-border-invalid`    |
| `theme.border.control.radius`, `component.button.radius`                        | `rounded-control`, `rounded-button`                 |
| `theme.shadow.box`, `component.popover.shadow`                                  | `shadow-box`, `shadow-popover`                      |
| `theme.font.display.family`                                                     | `font-display`                                      |

Some classes repeat a word (`border-border-accent`). That's on purpose: one name, grep-able in both the tokens and the code. shadcn/ui makes the same trade with `border-border`.

- **One token per property.** A color used as text, border and fill (the accent) gets `content-accent`, `border-accent` and `accent-background`, all aliasing the same palette color.
- **Signals.** Tags, genres, the page's contextual accent and the Top Ten star are categorical colors, not roles. They live in the site category `theme.signal.*` (`text-tag-liked`, `bg-genre-horror`, `var(--color-tag-${tag})`) and are contrast-checked everywhere they're used.
- **Domain numbers.** `match-0` to `match-80` name match-score thresholds, not values. They're listed with a reason in `tokens.config.json → grammar.allowedValueWords`.

## Themes

Each folder in `tokens/src/themes/` is one context of the `theme` modifier in `tokens.resolver.json`. It holds its own Tier 1 palette, plus the same Tier 2 roles as every other theme. The build writes every theme into `tokens/dist/css/deep-cuts.css`, in Tailwind's `theme` layer: the default on `:root`, and each theme under `[data-theme="<id>"]` with its `color-scheme`. All themes load with the app (about 2 kB each), so a saved theme is ready at the first paint. Only their fonts wait until a theme is chosen.

**The page accent** is the one place CSS re-points a token. In `src/index.css`, `page-accent-<tag>` sets `--theme-signal-contextual` to that tag's color with `var()`, so it follows the active theme. `scripts/check-token-tiers.mjs` allows direct token variables only in `src/index.css` and the two logo files.

### Add a theme

1. Copy a folder in `tokens/src/themes/` (start from the one closest in color scheme) and rename it; the folder name is the theme's id.
2. In `meta.json`, set `label`, `colorScheme`, `"default": false` and `fonts` (`npm install @fontsource/<name>`; list only the weights you use).
3. Add the theme as a context in `tokens/tokens.resolver.json` (copy another theme's six sources).
4. Change the values in `palette.json` and the role files, keeping every role name.
5. `npm run tokens`. The build fails if a role is missing or extra, if a name breaks the grammar, or if any declared contrast pair fails (WCAG 1.4.3, 1.4.11). `npm run check:contrast` checks the colors the page mixes at runtime.
6. `npm run dev` and pick it in the footer, or open any page with `?theme=<id>`. The chooser, Storybook's toolbar, the boot script and the CI checks all read the folders.

## Outputs (`npm run tokens`, generated, not committed)

| File                                                                  | For                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `tokens/dist/css/deep-cuts.css`                                       | Every theme's Tier 2 and 3 values (imported by `src/index.css`)                                        |
| `tokens/dist/tailwind/theme.css`                                      | The Tailwind `@theme` (imported by `src/index.css`)                                                    |
| `tokens/dist/json/contexts/theme.json`                                | Every theme's resolved values (`scripts/theme-files.mjs`, `check:contrast`)                            |
| `tokens/dist/json/deep-cuts.json` · `ts/` · `dtcg/` · `manifest.json` | The default theme for scripts (`npm run icons`), typed values, Figma and Tokens Studio, and LLM agents |
| `src/styles/themes.ts` · `theme-fonts.css` · `public/theme-boot.js`   | The theme chooser, the default theme's fonts, and the pre-paint theme script                           |

## Contrast

Every text color declares the grounds it must be legible on, in its token's `$extensions["com.mikecurts.contrast"]`. The build checks them in every theme: 444 pairings. Colors the page mixes at runtime with `color-mix()` (a genre tone bleached toward the sticker paper) exist only in CSS, so `npm run check:contrast` checks those 40 pairs, listed in `scripts/mixed-contrast-pairs.json`.

## Renaming a token

A rename is a breaking change to the tokens. Write a map (`{ "old-key": "new-key" }`) and apply it with the engine's codemod, never by hand:

```bash
node tokens/engine/bin/sb.ts codemod renames.json src e2e --mode tailwind   # class names
node tokens/engine/bin/sb.ts codemod renames.json src e2e                   # CSS variables
```
