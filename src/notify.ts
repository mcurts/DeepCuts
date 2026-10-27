// App notifications: short toasts in the top-right corner, drawn by Sonner (<AppToaster />, mounted
// once in main.tsx). Every confirmation or failure of something the person did goes through here
// (signing in or out, saving tags, the Top Ten, account changes), so the wording style and the
// timing live in one place.
//
// What stays inline instead: field errors (shown on the field they're about), progress lines
// ("Signing you in…"), counts and other state the page keeps showing.
//
// Sonner is loaded on first use, not with the first visit (it would push the bundle over its
// budget, scripts/check-bundle-size.mjs, and no toast is needed before the first page shows). A
// toast raised before <AppToaster /> has loaded is kept by Sonner and shown once it mounts.
import { firstName, type Session } from './adapters/SessionProvider'

/** How long a confirmation stays up, in ms. Placeholder default; to be tuned. */
export const SUCCESS_DURATION = 4000

/**
 * How long an error stays up, in ms. Longer than a confirmation: it asks the person to do
 * something (try again), so they need time to read it.
 */
export const ERROR_DURATION = 8000

// Loads Sonner's `toast` (once; later calls reuse the loaded module).
const loadToast = () => import('sonner').then((m) => m.toast)

/** Shows a toast for something the person did. Returns at once; the toast follows. */
export const notify = {
  /** It worked, e.g. "Signed out." */
  success: (message: string) =>
    void loadToast().then((toast) => toast.success(message, { duration: SUCCESS_DURATION })),
  /** It didn't, e.g. "Your change wasn’t saved. Nothing was changed. Try again." */
  error: (message: string) =>
    void loadToast().then((toast) => toast.error(message, { duration: ERROR_DURATION })),
}

/**
 * A confirmation with an Undo button, for a change made in one tap (Discovery's quick actions).
 * Stays up as long as any confirmation; the change can also be undone where it was made.
 * @returns A function that closes the toast, e.g. once the change was undone some other way.
 */
export function notifyWithUndo(message: string, onUndo: () => void): () => void {
  const id = loadToast().then((toast) =>
    toast.success(message, {
      duration: SUCCESS_DURATION,
      action: { label: 'Undo', onClick: onUndo },
    }),
  )
  return () =>
    void Promise.all([loadToast(), id]).then(([toast, toastId]) => toast.dismiss(toastId))
}

/**
 * "Signed in as Mike." after signing in or registering (which signs the new account in).
 * @param prefix - Goes before it, e.g. "Account created. "
 */
export function notifySignedIn(session: Session, prefix = '') {
  if (session.kind === 'account') {
    notify.success(`${prefix}Signed in as ${firstName(session.account.name)}.`)
  }
}

/** "Signed out." and its failure, for both Sign out buttons (account menu and Account page). */
export const SIGN_OUT_MESSAGES = {
  success: 'Signed out.',
  error: 'Sign-out didn’t finish. You’re still signed in. Try again.',
}

/**
 * Runs an action and shows a toast for how it went.
 * @param action - A function, so an error it throws before returning its promise is caught too.
 * @returns True if it worked, so the caller can carry on (or stay put to let them retry).
 */
export async function withToast(
  action: () => Promise<unknown>,
  messages: { success: string; error: string },
): Promise<boolean> {
  try {
    await action()
    notify.success(messages.success)
    return true
  } catch {
    notify.error(messages.error)
    return false
  }
}

/**
 * When the server ended the passkey session (30 idle days, or signed out or deleted on another
 * device, issue #18). The app is already on its way to Sign in when this shows.
 */
export const SESSION_ENDED = 'You were signed out. Sign in again to pick up where you left off.'

/** When a one-tap tag change (Search, Tune) didn't save. The toggle still shows the old state. */
export const TAG_ERROR = 'Your change wasn’t saved. Nothing was changed. Try again.'

/**
 * Confirms a one-tap tag change: "Tagged The Thing: Like." or "Removed Like from The Thing."
 * @param label - The tag's display label, from TAGS.
 */
export function notifyTagged(title: string, label: string, on: boolean) {
  notify.success(on ? `Tagged ${title}: ${label}.` : `Removed ${label} from ${title}.`)
}
