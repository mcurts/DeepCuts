// Sonner's toast area, styled and placed for the app. Loaded on demand through <AppToaster /> so
// Sonner stays out of the first visit's bundle (see src/notify.ts).
import type { CSSProperties } from 'react'
import { Toaster } from 'sonner'
// Sonner's own stylesheet, bundled with the app's CSS. Sonner also tries to add these styles as an
// inline <style> tag, which the CSP blocks (style-src 'self', ADR-0008); this copy is what applies.
import 'sonner/dist/styles.css'
import { HEADER_HEIGHT_VAR } from '@/hooks/useHeaderHeight'

// Just below the page's header (its height comes from useHeaderHeight), with a small gap. On a
// page without a header the variable is unset, so toasts sit near the top of the window.
// Sonner applies this as a CSS variable through React's style prop, which the CSP allows.
const BELOW_HEADER = { top: `calc(var(${HEADER_HEIGHT_VAR}, 0px) + 12px)` }

// The theme's look (ADR-0040, ADR-0056), from the tokens: its container corners, an emphasis
// outline, the popover shadow and the label face. Sonner's own sizing, stacking and animation are kept; these classes
// only replace its colors, corners and type.
const TOAST_CLASSES = {
  toast:
    'rounded-container! border-2! border-border-emphasis! bg-surface-raised! font-label! text-base! text-fg! shadow-popover!',
  closeButton: 'rounded-control! border-border-emphasis! bg-surface-raised! text-fg!',
}
// Sonner pins the close button to the toast's top-left corner, half outside it. Move it to the
// top-right corner, where a close button is expected, through the variables Sonner reads.
const CLOSE_TOP_RIGHT = {
  '--toast-close-button-start': 'unset',
  '--toast-close-button-end': '0',
  '--toast-close-button-transform': 'translate(35%, -35%)',
} as CSSProperties

/**
 * The toast area: centered just below the header, at every screen size (owner, 2026-10-13); on
 * phones Sonner makes toasts full width with a 16px margin. Several at once are listed, not
 * stacked. Sonner's own z-index (999999999)
 * already sits above every layer in the app (highest: the film grain, z-60).
 */
export function SonnerToaster() {
  return (
    <Toaster
      position="top-center"
      offset={BELOW_HEADER}
      mobileOffset={BELOW_HEADER}
      theme="dark"
      // Several toasts show as a list, newest on top, instead of a collapsed stack that only
      // shows the newest until hovered (owner, 2026-10-13). Up to five at once; older ones wait
      // and appear as these close.
      expand
      visibleToasts={5}
      closeButton
      toastOptions={{ classNames: TOAST_CLASSES, style: CLOSE_TOP_RIGHT }}
    />
  )
}
