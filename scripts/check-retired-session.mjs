// Keeps the retired session kinds out of the app: there is no guest and no device
// profile ("Save my picks") any more, only signed in or signed out. TypeScript already rejects
// them in src/, but .storybook/ isn't type-checked, and a string in a story slipped through once.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Each banned pattern, and what to use instead.
const BANNED = [
  [/\bcreateProfile\b/, 'the device profile is gone; sign in instead'],
  [/kind:\s*['"](?:guest|profile)['"]/, "use SIGNED_OUT ({ kind: 'signedOut' }) or an account"],
  [/'Save my picks'|>\s*Save my picks/, 'the "Save my picks" action is gone'],
]

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

let problems = 0
for (const file of [...walk('src'), ...walk('.storybook')].filter((f) => /\.[tj]sx?$/.test(f))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [pattern, why] of BANNED) {
        if (!pattern.test(line)) continue
        console.error(`${file}:${i + 1} retired session code: ${why}`)
        problems++
      }
    })
}
if (problems) process.exit(1)
console.log('✓ no retired session kinds')
