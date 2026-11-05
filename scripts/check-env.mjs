// Vite inlines every VITE_* value into public JS, so secret-looking VITE_ names are banned; and local
// secret files (.env*, .dev.vars) must never be tracked by git.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SECRET_NAME = /\bVITE_[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\b/g
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

const files = [
  ...walk('src'),
  // `.dev.vars` is wrangler's local env file; the same rule applies to it.
  ...readdirSync('.').filter((f) => f.startsWith('.env') || f.startsWith('.dev.vars')),
  'vite.config.ts',
  'index.html',
].filter(existsSync)

let problems = 0
for (const file of files) {
  for (const m of readFileSync(file, 'utf8').matchAll(SECRET_NAME)) {
    console.error(`${file}: secret-looking public env var ${m[0]}`)
    problems++
  }
}

// Local secret files must never be tracked by git, even if someone force-adds one past .gitignore.
const tracked = execFileSync('git', ['ls-files', '.env', '.env.*', '.dev.vars', '.dev.vars.*'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => f && !f.endsWith('.example'))
for (const file of tracked) {
  console.error(`${file}: local secrets file is tracked by git; remove it (git rm --cached)`)
  problems++
}
process.exit(problems ? 1 : 0)
