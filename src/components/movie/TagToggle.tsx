// One of the three tag buttons (Want to see, More like this, Less like this) on Detail and Tune.
import type { CSSProperties } from 'react'
import { ToggleButton } from 'react-aria-components'
import { Icon } from '@/components/ui/Icon'
import { tagColor, type TagDisplay } from './tagDisplay'

/** A tag on/off button. Its state is announced by aria-pressed only, never repeated in the label. */
/**
 * @param detailed - Also show the tag's hint ("Save for later") under its label.
 */
export function TagToggle({
  tag,
  isSelected,
  onChange,
  detailed = false,
  className = '',
}: {
  tag: TagDisplay
  isSelected: boolean
  onChange: (on: boolean) => void
  detailed?: boolean
  className?: string
}) {
  return (
    <ToggleButton
      isSelected={isSelected}
      onChange={onChange}
      // Sets `--tag` to this tag's color; the classes below use it for the icon, hover and
      // selected state, so one component serves all three tags. Pressed, the button fills with
      // the tag's color and its text and icon turn ink (ADR-0040), so on and off differ by far
      // more than a border.
      style={tagColor(tag.tag) as CSSProperties}
      className={`group flex min-w-0 items-center justify-center gap-2 rounded-tag-toggle border-2 border-tag-toggle-border bg-tag-toggle-bg px-2 py-1.5 text-sm text-tag-toggle-fg hover:border-(--tag) data-selected:border-(--tag) data-selected:bg-(--tag) data-selected:text-fg-on-accent data-selected:shadow-stamp ${className}`}
    >
      <Icon
        name={tag.icon}
        className="size-5 shrink-0 text-(--tag) group-data-selected:text-fg-on-accent"
      />
      <span className="flex flex-col gap-0.5">
        <strong className="font-bold">{tag.label}</strong>
        {detailed && (
          <small className="text-sm font-normal text-fg-muted group-data-selected:text-fg-on-accent">
            {tag.hint}
          </small>
        )}
      </span>
    </ToggleButton>
  )
}
