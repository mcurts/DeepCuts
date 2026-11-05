// `npm run invite`: creates a sign-up invite and prints its link (Stage 6 A5).
//
//   npm run invite                         a 7-day invite in the LOCAL database (wrangler pages dev)
//   npm run invite -- --days 3             a different lifetime (1–30 days)
//   npm run invite -- --recover <userId>   a recovery invite: adds a passkey to that account
//   npm run invite -- --remote --base https://deepcuts.example.com
//                                          OWNER ONLY, after go-live: writes to the real D1
//                                          database (needs your `wrangler login`)
//
// The code is 16 random bytes (base64url). Only its SHA-256 is stored, so the printed link is the
// only copy: share it privately, once. Each link works for one sign-up.
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { inviteInsertSql, inviteLink, makeInvite } from '../server/accounts/invites.ts'

const { values } = parseArgs({
  options: {
    days: { type: 'string', default: '7' },
    recover: { type: 'string' },
    remote: { type: 'boolean', default: false },
    base: { type: 'string' },
  },
})

const remote = values.remote
const base = values.base ?? (remote ? undefined : 'http://localhost:8788')
if (!base) {
  console.error(
    '✗ --remote needs --base https://<your-subdomain> so the link points at the live site.',
  )
  process.exit(1)
}

if (remote) {
  // Writing to the live database is deliberate and owner-only.
  console.warn(
    '\n⚠  --remote writes an invite to the LIVE Cloudflare D1 database (deep-cuts).\n' +
      '   It needs your own `wrangler login`. Anyone with the link can create an account.\n',
  )
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question('Type "remote" to continue: ')
  rl.close()
  if (answer.trim() !== 'remote') {
    console.error('Cancelled. Nothing was written.')
    process.exit(1)
  }
}

let invite
try {
  invite = await makeInvite({ days: Number(values.days), userId: values.recover ?? null })
} catch (e) {
  console.error(`✗ ${e.message}`)
  process.exit(1)
}

try {
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'deep-cuts',
      remote ? '--remote' : '--local',
      '--command',
      inviteInsertSql(invite),
    ],
    // Wrangler's own output would echo the SQL (with the hash); keep it quiet unless it fails.
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
} catch (e) {
  console.error(`✗ Couldn't store the invite.\n${e.stderr?.toString() ?? ''}`)
  if (!remote) console.error('  Has the local database been set up? Run: npm run db:migrate:local')
  process.exit(1)
}

const expires = new Date(invite.expiresAt).toLocaleString()
console.log(`
✓ ${invite.userId ? `Recovery invite for user ${invite.userId}` : 'Invite'} created (${remote ? 'live' : 'local'} database).
  Valid until ${expires}, for one sign-up:

  ${inviteLink(base, invite.code)}
`)
