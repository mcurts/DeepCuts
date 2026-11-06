// Enforces the Storybook ownership contract from AGENTS.md. Every shared component and every
// route-private TSX component must have an adjacent story unless this file records why rendering
// it alone would test plumbing rather than a meaningful visual state.
import { existsSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'

// Exemptions are deliberately explicit and narrow. Adding a new TSX file fails this check until it
// gets either a story or an architectural reason here; a later story makes its exemption stale and
// also fails, so the list cannot quietly become a graveyard.
const EXEMPTIONS = new Map([
  ['src/components/layout/AppToaster.tsx', 'lazy composition root; Sonner owns the rendered UI'],
  [
    'src/components/layout/SonnerToaster.tsx',
    'third-party toast portal configured once; notification journeys cover its visible states',
  ],
  ['src/components/ui/Form.tsx', 'behavior-only form boundary with no independent visual state'],
  ['src/routes/AppLayout.tsx', 'whole-route shell covered by screen and end-to-end tests'],
  ['src/routes/IndexRoute.tsx', 'session-dependent route switch with no UI of its own'],
  ['src/routes/RequireAccount.tsx', 'route guard with no UI of its own'],
  ['src/routes/account/AccountPage.tsx', 'whole page covered by account screen tests'],
  [
    'src/routes/account/AccountSettings.tsx',
    'session-provider form fragment covered through the account screen tests',
  ],
  ['src/routes/auth/AuthLayout.tsx', 'whole-route layout covered by authentication screen tests'],
  ['src/routes/auth/RegisterPage.tsx', 'whole page covered by registration screen tests'],
  ['src/routes/auth/SignInPage.tsx', 'whole page covered by sign-in screen tests'],
  [
    'src/routes/discover/DiscoverPage.tsx',
    'whole page covered by Home screen and end-to-end tests',
  ],
  ['src/routes/lab/VhsLabPage.tsx', 'development-only interactive tuning page'],
  ['src/routes/lab/WeightsPage.tsx', 'development-only interactive tuning page'],
  [
    'src/routes/landing/LandingPage.tsx',
    'whole page covered by landing screen and end-to-end tests',
  ],
  ['src/routes/lists/ListsPage.tsx', 'whole page covered by list screen tests'],
  [
    'src/routes/movie-detail/DetailTags.tsx',
    'query-backed form fragment covered through movie-detail screen tests',
  ],
  [
    'src/routes/movie-detail/DetailTopTen.tsx',
    'query-backed mutation fragment covered through movie-detail screen tests',
  ],
  [
    'src/routes/movie-detail/MovieDetailPage.tsx',
    'whole page covered by movie-detail screen and end-to-end tests',
  ],
  ['src/routes/search/SearchPage.tsx', 'whole page covered by search screen tests'],
  [
    'src/routes/tune/FavoriteStep.tsx',
    'query-backed onboarding fragment covered through Tune screen tests',
  ],
  [
    'src/routes/tune/RateStep.tsx',
    'query-backed onboarding fragment covered through Tune screen tests',
  ],
  ['src/routes/tune/TunePage.tsx', 'whole page covered by Tune screen tests'],
])

/** Returns every file below `directory`, in stable order. */
function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? filesBelow(path) : [path]
    })
    .sort()
}

const implementations = ['src/components', 'src/routes']
  .flatMap(filesBelow)
  .filter(
    (path) =>
      extname(path) === '.tsx' && !path.endsWith('.stories.tsx') && !path.endsWith('.test.tsx'),
  )

const errors = []
for (const path of implementations) {
  const story = path.replace(/\.tsx$/, '.stories.tsx')
  const hasStory = existsSync(story)
  const exemption = EXEMPTIONS.get(path)
  if (!hasStory && !exemption) errors.push(`${path}: add ${story} or a narrow exemption`)
  if (hasStory && exemption) errors.push(`${path}: remove its stale exemption; ${story} exists`)
}
for (const path of EXEMPTIONS.keys())
  if (!implementations.includes(path)) errors.push(`${path}: exemption points to no component`)

if (errors.length) {
  console.error(`Story contract failed:\n${errors.map((error) => `- ${error}`).join('\n')}`)
  process.exit(1)
}

console.log(
  `✓ ${implementations.length - EXEMPTIONS.size} components have stories; ${EXEMPTIONS.size} narrow exemptions`,
)
