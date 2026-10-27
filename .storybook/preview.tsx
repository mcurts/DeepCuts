// Wraps every story in what the app's components expect: the global stylesheet (fonts, tokens,
// base styles), a data cache, a session and a router. Stories pick a session with
// `parameters.session`, e.g. a signed-in account. The toolbar's Theme menu shows any story in
// any theme (ADR-0056); the axe gate runs every story in every theme.
import type { Preview } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { SIGNED_OUT, type Session } from '../src/adapters/SessionProvider'
import { AppSessionProvider } from '../src/session/AppSessionProvider'
import { DEFAULT_THEME_ID, THEMES } from '../src/styles/themes'
import { findTheme } from '../src/theme'
import '../src/index.css'

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Theme (brand look)',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: THEMES.map((t) => ({ value: t.id, title: t.label })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: DEFAULT_THEME_ID },
  decorators: [
    (Story, { globals }) => {
      // The theme goes on <html>, as in the app, so popovers outside the story root get it too.
      const theme = findTheme(globals.theme as string) ?? findTheme(DEFAULT_THEME_ID)
      if (theme) {
        document.documentElement.dataset.theme = theme.id
        void theme.loadFonts?.()
      }
      return <Story />
    },
    (Story, { parameters }) => (
      // A fresh cache per story, so one story's data never leaks into another.
      <QueryClientProvider client={new QueryClient()}>
        <AppSessionProvider initialSession={(parameters.session as Session) ?? SIGNED_OUT}>
          <MemoryRouter>
            {/* Page-like padding on the theme's page surface. */}
            <div className="min-h-dvh bg-surface p-6 text-fg">
              <Story />
            </div>
          </MemoryRouter>
        </AppSessionProvider>
      </QueryClientProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    // Fail the a11y panel's checks on any violation, matching the CI gate.
    a11y: { test: 'error' },
  },
}

export default preview
