// The checks `npm run deploy` (scripts/deploy.mjs) makes before it uploads anything (ADR-0029).
// Pure functions over plain facts (git state, the config text), so they're unit-tested here and the
// script only gathers the facts and acts on the answer.
//
// The rule they enforce: what goes live is exactly what was reviewed and merged. That means main,
// nothing uncommitted, nothing unpushed or unpulled, a real database id in wrangler.toml, the
// Pages secrets the API can't run without, every migration already applied to the live database,
// and green CI on the exact commit going out.
import { z } from 'zod'

/** The all-zero id wrangler.toml ships with until the owner creates the D1 database. */
export const PLACEHOLDER_DATABASE_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Pages secrets the production API needs. CANONICAL_HOST is the site address for the host pin,
 * kept out of the public repo (ADR-0047); without it every /api/* request gets a 500.
 */
export const REQUIRED_SECRETS = ['CANONICAL_HOST'] as const

/**
 * The secret names in `wrangler pages secret list` output, whose lines look like
 * `  - TMDB_READ_TOKEN: Value Encrypted`.
 */
export function parseSecretNames(listOutput: string): string[] {
  return [...listOutput.matchAll(/^\s*-\s*([A-Za-z0-9_]+):/gm)].map((m) => m[1])
}

/** What the deploy script learns from git before deciding. */
export type GitState = {
  /** The current branch name (empty when detached). */
  branch: string
  /** `git status --porcelain` output: empty when nothing is uncommitted. */
  status: string
  /** The commit being deployed (`git rev-parse HEAD`). */
  head: string
  /** The commit GitHub has for main, just fetched (`git rev-parse origin/main`). */
  originMain: string
}

/**
 * Every reason the deploy must stop, in plain words for the owner. Empty means go.
 * @param git - The repository's state (see {@link GitState}).
 * @param wranglerToml - The text of wrangler.toml.
 * @param secretNames - The production Pages secrets that exist (see {@link parseSecretNames}).
 */
export function deployProblems(
  git: GitState,
  wranglerToml: string,
  secretNames: readonly string[],
): string[] {
  const problems: string[] = []
  if (git.branch !== 'main')
    problems.push(`You're on "${git.branch || 'a detached HEAD'}". Deploy only from main.`)
  if (git.status.trim() !== '')
    problems.push('There are uncommitted changes. Commit them through a PR, or stash them.')
  if (git.head !== git.originMain)
    problems.push(
      "This main isn't the same as GitHub's. Run `git pull` (and push nothing to main directly).",
    )
  if (wranglerToml.includes(PLACEHOLDER_DATABASE_ID))
    problems.push(
      'wrangler.toml still has the placeholder D1 database_id. Create the database first ' +
        '(go-live checklist, step 3) and merge its id.',
    )
  for (const name of REQUIRED_SECRETS)
    if (!secretNames.includes(name))
      problems.push(
        `The Pages secret ${name} isn't set. Run ` +
          `\`npx wrangler pages secret put ${name} --project-name deep-cuts\` first.`,
      )
  return problems
}

/**
 * The migration names recorded in the live database, from the JSON that
 * `wrangler d1 execute deep-cuts --remote --json --command "SELECT name FROM d1_migrations"` prints:
 * one entry per statement, each with its result rows. Zod checks the shape, so a change in
 * wrangler's output stops the deploy instead of passing it by mistake.
 */
export function parseAppliedMigrations(executeJson: string): string[] {
  const statements = z
    .array(z.object({ results: z.array(z.object({ name: z.string() })) }))
    .parse(JSON.parse(executeJson))
  return statements.flatMap((s) => s.results.map((row) => row.name))
}

/**
 * Why the deploy must stop over migrations: any file in `migrations/` the live database hasn't
 * run yet. Code that needs a missing table or column answers 500, and migrations work with the
 * previous deploy's code (AGENTS.md), so applying them first is always safe.
 * @param files - The `.sql` file names in `migrations/`.
 * @param applied - The names the live database has run (see {@link parseAppliedMigrations}).
 */
export function migrationProblems(files: readonly string[], applied: readonly string[]): string[] {
  const pending = files.filter((f) => f.endsWith('.sql') && !applied.includes(f)).sort()
  if (pending.length === 0) return []
  return [
    `The live database hasn't run ${pending.join(', ')}. Run ` +
      '`npx wrangler d1 migrations apply deep-cuts --remote` first.',
  ]
}

/** One GitHub Actions workflow run, as `gh run list --commit <sha> --json ...` prints it. */
const workflowRun = z.object({
  workflowName: z.string(),
  status: z.string(),
  // Empty until the run finishes.
  conclusion: z.string(),
})

/** A workflow run on the commit being deployed (see {@link parseWorkflowRuns}). */
export type WorkflowRun = z.infer<typeof workflowRun>

/** The runs in `gh run list --commit <sha> --json workflowName,status,conclusion` output. */
export function parseWorkflowRuns(listJson: string): WorkflowRun[] {
  return z.array(workflowRun).parse(JSON.parse(listJson))
}

/**
 * Why the deploy must stop over CI: the commit going out has no CI run, a run still going, or a
 * run that didn't pass. Every push to main runs CI and CodeQL, so merged work always has runs;
 * a skipped run (nothing to do) counts as a pass.
 * @param runs - The workflow runs on the commit (see {@link parseWorkflowRuns}).
 */
export function ciProblems(runs: readonly WorkflowRun[]): string[] {
  if (!runs.some((r) => r.workflowName === 'CI'))
    return [
      "CI hasn't run on this commit. Wait for it after the merge (`gh run list --branch main`).",
    ]
  const problems: string[] = []
  for (const r of runs) {
    if (r.status !== 'completed')
      problems.push(`${r.workflowName} is still running on this commit. Wait for it to finish.`)
    else if (r.conclusion !== 'success' && r.conclusion !== 'skipped')
      problems.push(
        `${r.workflowName} ended "${r.conclusion}" on this commit. Fix main through a PR first.`,
      )
  }
  return problems
}
