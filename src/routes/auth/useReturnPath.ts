// Where the account pages (Sign in, Create an account) send someone when they're done: back to
// the page sign-in started from.
import { useLocation } from 'react-router'
import { z } from 'zod'
import { HOME } from '@/config/features'

// The `from` path a link passes in history state. History state is untrusted: only same-app
// paths are allowed ("/lists", not "//evil.example" or "https://…").
const fromSchema = z.object({ from: z.string().regex(/^\/(?!\/)[^\s]*$/) })
// The account pages themselves are never a destination: returning there would loop.
const AUTH_PATHS = new Set(['/sign-in', '/register'])

/**
 * The page to return to after signing in or registering: the `from` path the link passed in
 * history state, if it is a same-app path, otherwise home (Discover, or Search while it's on).
 */
export function useReturnPath(): string {
  const parsed = fromSchema.safeParse(useLocation().state)
  return parsed.success && !AUTH_PATHS.has(parsed.data.from) ? parsed.data.from : HOME.path
}
