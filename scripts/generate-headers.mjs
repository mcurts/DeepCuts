// Writes dist/_headers, Cloudflare Pages' header rules for static files (Stage 4 H6),
// from server/securityHeaders.ts, the single source of the app's security headers. Runs as part of
// `npm run build`; the file is never hand-written.
import { writeFileSync } from 'node:fs'
import { headersFile } from '../server/securityHeaders.ts'

writeFileSync('dist/_headers', headersFile())
console.log('wrote dist/_headers')
