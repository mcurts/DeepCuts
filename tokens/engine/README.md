# site-builder engine

The design-token engine every site-builder site uses. DTCG 2025.10 source in; gated CSS, TypeScript, JSON, DTCG, Tailwind and email outputs out. The rules it enforces are in [`../standards/design-tokens.md`](../standards/design-tokens.md) and [`../standards/code-comments.md`](../standards/code-comments.md).

```
tokens.resolver.json ─┐                         ┌─ css/<site>.css           (:root + permutations, @layer tokens)
(DTCG Resolver 2025.10)│   resolve each input    ├─ css/contexts/…          (runtime-switchable axis values)
                      ├──► Style Dictionary ───► ├─ ts/<site>.js + .d.ts    (typed values, TokenName union)
tokens.config.json  ──┘   (aliases, transforms)  ├─ json/ · dtcg/ · manifest.json · contrast-report.json
(what to build)                  │                └─ tailwind/theme.css · email/<site>.json   (optional)
                                 ▼
                    gates: completeness · grammar · tiers · contrast
                    (nothing is written if any gate fails)
```

## Use it in a site

The engine is **vendored**: each site keeps a byte-identical copy, and `ENGINE.lock` proves it hasn't been edited (standards §7).

```bash
# from the site-builder repo: copy the engine into a site's token package
node engine/bin/sb.ts vendor ../lakemax/docs/tokens/engine

# in the site
node engine/bin/sb.ts build .              # build the token package in this folder
node engine/bin/sb.ts verify-engine        # CI: fail if the vendored copy was edited
node engine/bin/sb.ts check-comments src   # CI: standards/code-comments.md
node engine/bin/sb.ts codemod renames/2.0.0.json ../site/src            # rename CSS variables
node engine/bin/sb.ts codemod renames/2.0.0.tailwind.json src --mode tailwind
```

A token package holds two files:

- **`tokens.resolver.json`**: a standard [DTCG resolver document](https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/). `sets` hold what never varies; each `modifier` is one axis (palette, type, campaign…) and its `contexts` are that axis's values.
- **`tokens.config.json`**: what to build. The site name, the default `input`, the selector for each `permutation` (a mode such as `inverted`), `contexts` written for runtime switching, optional outputs, and the site's grammar additions. [`lib/types.ts`](lib/types.ts) documents every field.

## How it's built

| Module | Job |
|---|---|
| [`lib/resolver.ts`](lib/resolver.ts) | DTCG Resolver: validate the document and inputs, merge sets and contexts in order |
| [`lib/resolve.ts`](lib/resolve.ts) | The only Style Dictionary code: alias resolution and value transforms |
| [`lib/tiers.ts`](lib/tiers.ts) · [`lib/grammar.ts`](lib/grammar.ts) | Tier from the path root, allowed references, the naming grammar |
| [`lib/contrast.ts`](lib/contrast.ts) | WCAG 2.x contrast math and the gate |
| [`lib/emit.ts`](lib/emit.ts) · [`lib/tailwind.ts`](lib/tailwind.ts) | Pure output formats |
| [`lib/build.ts`](lib/build.ts) | Orchestration: resolve every input, run the gates, then write |
| [`lib/codemod.ts`](lib/codemod.ts) · [`lib/vendor.ts`](lib/vendor.ts) · [`lib/comments.ts`](lib/comments.ts) | Renames, distribution, comment checks |

Style Dictionary is used only in `resolve.ts`. Everything after it works on plain objects, which keeps the emitters easy to test and the tool swappable. The resolver is implemented here because Style Dictionary 5 doesn't read resolver documents yet. When it does, `resolver.ts` is the one file to replace.

## Develop

```bash
cd engine && pnpm install
pnpm test        # Vitest at 100% line and branch coverage (enforced)
pnpm typecheck   # tsc strict
```

`test/fixtures/site/` is a small site that uses every feature: two modifiers, a mode stacked as a context, Tier 3, fluid sizes, reduced motion, Tailwind and email outputs. Read it first if you're learning the config.

Releasing: bump `version` in `package.json` (semver; a change to an output format or gate is a minor, a config or CLI break is a major), add a line to `../CHANGELOG.md`, then re-vendor each site.
