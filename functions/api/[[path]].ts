// The catch-all for `/api/*` paths no other Function answers. Without it, Pages would
// serve the app's index.html with a 200 for an unknown API path; a clear JSON 404 is easier to
// reason about and never looks like a success. (Rate-limited by functions/api/_middleware.ts.)
import { fail } from '../../server/http.ts'

/** Unknown API paths: a JSON 404. */
export const onRequest: PagesFunction = async () => fail(404, 'not_found')
