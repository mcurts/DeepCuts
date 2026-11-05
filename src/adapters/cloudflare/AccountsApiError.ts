// The error a failed accounts API call throws. In its own module so screens can check
// for it (e.g. a refused invite) without loading the passkey library with it.

/** A failed accounts API call. `code` is the server's short error code (e.g. `invalid_invite`). */
export class AccountsApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) {
    super(`Accounts API failed (${status} ${code})`)
    this.status = status
    this.code = code
  }
}
