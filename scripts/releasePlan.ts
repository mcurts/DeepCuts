// The SemVer rules `npm run deploy` versions each deploy with. Pure functions
// over plain facts (the last tag, the commits since it), so they're unit-tested here and the scripts
// only gather the facts and act on the answer.
//
// Each deploy is a release: the deploy works out the version from the commits since the
// last `vX.Y.Z` tag, builds it into the footer, tags the commit it shipped, and posts these notes as
// a GitHub Release. No version commits or release PRs, so the tag is the only marker.
//
// What each bump means for a website:
// - major: a returning user loses something or must redo it (`type!:` or a `BREAKING CHANGE:` footer)
// - minor: something new a user can see or do (`feat`)
// - patch: fixes and refinements (`fix`, `perf`, `design`, `style`, `copy`)
// - none: nothing a user sees (`chore`, `docs`, `test`, `refactor`, `ci`, `build`). Those ship with
//   the next bump; a release made of only these is a patch, because something still ships.

/**
 * The first tag's version. 1.0.0 and 1.0.1 were recorded by the first release PRs but never
 * deployed, so tagging continues from the last of them instead of going backwards.
 */
export const FIRST_VERSION = '1.0.1'

/** The size of a change, smallest first. */
export type Bump = 'none' | 'patch' | 'minor' | 'major'

/** One commit as `git log` gives it. */
export type Commit = { hash: string; subject: string; body: string }

/** What a deploy will release: the version, how big a step it is, and the release notes. */
export type ReleasePlan = { version: string; bump: Bump; notes: string }

const ORDER: Bump[] = ['none', 'patch', 'minor', 'major']
const PATCH_TYPES = new Set(['fix', 'perf', 'design', 'style', 'copy'])
// `type(scope)!: subject`. The scope and the `!` are optional.
const HEADER = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<bang>!)?:\s*(?<text>.+)$/

/** Reads a Conventional Commit header; null when it doesn't follow the format. */
function parse(commit: Commit) {
  const m = HEADER.exec(commit.subject.trim())
  if (!m?.groups) return null
  const breaking = Boolean(m.groups.bang) || /^BREAKING[ -]CHANGE:/m.test(commit.body)
  return { type: m.groups.type, text: m.groups.text, breaking }
}

/** The bump one commit asks for (see the table at the top of this file). */
export function bumpFor(commit: Commit): Bump {
  const c = parse(commit)
  if (!c) return 'none'
  if (c.breaking) return 'major'
  if (c.type === 'feat') return 'minor'
  return PATCH_TYPES.has(c.type) ? 'patch' : 'none'
}

/** `1.4.2` + `minor` = `1.5.0`. */
export function applyBump(version: string, bump: Bump): string {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!parts) throw new Error(`"${version}" isn't a MAJOR.MINOR.PATCH version`)
  const [major, minor, patch] = parts.slice(1).map(Number)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`
  return version
}

/** The biggest bump among the commits; maintenance-only is a patch, because something ships. */
function biggestBump(commits: Commit[]): Bump {
  const biggest = commits
    .map(bumpFor)
    .reduce<Bump>((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), 'none')
  return biggest === 'none' ? 'patch' : biggest
}

// The release notes' sections, in the order they're shown.
const SECTIONS: {
  title: string
  matches: (c: NonNullable<ReturnType<typeof parse>>) => boolean
}[] = [
  { title: 'Breaking changes', matches: (c) => c.breaking },
  { title: 'New', matches: (c) => c.type === 'feat' },
  { title: 'Fixes', matches: (c) => c.type === 'fix' || c.type === 'perf' },
  { title: 'Design', matches: (c) => ['design', 'style', 'copy'].includes(c.type) },
]

/**
 * The GitHub Release notes for a deploy: user-facing commits by section, maintenance as a count.
 * @param commits - The commits since the last tag; ignored for the first release.
 * @param first - Whether this is the first tagged release.
 */
export function releaseNotes(commits: Commit[], first = false): string {
  if (first)
    // The history before versioning is hundreds of commits; the log already has it.
    return (
      'First tagged release. The site has been live since 2026-10-08; ' +
      'everything before this is in the commit history.\n'
    )
  const lines: string[] = []
  let maintenance = 0
  const grouped = new Map<string, string[]>()
  for (const commit of commits) {
    const c = parse(commit)
    // Each commit goes in the first section it matches, so a breaking feat is listed once.
    const section = c && SECTIONS.find((s) => s.matches(c))
    if (!c || !section) {
      maintenance++
      continue
    }
    grouped.set(section.title, [...(grouped.get(section.title) ?? []), `- ${c.text}`])
  }
  for (const { title } of SECTIONS) {
    const items = grouped.get(title)
    if (items) lines.push(`### ${title}`, '', ...items, '')
  }
  if (maintenance)
    lines.push(
      `Plus ${maintenance} maintenance ${maintenance === 1 ? 'change' : 'changes'} (dependencies, tests, docs, tooling).`,
      '',
    )
  return lines.join('\n')
}

/**
 * What this deploy releases, or null when nothing has landed since the last tag (a redeploy of
 * that same version, which gets no new tag).
 * @param lastTagVersion - The newest `vX.Y.Z` tag without its `v`, or null before the first one.
 * @param commits - The commits since that tag, merge commits left out.
 */
export function planRelease(lastTagVersion: string | null, commits: Commit[]): ReleasePlan | null {
  if (lastTagVersion === null)
    return { version: FIRST_VERSION, bump: 'patch', notes: releaseNotes(commits, true) }
  if (commits.length === 0) return null
  const bump = biggestBump(commits)
  return { version: applyBump(lastTagVersion, bump), bump, notes: releaseNotes(commits) }
}
