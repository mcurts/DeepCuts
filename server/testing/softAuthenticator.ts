// A software passkey for unit tests (Stage 6 A6). It holds a real P-256 key pair and
// builds the same signed WebAuthn messages a phone or laptop would ("none" attestation, ES256), so
// the tests run SimpleWebAuthn's real verification, not a mock of it. Test-only: never bundled.
//
// Reference: WebAuthn Level 3, §6.1 (authenticator data) and §6.5.4 (packed/none attestation).
import { isoCBOR } from '@simplewebauthn/server/helpers'
import { base64url } from '../accounts/crypto.ts'

const enc = new TextEncoder()
const sha256 = async (data: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data))
const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) out.set(p, (i += p.length) - p.length)
  return out
}
const u32 = (n: number) => new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])

/** ECDSA from Web Crypto is raw r‖s; WebAuthn signatures are ASN.1 DER. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0
    while (i < b.length - 1 && b[i] === 0) i++
    const v = b.slice(i)
    // A leading 1 bit would read as negative, so DER adds a zero byte.
    const body = v[0] & 0x80 ? concat(new Uint8Array([0]), v) : v
    return concat(new Uint8Array([0x02, body.length]), body)
  }
  const seq = concat(int(raw.slice(0, 32)), int(raw.slice(32)))
  return concat(new Uint8Array([0x30, seq.length]), seq)
}

// Authenticator data flags.
const UP = 0x01 // user present
const UV = 0x04 // user verified (fingerprint, face or PIN)
const AT = 0x40 // attested credential data included

/** Options for {@link createSoftAuthenticator}. */
export type SoftOptions = {
  /** Whether the "user" passes verification (default true). */
  userVerified?: boolean
}

/** Creates a software authenticator with one passkey slot. */
export async function createSoftAuthenticator({ userVerified = true }: SoftOptions = {}) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])
  const credentialId = crypto.getRandomValues(new Uint8Array(16))
  let counter = 0
  let userHandle = ''
  const flags = UP | (userVerified ? UV : 0)

  const clientData = (type: string, challenge: string, origin: string) =>
    enc.encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }))

  return {
    /** The passkey's id (base64url), once created. */
    id: base64url(credentialId),

    /** Answers `navigator.credentials.create()` for the given options. */
    async create(
      options: { challenge: string; rp: { id?: string }; user: { id: string } },
      origin: string,
    ) {
      userHandle = options.user.id
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))
      // COSE_Key for ES256 on P-256: kty EC2, alg -7, crv 1, x, y.
      const cose = isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, raw.slice(1, 33)],
          [-3, raw.slice(33)],
        ]),
      )
      const authData = concat(
        await sha256(enc.encode(options.rp.id ?? '')),
        new Uint8Array([flags | AT]),
        u32(counter),
        new Uint8Array(16), // AAGUID: all zeros, as for "none" attestation
        new Uint8Array([0, credentialId.length]),
        credentialId,
        cose,
      )
      const attestationObject = isoCBOR.encode(
        new Map<string, unknown>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]) as never,
      )
      return {
        id: base64url(credentialId),
        rawId: base64url(credentialId),
        type: 'public-key' as const,
        response: {
          clientDataJSON: base64url(clientData('webauthn.create', options.challenge, origin)),
          attestationObject: base64url(attestationObject),
          transports: ['internal'],
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      }
    },

    /** Answers `navigator.credentials.get()` for the given options (signs the challenge). */
    async get(options: { challenge: string; rpId?: string }, origin: string) {
      counter += 1
      const authData = concat(
        await sha256(enc.encode(options.rpId ?? '')),
        new Uint8Array([flags]),
        u32(counter),
      )
      const cdj = clientData('webauthn.get', options.challenge, origin)
      const signed = concat(authData, await sha256(cdj))
      const raw = new Uint8Array(
        await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, signed),
      )
      return {
        id: base64url(credentialId),
        rawId: base64url(credentialId),
        type: 'public-key' as const,
        response: {
          clientDataJSON: base64url(cdj),
          authenticatorData: base64url(authData),
          signature: base64url(rawToDer(raw)),
          userHandle,
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      }
    },

    /** Rolls the signature counter back, to imitate a cloned authenticator. */
    rewind() {
      counter = 0
    },
  }
}
