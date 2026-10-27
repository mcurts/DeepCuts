// Bans raw color values and arbitrary Tailwind color classes in src/. Use semantic tokens. ADR-0006.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Generated from tokens/ by sd.config.mjs, where raw values belong (tier 1).
const GENERATED = 'src/styles/'
const RULES = [
  [/#[0-9a-fA-F]{3,8}\b/, 'raw hex color'],
  [/\b(?:rgb|rgba|hsl|hsla|oklch)\(/, 'raw color function'],
  [
    /\b(?:bg|text|border|ring|fill|stroke|outline|from|via|to|decoration|shadow|accent|caret)-\[/,
    'arbitrary color class',
  ],
]

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(p) ? [p] : []
  })

let problems = 0
for (const file of walk('src')) {
  if (file.startsWith(GENERATED)) continue
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [re, what] of RULES) {
        if (re.test(line)) {
          console.error(`${file}:${i + 1} ${what}: ${line.trim()}`)
          problems++
        }
      }
    })
}
process.exit(problems ? 1 : 0)
