# Deep Cuts

A fast, very visual, one-thumb movie tracker. Tag films (Want to see, More like this, Less like this) in a tap or two, and it surfaces deep cuts you've never heard of.

> Status: **live** since 2026-10-08 (Cloudflare Pages, invite-only passkey accounts; not indexed by search engines). Recommendations from your likes (ADR-0032), film details, tagging, My Lists and a demo sign-in all work locally too. ADR-0033 makes Welcome the primary home and recommendation surface, with no separate Discover route. You're either signed in or signed out (ADR-0034): signed out, `/` is a landing page that explains Top Ten, Movies I want to watch and Discovery in the same panels Home uses (ADR-0035). A responsive, mobile-first website (ADR-0021).

## Run locally

Requires Node 24 LTS (`.nvmrc`; `nvm use`). Node 25 is not supported by the test tooling.

```sh
cp .env.example .env.local   # add your TMDB read token (server-side only, never VITE_)
npm install
npm run dev
```

## Quality gates

| Command                  | What it checks                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `npm run verify`         | Everything below, as CI runs it                                                              |
| `npm run lint`           | ESLint (strict TS, jsx-a11y strict, storage/XSS bans), no raw colors, no secret `VITE_` vars |
| `npm run typecheck`      | TypeScript strict                                                                            |
| `npm run check:contrast` | Every semantic token pair meets WCAG 2.2 AA                                                  |
| `npm run coverage`       | Vitest + Testing Library, ≥ 80% lines                                                        |
| `npm run check:dist`     | No token in the built bundle                                                                 |
| `npm run check:bundle`   | The build stays within its size budget (first visit ≤ 230 kB gzipped)                        |

CI also runs `npm audit` and gitleaks (secret scan of the whole git history). Actions are pinned by SHA. CodeQL scans the code on every pull request and weekly.

## Other scripts

| Command                    | What it does                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run dev`              | Dev server at http://localhost:5173 (builds the tokens first)                                 |
| `npm run build`            | Production build into `dist/`                                                                 |
| `npm run preview`          | Serves `dist/` at http://localhost:4173 with the production security headers                  |
| `npm run analyze`          | Production build plus a treemap of the bundle at `build/bundle-report.html`                   |
| `npm run storybook`        | Storybook at http://localhost:6006: every shared component, in each state, with an a11y panel |
| `npm run storybook:test`   | Builds Storybook and checks every story with axe (a CI gate)                                  |
| `npm run icons`            | Regenerates the favicon, app icons and manifest from the brand tokens                         |
| `npm run e2e`              | Playwright browser tests against a fresh production build                                     |
| `npm run e2e:cf`           | The security, hosting and passkey-account E2E tests against the Cloudflare runtime            |
| `npm run preview:cf`       | Serves `dist/` on Cloudflare's runtime locally (see Hosting below)                            |
| `npm run preview:accounts` | Builds with real accounts on, migrates the local D1 database and runs `preview:cf`            |
| `npm run db:migrate:local` | Applies `migrations/` to the local D1 database (never the real one)                           |
| `npm run invite`           | Creates a local sign-up invite and prints its link (see Accounts below)                       |
| `npm run ci:local`         | Exactly what GitHub CI runs; run before opening a PR                                          |
| `npm run tokens`           | Builds the design tokens (`tokens/`) into CSS, the Tailwind theme, JS and Figma JSON          |
| `npm run tokens:ramps`     | Regenerates the color ramps in `tokens/primitive/hues.json`                                   |
| `npm run format`           | Formats every file with Prettier                                                              |

## Hosting

The app is hosted on **Cloudflare Pages** (ADR-0029). This public repo doesn't name the live address (ADR-0047): the API's host pin reads it from the `CANONICAL_HOST` Pages secret, and the API refuses every request (and `npm run deploy` refuses to run) until that secret is set. The Pages project's own `*.pages.dev` address is refused too. Only the owner deploys; nothing here runs a deploy for you. Local development needs no Cloudflare account.

**Try the hosted runtime locally:** `npm run build && npm run preview:cf` serves the app at http://localhost:8788 with the real Pages Function (the TMDB proxy), the rate-limit Worker, the generated `_headers` and SPA routing. For the TMDB token, copy `.dev.vars.example` to `.dev.vars` (git-ignored); if it's missing, Wrangler falls back to `.env.local`.

| Free-plan limit (ADR-0029, as of 2026-10-07) | Value                          | When exceeded                                                                    |
| -------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| Static asset requests                        | Unlimited                      | —                                                                                |
| Function + Worker requests (shared)          | 100,000 / day, reset 00:00 UTC | The API is skipped (fail open); search shows "can't reach movie data"; no charge |
| CPU time per request                         | 10 ms                          | Request errors                                                                   |
| Per-client API rate limit (ours)             | 120 requests / 60 s            | 429 `rate_limited` (approximate: counted per location, so bursts get through)    |

> ⚠️ **Never upgrade the Cloudflare account to Workers Paid and never add a payment method.** On the Free plan, going over a limit fails; on Paid, it bills (ADR-0024).

**Deploying** is a manual owner step (first go-live: 2026-10-08). For later deploys, follow the hosting checklist in the docs repo. The deploy command, `DEEP_CUTS_DEPLOY=1 npm run deploy`, refuses to run without that flag, and only deploys a clean `main` that matches GitHub. It builds fresh with accounts on, so what goes live is exactly what was merged.

## Versions and releases

Every deploy is a release (ADR-0048, ADR-0049). The version follows SemVer and is worked out from the Conventional Commit types since the last `vX.Y.Z` tag: `feat` is a minor release, `fix`/`perf`/`design`/`style`/`copy` a patch, and `type!:` or a `BREAKING CHANGE:` footer a major (something a returning user loses or must redo). Maintenance alone ships as a patch.

- `npm run version:next` shows the version and release notes the next deploy would ship.
- `DEEP_CUTS_DEPLOY=1 npm run deploy` builds that version into the footer, deploys, tags the commit and posts the notes as a GitHub Release. Run it again with nothing new and it redeploys the same version without a new tag.
- Builds outside a deploy (dev server, tests, CI) say "dev build" in the footer.

## Accounts (opt-in)

Real accounts use **passkeys** and **invite-only** sign-up, with data in **Cloudflare D1** (ADR-0031). They're off by default: `npm run dev` and the demo keep the local practice provider, so nothing needs setting up. "Try the demo" always stays on the device, so reviewers never need an account.

**Try them locally** (no Cloudflare account needed):

```sh
npm run preview:accounts   # build with VITE_ACCOUNTS=cloudflare, migrate local D1, serve on :8788
npm run invite             # in a second terminal: prints http://localhost:8788/register?invite=…
```

Open the link, enter a name and press **Create passkey** (your browser or password manager stores it). Sign out, then **Sign in with a passkey**. `npm run invite -- --days 3` changes the lifetime (default 7 days); `npm run invite -- --recover <userId>` makes a recovery invite that adds a passkey to an existing account. Only a hash of each invite code is stored, so the printed link is the only copy.

Sessions last 30 days and renew on use; the cookie is `__Host-dc_session` (`HttpOnly`, `Secure`, `SameSite=Lax`), and only its SHA-256 is stored. On plain `http://localhost` only, it's `dc_session` without `Secure`, because Safari won't keep a `Secure` cookie over http. Signed-in people can rename themselves or delete their account (Account page).

| Free-plan limit (ADR-0031, as of 2026-10-07) | Value                         | When exceeded               |
| -------------------------------------------- | ----------------------------- | --------------------------- |
| D1 rows read                                 | 5 million / day               | Queries fail; no charge     |
| D1 rows written                              | 100,000 / day                 | Queries fail; no charge     |
| D1 storage                                   | 5 GB                          | Writes fail; no charge      |
| Sign-in / sign-up rate limit (ours)          | 10 requests / 60 s per client | 429 `rate_limited`          |
| CPU per passkey check (measured locally)     | ~0.3 ms typical, ~2 ms cold   | 10 ms limit; request errors |

`npm run invite -- --remote --base https://<live address>` writes to the real database. It's for the owner only, after go-live (see the checklist).

## Project structure

```
src/
  routes/<page>/   one folder per page, with everything only that page uses
  components/      shared components: ui/ (generic), layout/ (app shell), movie/ (films)
  hooks/ domain/ adapters/ session/ api/ config/ test/
server/            Node + Workers code: headers, rate limiting, tmdb/ proxy, accounts/
functions/         Cloudflare Pages Functions (the hosted API)
workers/           the rate-limit Worker
scripts/           build, check and deploy scripts
tokens/            design tokens (source for the Tailwind theme)
e2e/               Playwright tests
```

Rules for where a file goes, and how imports are written (`@/` means `src/`), are in [AGENTS.md](AGENTS.md#where-files-go-adr-0046) (ADR-0046).

## Configuration

Most config files explain themselves in comments. These formats can't hold comments, so they're described here:

| File                | What it sets                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`      | Dependencies and the scripts above. `engines` limits Node to 24 LTS or 26+, enforced by `.npmrc`. `overrides` lifts Wrangler's local runtime (miniflare) from `sharp` 0.35.4 to the patched 0.35.5 (a high-severity librsvg CVE) and its `undici` from 7.29.1 to the patched 7.30.1 (GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472, GHSA-xjj6-f33q-929c); remove each once Wrangler ships the fix |
| `package-lock.json` | The exact dependency versions; CI installs exactly these (`npm ci`). Regenerate on Node 24 only                                                                                                                                                                                                                                                                                              |
| `.nvmrc`            | The Node version (`24`); `nvm use` picks it up, and CI reads it too                                                                                                                                                                                                                                                                                                                          |
| `.prettierrc.json`  | Code formatting: single quotes, no semicolons, 100-character lines, and Tailwind class sorting (using `src/index.css`'s theme)                                                                                                                                                                                                                                                               |
| `.prettierignore`   | Files Prettier skips: build output, generated files, the lockfile and docs                                                                                                                                                                                                                                                                                                                   |

Other config: `vite.config.ts` (dev server, build, unit tests), `server/securityHeaders.ts` (the security headers, for every runtime), `wrangler.toml` + `workers/rate-limit/wrangler.toml` (Cloudflare Pages and the rate-limit Worker, no secrets), `playwright.config.ts` / `playwright.cf.config.ts` (E2E), `eslint.config.js` (lint rules), `tsconfig*.json` (TypeScript), `sd.config.mjs` (design tokens), `.github/` (CI, CodeQL, Dependabot), `.githooks/pre-commit` (local secret scan).

## Decisions and docs

Comments cite design decisions as `ADR-NNNN`. The decision records, design artwork, reviews, threat
model and hosting checklist are kept in a separate private docs repository, so this one holds
source only. [SECURITY.md](SECURITY.md) covers reporting a vulnerability.

## License

All rights reserved: the code is public for review only, not open source. No one may use, copy, change or redistribute it without written permission; see [LICENSE](LICENSE). Film data and images come from [TMDB](https://www.themoviedb.org/) under its own terms and aren't covered; this product uses the TMDB API but is not endorsed or certified by TMDB. Fonts and other dependencies keep their own licenses.
