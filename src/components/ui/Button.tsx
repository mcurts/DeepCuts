// The app-owned button primitive. Feature code uses this entry point instead of depending on
// React Aria directly, so button-wide behavior and vendor changes stay in one place.
import { Button as AriaButton, type ButtonProps } from 'react-aria-components'
import type { Ref } from 'react'

/** Props accepted by the app's accessible button primitive. */
export type AppButtonProps = ButtonProps & { ref?: Ref<HTMLButtonElement> | undefined }

/**
 * An accessible press button. It defaults to `type="button"`, the safe house convention: a
 * button submits a form only when its caller opts in with `type="submit"`.
 */
export function Button({ type = 'button', ...props }: AppButtonProps) {
  return <AriaButton type={type} {...props} />
}
