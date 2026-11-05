// Reads the release facts from git for `npm run deploy` and `npm run version:next`, in
// the shapes scripts/releasePlan.ts expects. Callers fetch tags first, so these see GitHub's.
import { execFileSync } from 'node:child_process'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

/** The newest `vX.Y.Z` tag without its `v`, or null before the first release. */
export function latestTagVersion() {
  // Sorted by version, not date; anything not shaped like vX.Y.Z is ignored.
  const tags = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n')
  const newest = tags.find((t) => /^v\d+\.\d+\.\d+$/.test(t))
  return newest ? newest.slice(1) : null
}

/** The commit a tag points to, or null when the tag doesn't exist. */
export function tagCommit(tag) {
  try {
    // stderr ignored: a missing tag is an expected answer here, not an error to print.
    return execFileSync('git', ['rev-list', '-n', '1', `refs/tags/${tag}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

/**
 * The commits on HEAD since the tag `v<version>` (all of history when version is null), merge
 * commits left out: each PR's own commits carry the Conventional Commit types.
 */
export function commitsSince(version) {
  // Unit and record separators can't appear in commit text, so splitting on them is safe.
  const range = version ? [`v${version}..HEAD`] : ['HEAD']
  const out = git('log', '--no-merges', '--format=%H%x1f%s%x1f%b%x1e', ...range)
  return out
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [hash, subject, body = ''] = r.split('\x1f')
      return { hash, subject, body }
    })
}
