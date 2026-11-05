// Storybook configuration: a workshop showing each shared component on its
// own, in every state, with the accessibility add-on. Run `npm run storybook` (port 6006).
// It builds with the app's own vite.config.ts, so styles and tokens match the app exactly.
import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  // Stories live next to their components: src/components/ui/Icon.stories.tsx, etc. (AGENTS.md, "Where files go").
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  // The a11y panel runs axe on the open story; CI runs the same check on every story
  // (storybook-tests/a11y.spec.ts).
  addons: ['@storybook/addon-a11y'],
  framework: '@storybook/react-vite',
  // No anonymous usage data sent to Storybook.
  core: { disableTelemetry: true },
}

export default config
