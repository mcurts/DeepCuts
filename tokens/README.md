# Design tokens (ADR-0006, ADR-0023, ADR-0027, ADR-0056)

DTCG 2025.10 JSON, built by Style Dictionary (`npm run tokens`) into every output. The structure follows Brad Frost's three tiers: each tier may only reference the tier below it (`npm run lint` checks this). Brands sit on top as themes: every theme fills the same roles with its own values, so components never know which one is on.

| Tier        | Folder                     | What it holds                                                                                                                                                                                 | Who may use it                                                            |
| ----------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1 Primitive | `primitive/`               | Shared raw values: generated hue ramps (`hues.json`, `npm run tokens:ramps`), spacing, sizes, blur (`dimension.json`), the type scale (`typography.json`), `motion.json`. Tailwind's defaults | Other tokens. In code only the spacing and type scales (`p-4`, `text-sm`) |
| 1 Palette   | `themes/<id>/palette.json` | One brand's raw colors, named as the brand likes                                                                                                                                              | That theme's roles                                                        |
| 1 Brand     | `brand/`                   | Seasonal logo costumes (Halloween)                                                                                                                                                            | Only the holiday logo files                                               |
| 2 Semantic  | `semantic/`                | Roles every theme shares: motion                                                                                                                                                              | Components and component tokens                                           |
| 2 Theme     | `themes/<id>/`             | A brand's roles: colors, type, shape and elevation, textures, logo colors                                                                                                                     | Components and component tokens                                           |
| 3 Component | `component/`               | Card, button, field, popover, tag toggle, slider, poster, sticker, VHS box                                                                                                                    | That component                                                            |

## Themes (ADR-0056)

Each folder in `themes/` is one look the app can switch to (the footer's "Look" chooser). One is the default (`"default": true`), applied under `:root`; the others apply under `<html data-theme="<id>">`.

| File           | What it holds                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `meta.json`    | Not tokens: the label the chooser shows, `colorScheme` (`light` or `dark`), the `@fontsource` stylesheets it needs |
| `palette.json` | The brand's raw colors (free-form; not part of the contract)                                                       |
| `color.json`   | Color roles: surfaces, text, accent, highlight (the second accent: CTA fills, headline words), tags, genres, print |
| `type.json`    | Font families (display, body, label) and display weight, tracking and letter case (`case-display`)                 |
| `shape.json`   | Corner radius roles (`control`, `container`), shadow roles (`elevation.*`) and the headline text-shadow offset     |
| `texture.json` | Film grain, scratches and halftone strength (0 turns one off)                                                      |
| `logo.json`    | The wordmark's colors (`brand.logo.*`)                                                                             |

**Themeable:** everything above. **Shared:** spacing, the type scale, breakpoints, motion, the genre hue ramps (themes pick steps from them) and the seasonal logo costumes.

### Add a theme

1. Copy a folder in `themes/` (start from the one closest in mode, light or dark) and rename it; the folder name is the theme's id.
2. In `meta.json`, set `label`, `colorScheme`, `"default": false` and `fonts` (install any new face with `npm install @fontsource/<name>`; list only the weights you use).
3. Change the values in the other files. Keep every role name: the build and `npm run lint` fail if a role is missing or new (add a new role to every theme, default first).
4. Run `npm run check:contrast`. Every pair in `scripts/contrast-pairs.json` must pass in every theme, so adjust until it does.
5. `npm run dev` and pick it in the footer, or open any page with `?theme=<id>`. In Storybook, use the toolbar's Theme menu.

Nothing else changes: the chooser, Storybook's toolbar, the boot script and the CI checks all read the folders.

## Names in code

`src/styles/theme.css` (the Tailwind theme) is **generated**, so a class name is always the token name: the token path without its namespace and a trailing `default`.

| Token                     | Tailwind               |
| ------------------------- | ---------------------- |
| `color.surface.default`   | `bg-surface`           |
| `color.fg.muted`          | `text-fg-muted`        |
| `color.button.primary.bg` | `bg-button-primary-bg` |
| `radius.button`           | `rounded-button`       |
| `radius.container`        | `rounded-container`    |
| `elevation.box`           | `shadow-box`           |
| `font.family.display`     | `font-display`         |

Prefer a component token when the component has one, else a semantic one. Colors, fonts, corners and shadows reach CSS through variables, so a theme or the page accent (ADR-0020) can swap them at runtime. Display text that carries the brand's letter case uses `case-display`, not `uppercase`.

## Outputs (generated, not committed)

- `src/styles/tokens.css`: the shared tiers as CSS variables (`--dc-*`)
- `src/styles/themes/<id>.css`: each theme's palette and roles under its `data-theme` (the default also under `:root`), imported through `src/styles/themes.css`
- `src/styles/theme.css`: the Tailwind theme
- `src/styles/themes.ts`: the list of themes the chooser reads; `src/styles/theme-fonts.css`: the default theme's fonts
- `public/theme-boot.js`: applies a saved or linked theme before the first paint
- `build/tokens/<id>/tokens.json` (flat, for checks; the default also at `build/tokens/tokens.json`), `build/tokens/js/` (typed ES module for SVG/canvas and React Native), `build/figma/deep-cuts.tokens.json` (DTCG 2025.10, importable as Figma variables), both from the default theme

Every color pair in `scripts/contrast-pairs.json`, semantic and component, is contrast-checked in CI, for every theme.
