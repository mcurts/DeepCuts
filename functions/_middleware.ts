// Runs around every Pages Function. Pages applies `_headers` only to static files, so
// this gives Function answers (the `/api/*` JSON) the same security headers, from the same source
// (server/securityHeaders.ts).
import { productionHeaders } from '../server/securityHeaders.ts'

/** Calls the Function, then adds the security headers to whatever it answered. */
export const onRequest: PagesFunction = async ({ next }) => {
  const response = await next()
  // Copy into a new Response: responses from fetch() or the cache can have read-only headers.
  const secured = new Response(response.body, response)
  for (const [name, value] of Object.entries(productionHeaders)) secured.headers.set(name, value)
  return secured
}
