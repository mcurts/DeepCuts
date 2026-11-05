# tokens/

Deep Cuts' design tokens: the DTCG 2025.10 source (`src/`), the resolver document (`tokens.resolver.json`), what to build (`tokens.config.json`), and the site-builder engine (`engine/`, vendored; don't edit it here). `npm run tokens` builds `dist/` (gitignored), then `scripts/theme-files.mjs` writes the app files that come from the themes.

How it works, and how to add a theme or change a token: [`../docs/design-tokens.md`](../docs/design-tokens.md).
