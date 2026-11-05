// Fails if the built bundle contains a TMDB token (JWT-shaped, or the literal env value).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/
const literal = process.env.TMDB_READ_TOKEN
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

let problems = 0
for (const file of walk('dist')) {
  const text = readFileSync(file, 'utf8')
  if (JWT.test(text) || (literal && text.includes(literal))) {
    console.error(`${file}: contains a token`)
    problems++
  }
}
console.log(problems ? '✗ secrets found in dist/' : '✓ dist/ is clean')
process.exit(problems ? 1 : 0)
