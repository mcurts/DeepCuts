// The footer's theme chooser (ADR-0056): a native select listing every theme in tokens/themes/
// (generated into src/styles/themes.ts), so a new theme appears here without code changes.
// Native rather than React Aria's Select: it ships no extra code with every page, and the
// browser's own picker is accessible on every platform and follows the theme's color scheme.
import { useId, useState } from 'react'
import { THEMES } from '@/styles/themes'
import { currentTheme, switchTheme } from '@/theme'

/**
 * "Look: [Vintage ▾]". Picking a theme switches the whole app to it (with a cross-fade) and
 * remembers it on this device.
 * @param className - Placement from the footer.
 */
export function ThemePicker({ className = '' }: { className?: string }) {
  const id = useId()
  // Read once on mount: the boot script may already have applied a saved theme.
  const [theme, setTheme] = useState(() => currentTheme().id)
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label htmlFor={id}>Look</label>
      <select
        id={id}
        value={theme}
        onChange={(e) => {
          setTheme(e.target.value)
          void switchTheme(e.target.value)
        }}
        className="rounded-field border-2 border-field-border bg-field-bg px-2 py-1 font-label text-sm text-fg hover:border-field-border-focus"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  )
}
