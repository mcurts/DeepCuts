// Tests for the shared HTTP helpers, especially limits that protect every JSON-writing endpoint.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { readJson } from './http'

describe('readJson', () => {
  it('limits the encoded bytes, not JavaScript character count', async () => {
    // JSON.stringify("é") is three UTF-16 code units but four UTF-8 bytes. A byte cap of three
    // must therefore reject it even though the old character-count check accepted it.
    const request = new Request('https://deepcuts.example/api', {
      method: 'POST',
      body: JSON.stringify('é'),
    })

    const result = await readJson(request, z.string(), 3)

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error.status).toBe(413)
      await expect(result.error.json()).resolves.toEqual({ error: 'too_large' })
    }
  })

  it('accepts a multi-byte body when its encoded bytes fit', async () => {
    const body = JSON.stringify('é')
    const request = new Request('https://deepcuts.example/api', { method: 'POST', body })

    await expect(
      readJson(request, z.string(), new TextEncoder().encode(body).byteLength),
    ).resolves.toEqual({ data: 'é' })
  })
})
