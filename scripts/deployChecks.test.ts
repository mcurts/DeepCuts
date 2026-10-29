// @vitest-environment node
// Tests for the deploy pre-flight (scripts/deployChecks.ts): only reviewed, merged main with a real
// database id, the required Pages secrets, every migration applied and green CI may go live.
import { describe, expect, it } from 'vitest'
import {
  ciProblems,
  deployProblems,
  migrationProblems,
  parseAppliedMigrations,
  parseSecretNames,
  parseWorkflowRuns,
  PLACEHOLDER_DATABASE_ID,
  type GitState,
  type WorkflowRun,
} from './deployChecks'

const clean: GitState = { branch: 'main', status: '', head: 'abc123', originMain: 'abc123' }
const config = 'database_id = "5f0c2a8e-1111-4222-8333-944455556666"'
const secrets = ['TMDB_READ_TOKEN', 'CANONICAL_HOST']

describe('deployProblems', () => {
  it('lets clean, up-to-date main with a real database id through', () => {
    expect(deployProblems(clean, config, secrets)).toEqual([])
  })

  it('refuses another branch, or a detached HEAD', () => {
    expect(deployProblems({ ...clean, branch: 'feat/x' }, config, secrets)[0]).toMatch(/"feat\/x"/)
    expect(deployProblems({ ...clean, branch: '' }, config, secrets)[0]).toMatch(/detached HEAD/)
  })

  it('refuses uncommitted changes', () => {
    expect(deployProblems({ ...clean, status: ' M src/main.tsx\n' }, config, secrets)).toHaveLength(
      1,
    )
  })

  it("refuses a main that differs from GitHub's", () => {
    expect(deployProblems({ ...clean, originMain: 'def456' }, config, secrets)[0]).toMatch(
      /git pull/,
    )
  })

  it('refuses the placeholder database id', () => {
    const toml = `database_id = "${PLACEHOLDER_DATABASE_ID}"`
    expect(deployProblems(clean, toml, secrets)[0]).toMatch(/placeholder D1 database_id/)
  })

  it('refuses a missing CANONICAL_HOST secret (ADR-0047)', () => {
    expect(deployProblems(clean, config, ['TMDB_READ_TOKEN'])[0]).toMatch(
      /secret put CANONICAL_HOST/,
    )
  })

  it('lists every problem at once', () => {
    const git = { branch: 'x', status: '?? a', head: '1', originMain: '2' }
    expect(deployProblems(git, PLACEHOLDER_DATABASE_ID, [])).toHaveLength(5)
  })
})

describe('parseSecretNames', () => {
  it('reads the names from wrangler pages secret list', () => {
    const out =
      'The "production" environment of your Pages project "deep-cuts" has access to the following secrets:\n' +
      '  - TMDB_READ_TOKEN: Value Encrypted\n  - CANONICAL_HOST: Value Encrypted\n'
    expect(parseSecretNames(out)).toEqual(['TMDB_READ_TOKEN', 'CANONICAL_HOST'])
  })

  it('finds none in an empty list', () => {
    expect(parseSecretNames('')).toEqual([])
  })
})

describe('migrationProblems', () => {
  const files = ['0001_init.sql', '0002_top_ten.sql']

  it('lets a database that has run every file through', () => {
    expect(migrationProblems(files, files)).toEqual([])
  })

  it('names every file the live database has not run, in order', () => {
    const [problem] = migrationProblems(['0003_c.sql', ...files], ['0001_init.sql'])
    expect(problem).toMatch(/0002_top_ten\.sql, 0003_c\.sql/)
    expect(problem).toMatch(/migrations apply deep-cuts --remote/)
  })

  it('ignores files that are not migrations', () => {
    expect(migrationProblems(['README.md', ...files], files)).toEqual([])
  })
})

describe('parseAppliedMigrations', () => {
  it('reads the names from wrangler d1 execute --json', () => {
    const out = JSON.stringify([
      { results: [{ name: '0001_init.sql' }, { name: '0002_top_ten.sql' }], success: true },
    ])
    expect(parseAppliedMigrations(out)).toEqual(['0001_init.sql', '0002_top_ten.sql'])
  })

  it('refuses output it does not recognise', () => {
    expect(() => parseAppliedMigrations('{"error":"no such table"}')).toThrow()
  })
})

describe('ciProblems', () => {
  const pass = (workflowName: string): WorkflowRun => ({
    workflowName,
    status: 'completed',
    conclusion: 'success',
  })

  it('lets a commit with passing runs through, skipped ones included', () => {
    expect(ciProblems([pass('CI'), { ...pass('CodeQL'), conclusion: 'skipped' }])).toEqual([])
  })

  it('refuses a commit CI has not run on', () => {
    expect(ciProblems([pass('CodeQL')])[0]).toMatch(/CI hasn't run/)
    expect(ciProblems([])).toHaveLength(1)
  })

  it('refuses a run still going, and one that failed', () => {
    const problems = ciProblems([
      { ...pass('CI'), status: 'in_progress', conclusion: '' },
      { ...pass('CodeQL'), conclusion: 'failure' },
    ])
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/CI is still running/)
    expect(problems[1]).toMatch(/CodeQL ended "failure"/)
  })
})

describe('parseWorkflowRuns', () => {
  it('reads gh run list --json output', () => {
    const out = '[{"conclusion":"success","status":"completed","workflowName":"CI"}]'
    expect(parseWorkflowRuns(out)).toEqual([
      { workflowName: 'CI', status: 'completed', conclusion: 'success' },
    ])
  })
})
