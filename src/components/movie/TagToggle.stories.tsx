// Stories for TagToggle: the three tag buttons, off and on, compact and detailed.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { applyTag, type SystemTag, type TagSet } from '@/domain/tagRules'
import { TAGS } from './tagDisplay'
import { TagToggle } from './TagToggle'

const [first] = TAGS
if (!first) throw new Error('TAGS is empty')

const meta = {
  title: 'Components/Movie/TagToggle',
  component: TagToggle,
  args: { tag: first, isSelected: false, onChange: () => {} },
} satisfies Meta<typeof TagToggle>
export default meta
type Story = StoryObj<typeof meta>

// All three tags in a group, as on the Detail page; pressing one clears the others.
function Group({ detailed = false, initial }: { detailed?: boolean; initial?: SystemTag }) {
  const [on, setOn] = useState<TagSet>(new Set(initial ? [initial] : []))
  return (
    <div role="group" aria-label="Your tags" className="grid max-w-md grid-cols-3 gap-1.5">
      {TAGS.map((t) => (
        <TagToggle
          key={t.tag}
          tag={t}
          detailed={detailed}
          isSelected={on.has(t.tag)}
          onChange={(value) => setOn((prev) => applyTag(prev, t.tag, value))}
          className="min-h-17 flex-col gap-1.5 px-1 text-center"
        />
      ))}
    </div>
  )
}

/** As on the Detail page, all off. */
export const Off: Story = { render: () => <Group /> }
/** Like on: the selected tag wears its own color. */
export const OneOn: Story = { render: () => <Group initial="liked" /> }
/** With hints, as on the onboarding rating cards. */
export const Detailed: Story = { render: () => <Group detailed initial="watchlist" /> }
