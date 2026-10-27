// Tells the app when the server has ended the passkey session (issue #18, ADR-0031).
//
// A session ends on the server without this tab knowing: after 30 idle days, or when the person
// signs out or deletes the account on another device. The next accounts API call then answers
// 401. The Cloudflare adapters (tags, Top Ten, the account calls) report every 401 here, and the
// session layer (AppSessionProvider) listens, drops to signed out and sends the person to Sign in.
//
// A plain listener list rather than a callback passed to each adapter: the session provider is
// built once at startup (main.tsx), before there is a React tree to call back into.

type Listener = () => void
const listeners = new Set<Listener>()

/**
 * Calls `listener` whenever an accounts API call answers 401 (the session has ended).
 * @returns A function that stops listening.
 */
export function onSessionEnded(listener: Listener): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/**
 * Called by the adapters with every failed answer's status; only a 401 means "signed out on the
 * server". Listeners run before the caller throws, so the screen switches to signed out first.
 */
export function reportStatus(status: number) {
  if (status === 401) for (const listener of listeners) listener()
}
