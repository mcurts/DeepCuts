// `npm run deploy`: builds the app and uploads it to Cloudflare Pages (ADR-0029, Stage 4 H10).
// OFF BY DEFAULT (ADR-0024): it refuses to run unless DEEP_CUTS_DEPLOY=1 is set, and it is meant
// for the owner only, after the go-live checklist (docs repo: hosting/go-live-checklist.md). Agents and
// CI never run it.
//
// What goes live is exactly what was reviewed and merged:
// 1. Pre-flight (scripts/deployChecks.ts): on main, nothing uncommitted, the same commit as GitHub's
//    main, a real D1 database id in wrangler.toml, and the Pages secrets the API needs
//    (CANONICAL_HOST, ADR-0047), every file in migrations/ applied to the live database, and CI
//    green on the commit. Any problem stops it before anything runs.
// 2. The version (ADR-0049): worked out from the commits since the last `vX.Y.Z` tag
//    (scripts/releasePlan.ts). With nothing new, it's a redeploy of that version.
// 3. A fresh build with real accounts on (VITE_ACCOUNTS=cloudflare, ADR-0031) and the version baked
//    into the footer, so a stale or demo-only dist/ can never be uploaded by mistake.
// 4. The dist secret scan, then the upload.
// 5. Tags the deployed commit `vX.Y.Z`, pushes the tag and posts the release notes as a GitHub
//    Release, so a tag always names what went live. A redeploy makes no new tag.
//
// It uses Direct Upload (`wrangler pages deploy`), not Pages' Git integration, which would publish
// a public preview URL for every branch.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import {
  ciProblems,
  deployProblems,
  migrationProblems,
  parseAppliedMigrations,
  parseSecretNames,
  parseWorkflowRuns,
} from './deployChecks.ts'
import { commitsSince, latestTagVersion } from './releaseGit.mjs'
import { planRelease } from './releasePlan.ts'

if (process.env.DEEP_CUTS_DEPLOY !== '1') {
  console.error(
    '✗ Deploying is off by default (ADR-0024). If you are the owner and have followed\n' +
      '  hosting/go-live-checklist.md in the docs repo, run: DEEP_CUTS_DEPLOY=1 npm run deploy',
  )
  process.exit(1)
}

// Runs a command and returns its output, trimmed.
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

// 1. Pre-flight. Fetch first (tags too), so "the same as GitHub's main" and the last release
// compare against the latest.
git('fetch', '--quiet', '--tags', 'origin', 'main')
const head = git('rev-parse', 'HEAD')
const problems = deployProblems(
  {
    branch: git('branch', '--show-current'),
    status: git('status', '--porcelain'),
    head,
    originMain: git('rev-parse', 'origin/main'),
  },
  readFileSync('wrangler.toml', 'utf8'),
  // Names only: wrangler never prints secret values.
  parseSecretNames(
    execFileSync('npx', ['wrangler', 'pages', 'secret', 'list', '--project-name', 'deep-cuts'], {
      encoding: 'utf8',
    }),
  ),
)
// What the live database has run, read from wrangler's own record of it (the d1_migrations table),
// so a pending file is caught here instead of as a 500 after the upload. Read-only and free.
problems.push(
  ...migrationProblems(
    readdirSync('migrations'),
    parseAppliedMigrations(
      execFileSync(
        'npx',
        [
          'wrangler',
          'd1',
          'execute',
          'deep-cuts',
          '--remote',
          '--json',
          '--command',
          'SELECT name FROM d1_migrations',
        ],
        { encoding: 'utf8' },
      ),
    ),
  ),
)
// CI on the exact commit going out: every push to main runs it, so a red or unfinished run means
// this commit hasn't passed what every PR has to.
problems.push(
  ...ciProblems(
    parseWorkflowRuns(
      execFileSync(
        'gh',
        ['run', 'list', '--commit', head, '--json', 'workflowName,status,conclusion'],
        { encoding: 'utf8' },
      ),
    ),
  ),
)
if (problems.length) {
  console.error(['✗ Not deploying:', ...problems.map((p) => `  • ${p}`)].join('\n'))
  process.exit(1)
}

// 2. The version: the next one, or the last tag's when nothing has landed since.
const lastTag = latestTagVersion()
const plan = planRelease(lastTag, commitsSince(lastTag))
const version = plan?.version ?? lastTag

console.log(`
Cloudflare Workers Free limits (ADR-0029, as of 2026-10-07):
  • Static files: unlimited
  • Function + Worker requests (shared): 100,000 / day, reset 00:00 UTC.
    Past that, the API is skipped (fail open) and search shows "can't reach movie data". No charge.
  • CPU per request: 10 ms

⚠  NEVER upgrade this Cloudflare account to Workers Paid, and never add a payment method.
   On the Free plan, going over a limit fails; on Paid, it bills.

Deploying v${version}${plan ? ` (${plan.bump})` : ' again'}: ${head.slice(0, 7)} (${git('log', '-1', '--format=%s')})
`)

// 3. A fresh build with real accounts on and the version for the footer (vite.config.ts).
execFileSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_ACCOUNTS: 'cloudflare', DEEP_CUTS_VERSION: version },
})

// 4. The built files must not contain the TMDB token (or anything shaped like one).
execFileSync('node', ['scripts/check-dist-secrets.mjs'], { stdio: 'inherit' })
execFileSync(
  'npx',
  ['wrangler', 'pages', 'deploy', 'dist', '--project-name', 'deep-cuts', '--branch', 'main'],
  { stdio: 'inherit' },
)

// 5. Tag what just went live. Only after a successful upload: execFileSync throws on failure, so a
// failed deploy never gets a tag.
if (!plan) {
  console.log(`\nRedeployed v${version}; its tag is unchanged.`)
} else {
  const date = new Date().toLocaleDateString('en-CA')
  git('tag', '-a', `v${version}`, '-m', `v${version}, deployed ${date}`)
  git('push', '--quiet', 'origin', `v${version}`)
  console.log(`\n✓ Tagged and pushed v${version}.`)
  // The notes are a convenience: if posting them fails, the deploy and the tag still stand.
  try {
    execFileSync(
      'gh',
      ['release', 'create', `v${version}`, '--title', `v${version}`, '--notes', plan.notes],
      { stdio: 'inherit' },
    )
  } catch {
    console.warn(
      `⚠  Couldn't post the GitHub Release. Run: gh release create v${version} --generate-notes`,
    )
  }
}
