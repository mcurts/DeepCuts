// Remembers whether someone is signed in on this device (ADR-0057), so the boot script can hide
// the pre-rendered landing page before the first paint for a returning, signed-in visitor (who is
// about to see Home instead).
//
// Only a hint: the real session still comes from the session provider before React renders. A
// wrong hint costs nothing but speed: a stale "signed in" shows a blank page until the app is
// ready (as before ADR-0057), a stale "signed out" shows the landing page until Home replaces it.
//
// Two readers share this key: the app (through saveSignedInHint) and public/shell-boot.js, a
// plain script that runs before the app; signedInHint.test.ts checks that the two agree.
import { z } from 'zod'
import { versionedStore } from './versionedStore'

/** The key under the app's storage prefix: `deepcuts:v1:signed-in`. */
export const SIGNED_IN_HINT_KEY = 'signed-in'

/**
 * Records whether this device is signed in. Signed out removes the key rather than storing false,
 * so nothing is kept for visitors who never signed in. Fails silently when storage is blocked: the
 * boot script then simply sees no hint.
 */
export function saveSignedInHint(signedIn: boolean, storage?: Storage) {
  try {
    const store = versionedStore({
      key: SIGNED_IN_HINT_KEY,
      schema: z.literal(true),
      fallback: true,
      storage: storage ?? localStorage,
    })
    if (signedIn) store.save(true)
    else store.remove()
  } catch {
    // Blocked storage: nothing to remember, nothing to forget.
  }
}
