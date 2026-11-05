// The tag store and Top Ten store while signed out: empty, and they refuse
// every write.
//
// Signed out, only the landing page and the account pages render, and none of them tag films or
// change a Top Ten. So these stores are never expected to receive a write. If one arrives anyway (a bug, or a page that
// slipped past the route guard), it fails loudly instead of quietly keeping picks nobody can save.
import type { TagRepository } from './TagRepository'
import type { TopTenRepository } from './TopTenRepository'

/** Thrown by any write to the signed-out store. */
export class SignedOutError extends Error {
  constructor() {
    super('Sign in to save films.')
    this.name = 'SignedOutError'
  }
}

const refuse = async (): Promise<never> => {
  throw new SignedOutError()
}

/** One shared instance: it holds no state, so every signed-out session can use it. */
export const signedOutTags: TagRepository = {
  getTags: async () => new Set(),
  list: async () => [],
  feedExclusions: async () => new Set(),
  exportAll: async () => [],
  setTag: refuse,
  importAll: refuse,
  clear: refuse,
  reorder: refuse,
}

/** The signed-out Top Ten: always empty, and every change throws `SignedOutError`. */
export const signedOutTopTen: TopTenRepository = {
  list: async () => [],
  add: refuse,
  remove: refuse,
  reorder: refuse,
}
