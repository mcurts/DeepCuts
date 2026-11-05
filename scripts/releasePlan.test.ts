// @vitest-environment node
// Tests for the SemVer rules each deploy is versioned with (scripts/releasePlan.ts):
// which commits bump what, the release notes, and the plan for a deploy.
import { describe, expect, it } from 'vitest'
import {
  applyBump,
  bumpFor,
  FIRST_VERSION,
  planRelease,
  releaseNotes,
  type Commit,
} from './releasePlan'

// A commit with just the parts the rules read.
const c = (subject: string, body = ''): Commit => ({ hash: subject, subject, body })

describe('bumpFor', () => {
  it.each([
    ['feat: watchlist sorting', 'minor'],
    ['feat(lists): watchlist sorting', 'minor'],
    ['fix: tag toggle focus', 'patch'],
    ['perf: smaller posters', 'patch'],
    ['design: warmer shelf', 'patch'],
    ['style: tighter footer', 'patch'],
    ['copy: friendlier empty state', 'patch'],
    ['chore(deps): bump vite', 'none'],
    ['docs: README', 'none'],
    ['test: more cases', 'none'],
    ['refactor: split hook', 'none'],
    ['ci: cache npm', 'none'],
    ['Merge pull request #3 from x', 'none'],
    ['feat!: drop the old list URLs', 'major'],
    ['fix(api)!: new tag payload', 'major'],
  ])('%s → %s', (subject, bump) => {
    expect(bumpFor(c(subject))).toBe(bump)
  })

  it('treats a BREAKING CHANGE footer as major', () => {
    expect(bumpFor(c('refactor: tags store', 'BREAKING CHANGE: old tags are dropped'))).toBe(
      'major',
    )
    expect(bumpFor(c('feat: x', 'Some text\n\nBREAKING-CHANGE: y'))).toBe('major')
  })
})

describe('applyBump', () => {
  it('bumps each part and resets the smaller ones', () => {
    expect(applyBump('1.4.2', 'major')).toBe('2.0.0')
    expect(applyBump('1.4.2', 'minor')).toBe('1.5.0')
    expect(applyBump('1.4.2', 'patch')).toBe('1.4.3')
    expect(applyBump('1.4.2', 'none')).toBe('1.4.2')
  })

  it('refuses anything but MAJOR.MINOR.PATCH', () => {
    expect(() => applyBump('1.4', 'patch')).toThrow(/MAJOR.MINOR.PATCH/)
    expect(() => applyBump('v1.4.2', 'patch')).toThrow()
  })
})

describe('releaseNotes', () => {
  it('groups user-facing commits and counts the rest', () => {
    const notes = releaseNotes([
      c('feat(lists): watchlist sorting'),
      c('fix: tag toggle focus'),
      c('design: warmer shelf'),
      c('feat!: drop old list URLs'),
      c('chore(deps): bump vite'),
      c('test: more'),
      c('not conventional'),
    ])
    expect(notes).toBe(
      [
        '### Breaking changes',
        '',
        '- drop old list URLs',
        '',
        '### New',
        '',
        '- watchlist sorting',
        '',
        '### Fixes',
        '',
        '- tag toggle focus',
        '',
        '### Design',
        '',
        '- warmer shelf',
        '',
        'Plus 3 maintenance changes (dependencies, tests, docs, tooling).',
        '',
      ].join('\n'),
    )
  })

  it('says "change" for one maintenance commit and skips empty sections', () => {
    const notes = releaseNotes([c('chore: one')])
    expect(notes).not.toContain('###')
    expect(notes).toContain('Plus 1 maintenance change (')
  })

  it('summarizes the first release instead of listing all history', () => {
    const notes = releaseNotes([c('feat: a')], true)
    expect(notes).toMatch(/^First tagged release/)
    expect(notes).not.toContain('- a')
  })
})

describe('planRelease', () => {
  it('tags the first release as 1.0.1, continuing from the last recorded version', () => {
    expect(FIRST_VERSION).toBe('1.0.1')
    expect(planRelease(null, [c('feat: a')])).toMatchObject({ version: '1.0.1', bump: 'patch' })
  })

  it('takes the biggest bump since the tag', () => {
    expect(planRelease('1.2.3', [c('fix: a'), c('feat: b'), c('chore: c')])).toMatchObject({
      version: '1.3.0',
      bump: 'minor',
    })
    expect(planRelease('1.2.3', [c('fix: a'), c('feat!: b')])?.version).toBe('2.0.0')
    expect(planRelease('1.2.3', [c('fix: a')])?.version).toBe('1.2.4')
  })

  it('makes maintenance-only releases a patch, since something still ships', () => {
    expect(planRelease('1.2.3', [c('chore(deps): bump react')])).toMatchObject({
      version: '1.2.4',
      bump: 'patch',
    })
  })

  it('returns null with nothing since the tag (a redeploy keeps its version)', () => {
    expect(planRelease('1.2.3', [])).toBeNull()
  })
})
