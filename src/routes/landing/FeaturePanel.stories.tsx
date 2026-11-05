// Stories for FeaturePanel, one feature on the landing page's "Tonight's program": each of the three as the landing page shows it, and the row of three.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FeaturePanel } from './FeaturePanel'
import { PanelArt } from './PanelArt'
import { PANELS, type PanelId } from '@/config/panels'

const COPY: Record<PanelId, string> = {
  'top-ten': 'Rank the ten films you’d defend to anyone, in your order.',
  watchlist: 'Save a film the moment you hear about it. It waits for you on Home.',
  discovery:
    'Mark a few films “More like this” and get deep cuts picked for your taste, with the reason why.',
}

// One feature as the landing page fills it: illustration, then its line of copy.
function Explainer({ id, feature }: { id: PanelId; feature: number }) {
  return (
    <FeaturePanel panel={PANELS[id]} feature={feature}>
      <PanelArt id={id} />
      <p className="mt-5 text-base text-content-soft">{COPY[id]}</p>
    </FeaturePanel>
  )
}

const meta = {
  title: 'Pages/Landing/FeaturePanel',
  component: FeaturePanel,
  args: { panel: PANELS['top-ten'], feature: 1, children: null },
  render: (args) => <Explainer id={args.panel.id} feature={args.feature} />,
} satisfies Meta<typeof FeaturePanel>
export default meta
type Story = StoryObj<typeof meta>

export const TopTen: Story = {}
export const Watchlist: Story = { args: { panel: PANELS.watchlist, feature: 2 } }
export const Discovery: Story = { args: { panel: PANELS.discovery, feature: 3 } }
/** The program as the landing page lays it out at desktop width. */
export const Program: Story = {
  render: () => (
    <ul className="grid grid-cols-3 gap-5">
      {(Object.keys(COPY) as PanelId[]).map((id, i) => (
        <li key={id}>
          <Explainer id={id} feature={i + 1} />
        </li>
      ))}
    </ul>
  ),
}
