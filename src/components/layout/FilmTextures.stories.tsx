// Stories for FilmTextures, the scratches and grain around every page (ADR-0040): one state, over
// sample text, to check the grain stays faint enough to read through and lets clicks pass.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FilmTextures } from './FilmTextures'

const meta = {
  title: 'Components/Layout/FilmTextures',
  component: FilmTextures,
  args: {
    children: (
      <main className="p-6">
        <h1 className="font-display text-5xl case-display">Tonight’s program</h1>
        <p className="mt-4 text-fg-soft">Text under the grain stays readable.</p>
      </main>
    ),
  },
} satisfies Meta<typeof FilmTextures>
export default meta
type Story = StoryObj<typeof meta>

/** The textures over a page. */
export const Default: Story = {}
