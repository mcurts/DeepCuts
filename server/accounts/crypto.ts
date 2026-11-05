// Random ids and hashing for the accounts API, on the Web Crypto API that both
// Cloudflare Workers and Node provide.

/** base64url (RFC 4648 §5) without padding: safe in URLs, cookies and our id regex. */
export function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * A random token of `bytes` bytes, base64url. Used for user ids (16 bytes), challenge ids
 * (16 bytes), invite codes (16 bytes, 22 characters) and session ids (32 bytes). Never sequential,
 * so none can be guessed or counted.
 */
export function randomToken(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

/**
 * SHA-256 of a string, as lowercase hex. Session ids and invite codes are stored only this way,
 * so a copy of the database holds no live session and no usable invite. (A plain hash is enough:
 * the inputs are 128–256 random bits, so they can't be guessed from the hash.)
 */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
