// Tests for the low-priority scripts plugin (ADR-0057): the app's entry and modulepreload tags get
// fetchpriority="low", and the boot scripts that must run before the first paint don't.
import { describe, expect, it } from 'vitest'
import { lowerScriptPriority } from './lowPriorityScripts.ts'

const built = [
  '<script src="/theme-boot.js"></script>',
  '<script src="/shell-boot.js"></script>',
  '<script type="module" crossorigin src="/assets/index-abc.js"></script>',
  '<link rel="modulepreload" crossorigin href="/assets/react-abc.js">',
  '<link rel="modulepreload" crossorigin href="/assets/data-abc.js">',
].join('\n')

describe('lowerScriptPriority', () => {
  it('lowers the entry script and every modulepreload link', () => {
    const html = lowerScriptPriority(built)
    expect(html).toContain(
      '<script type="module" fetchpriority="low" crossorigin src="/assets/index-abc.js">',
    )
    expect(html.match(/rel="modulepreload" fetchpriority="low"/g)).toHaveLength(2)
  })

  it('leaves the boot scripts alone', () => {
    const html = lowerScriptPriority(built)
    expect(html).toContain('<script src="/theme-boot.js"></script>')
    expect(html).toContain('<script src="/shell-boot.js"></script>')
  })

  it('fails the build when Vite writes the entry differently', () => {
    expect(() => lowerScriptPriority('<script type="module" src="/x.js"></script>')).toThrow(
      /no module entry/,
    )
  })
})
