# AGENTS.md: instructions for any AI agent

The source of truth for this repo is the files in it, not chat history.

## Start here

- Comments cite design decisions as `ADR-NNNN`. The records live in a separate, private docs repo (checked out as `../deep-cuts-docs` when you have it). Accepted ADRs are binding; a change of direction needs a new ADR, written as Proposed for the owner to approve.

## Rules

- The owner approves every technology and design choice. Propose options with a recommendation; never decide alone.
- `npm run verify` must pass before every commit. It runs lint, typecheck, contrast, coverage, build and the dist secret check.
- Tokens follow Brad Frost's tiers (ADR-0027); the Tailwind theme is generated from them, so a class name is a token name. Brands are themes: one folder each in `tokens/themes/`, all with the same roles (ADR-0056, recipe in `tokens/README.md`), so never style for one theme; use roles, `rounded-*` radius roles and `case-display` instead of `uppercase` for display text. Use component tokens where they exist (`bg-card-bg`, `rounded-button`), else semantic ones (`text-fg-muted`, `rounded-container`). Raw colors and the raw radius/shadow scale fail lint. Change tokens in `tokens/`, never `src/styles/`.
- Style with Tailwind classes. A component whose look classes can't express readably (e.g. the 3D `VhsBox`) gets a co-located stylesheet (`X.css`, imported by `X.tsx`) that starts with an `@reference` to `src/index.css` (relative, e.g. `@reference "../../index.css";`), keeps its rules in `@layer components`, uses tokens through `@apply` (type, spacing), `--theme()` (motion and other build-time values) and the theme's color variables (runtime), and never raw `--dc-*` variables. It loads with its component's code instead of on every page.
- Comment generously so the owner can read the code. Every new file starts with a short header saying what it is for and how it fits (with its ADR). Every exported function, component, hook and type gets a doc comment in plain language. Inside, comment each step of non-obvious logic and the _why_ behind rules, numbers and workarounds. Skip comments that only repeat the code.
- Every component in `src/components/`, and every page-private component with visual states, gets a Storybook story (`X.stories.tsx`) covering its states, titled after its folder (`Components/UI/Icon`, `Pages/Discover/PickActions`); `npm run storybook:test` (CI) runs axe on every story.
- Browser storage only in `src/adapters/local/`. No `dangerouslySetInnerHTML`. Validate external data with Zod.
- Secrets never go in `VITE_*` vars.
- Responsive, mobile-first (ADR-0021): base styles target 390px; enhance with `md:`/`lg:`; no horizontal overflow at 320px.
- Save tokens: prefer local scripts and CLIs over LLM generation; keep output terse.

## Where files go (ADR-0046)

One rule: **a file lives next to the only thing that uses it; once two or more places use it, it moves to the shared folder for its kind.**

| Folder                   | What goes in it                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/routes/<page>/`     | A page (`DiscoverPage.tsx`) and everything only that page uses: its private components, helpers, CSS, stories and tests. Folder names are the page name in kebab-case (`movie-detail/`).                     |
| `src/routes/` (root)     | Route plumbing the router imports directly: layouts, guards and fallbacks (`AppLayout`, `RequireAccount`, `IndexRoute`, `PlaceholderPages`), and screen tests that span several pages (`accounts.test.tsx`). |
| `src/components/ui/`     | Shared building blocks that know nothing about films or accounts: they would work in any app (`Icon`, `Eyebrow`, `EmptyState`).                                                                              |
| `src/components/layout/` | The app shell around every page: logo, skip link, account chip, footer, toasts.                                                                                                                              |
| `src/components/movie/`  | Shared components and display helpers that show or act on a film (`VhsBox`, `CassetteCard`, `TagToggle`, `tagDisplay.ts`).                                                                                   |
| `src/hooks/`             | React hooks used by two or more folders.                                                                                                                                                                     |
| `src/domain/`            | Pure product logic (no React, no browser APIs): tags, ranking, the scorer. Also used by `server/`.                                                                                                           |
| `src/adapters/`          | Storage and session ports and their local and Cloudflare implementations (ADR-0013, ADR-0031).                                                                                                               |
| `src/session/`           | React Query hooks over the signed-in account's data (tags, Top Ten, recommendations).                                                                                                                        |
| `src/api/`               | The TMDB client and its queries.                                                                                                                                                                             |
| `src/config/`            | Static app configuration and content (feature flags, brand, the three panels).                                                                                                                               |
| `src/test/`              | Test setup, MSW handlers and fixtures.                                                                                                                                                                       |
| `server/`                | Node and Workers code: security headers, rate limiting, `tmdb/` (the TMDB proxy) and `accounts/`.                                                                                                            |
| `scripts/`               | Build, check and deploy scripts.                                                                                                                                                                             |
| `src/` (root)            | The entry points and app-wide singletons: `main.tsx`, `router.tsx`, `index.css`, `notify.ts` (toasts), `env.d.ts`. `src/styles/` is generated from `tokens/`; never edit it.                                 |

- A file's tests (`X.test.ts`), stories (`X.stories.tsx`) and stylesheet (`X.css`) sit next to it.
- No `index.ts` barrel files and no folder per component: import the file itself.
- Imports in `src/`: `./x` within the folder (or below it), `@/x` (meaning `src/x`) for anything else. `../` fails lint. `src/domain/`, `src/adapters/` and `src/test/msw/` are the exception: `server/`, `functions/` and Playwright import them, and those tools don't know `@/`, so they keep relative imports (also enforced by lint).
- A part used only by one shared component (e.g. `GenreSticker` inside `VhsBox`) sits beside it in the same shared folder. That follows the rule: it lives next to its only user.
- When a page-private file gains a second user, move it to the shared folder in the same PR.

## Version control

- Commit after each working step, using Conventional Commits (`feat`, `fix`, `test`, `docs`, `design`, `chore`, `refactor`), with a body that says **what** changed and **why**, and names the ADRs involved.
- `npm run verify` passes before every commit.
- **Mark breaking changes (ADR-0048).** Versions follow SemVer, read from commit types at deploy: `feat` is a minor release; `fix`, `perf`, `design`, `style`, `copy` are a patch; the rest ship with the next one. A change that makes a returning user lose something or redo it (a bookmarked URL stops working, saved data needs a one-way migration or is dropped, an `/api` change breaks the copy of the app still open in a tab, or a browser stops being supported) is a major: write `type!:` and add a `BREAKING CHANGE:` footer saying what users lose.
- **Versions come from the deploy (ADR-0049).** `npm run deploy` (owner-only) works out the version from commits since the last `vX.Y.Z` tag, shows it in the footer, tags the commit and posts the release notes as a GitHub Release. There are no release PRs, version commits or changelog file. `npm run version:next` previews the next version. Agents never tag, create releases or deploy.
- Only source belongs here: no decision records, design files, reviews or notes (those go to the docs repo).

## Pull requests (the owner approves and merges)

- **Never commit to or push `main` directly.** All work happens on a branch (`feat/…`, `fix/…`, `chore/…`, `docs/…`).
- Pushing your **own working branch** to open or update a pull request is allowed. **Only the owner merges.** Agents never merge, force-push shared branches, or change branch or repository settings.
- Prefer **fewer, larger PRs**: group related work (for example, a whole build stage) into one PR, with one commit per working step inside it.
- Open PRs with `gh pr create`. The description says what changed and why, lists the ADRs involved, how it was tested, and anything the owner should check by hand.
- Before opening or updating a PR, run **`npm run ci:local`**. It runs exactly what CI runs.
- After pushing, watch CI (`gh pr checks --watch`). If it fails, read the log (`gh run view --log-failed`), fix it on the branch and push again. **Only hand a PR to the owner when CI is green.**
- **Security check-in on every PR.** Before handover, review the diff for anything questionable: secrets or tokens, new network calls or endpoints, input that skips Zod, HTML injection, storage outside `src/adapters/local/`, weakened headers or CSP, new dependencies (`npm audit`, maintainer, install scripts), anything that could bill (ADR-0024). Flag attack-surface changes so the threat model (docs repo) gets updated, and add a "Security check-in" section to the PR description with what was checked and found.
- After the owner merges: `git switch main && git pull`, then delete the local branch. When the merged work should go live, tell the owner it's ready to deploy, with `npm run version:next`'s version.

## Keep local and CI identical

Local passes must mean CI passes. Today's sources of drift, and what prevents them:

- **Node version:** CI uses `.nvmrc` (24). `.npmrc` sets `engine-strict`, so npm refuses other versions. Run `nvm use` first.
- **TMDB token:** tests never call TMDB. Unit tests fail on any unmocked request (MSW `onUnhandledRequest: 'error'`). E2E blocks unmocked `/api/tmdb/**` requests and starts its server with the token blanked, even when `.env.local` has one.
- **Stale servers:** Playwright always builds and starts a fresh preview server (`reuseExistingServer: false`).
- **Fonts and rendering:** Linux CI renders text slightly differently from macOS, so layout-sensitive checks (overflow, axe scroll rules) can only be trusted on CI. That's why every change goes through a PR before `main`.
- **Lockfile:** generate it with the CI Node version (`nvm use && npm install`). CI runs `npm ls --all`, which fails on peer conflicts or orphaned packages.
