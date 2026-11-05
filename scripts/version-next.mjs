// `npm run version:next`: shows the version and release notes the next `npm run deploy` would
// ship, without changing anything. Safe for anyone, agents included.
import { execFileSync } from 'node:child_process'
import { planRelease } from './releasePlan.ts'
import { commitsSince, latestTagVersion } from './releaseGit.mjs'

// Tags only; GitHub's tags are the record of what went live.
execFileSync('git', ['fetch', '--quiet', '--tags', 'origin'])
const lastTag = latestTagVersion()
const plan = planRelease(lastTag, commitsSince(lastTag))
if (!plan) {
  console.log(`Nothing new since v${lastTag}: a deploy now would redeploy v${lastTag}.`)
} else {
  console.log(`${lastTag ? `v${lastTag}` : 'No tag yet'} → v${plan.version} (${plan.bump})\n`)
  console.log(plan.notes)
}
