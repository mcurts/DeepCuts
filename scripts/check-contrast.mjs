// Contrast for the colors the page mixes at runtime with color-mix(): a genre's tone bleached
// toward the sticker or VHS-box paper, with ink on top. The token build checks every other pair
// (each content color declares its grounds in the token source); it can't see these, because the
// mixed color exists only in CSS. Every theme must pass every pair, so a new theme can't merge
// until it's accessible (WCAG 1.4.3).
import { readFileSync } from 'node:fs'

const pairs = JSON.parse(readFileSync('scripts/mixed-contrast-pairs.json', 'utf8'))

const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = (hex) => {
  const n = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(n.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** `a` and `b` mixed in sRGB with `weight` of `a`, as CSS `color-mix(in srgb, a w%, b)` does. */
const mix = (a, weight, b) =>
  '#' +
  [0, 2, 4]
    .map((i) => {
      const [x, y] = [a, b].map((h) => parseInt(h.replace('#', '').slice(i, i + 2), 16))
      return Math.round(x * weight + y * (1 - weight))
        .toString(16)
        .padStart(2, '0')
    })
    .join('')

/**
 * A pair side is a token name, or `{ "mix": [token, weight, token] }` for a color the page mixes
 * at runtime (e.g. the genre sticker's face, index.css `sticker-face`). Returns [label, hex].
 */
const resolve = (tokens, side) => {
  if (typeof side === 'string') return [side, tokens[side]]
  const [a, weight, b] = side.mix
  const label = `mix(${a} ${weight * 100}%, ${b})`
  return [label, tokens[a] && tokens[b] ? mix(tokens[a], weight, tokens[b]) : undefined]
}

let failed = 0
// Every theme's resolved values, written by the token build (npm run tokens).
const themes = JSON.parse(readFileSync('tokens/dist/json/contexts/theme.json', 'utf8'))
for (const [theme, tokens] of Object.entries(themes)) {
  let themeFailed = 0
  for (const [fgSide, bgSide, min] of pairs) {
    const [fg, fgHex] = resolve(tokens, fgSide)
    const [bg, bgHex] = resolve(tokens, bgSide)
    if (!fgHex || !bgHex) {
      console.error(`✗ [${theme}] unknown token in pair: ${fg} / ${bg}`)
      themeFailed++
      continue
    }
    const r = ratio(fgHex, bgHex)
    if (r < min) {
      themeFailed++
      console.log(`✗ [${theme}] ${fg} on ${bg}: ${r.toFixed(2)} (min ${min})`)
    }
  }
  console.log(
    `${themeFailed ? '✗' : '✓'} ${theme}: ${pairs.length - themeFailed}/${pairs.length} pairs pass`,
  )
  failed += themeFailed
}
process.exit(failed ? 1 : 0)
