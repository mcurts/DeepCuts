// The app-owned accessible form boundary. It fixes the validation behavior that every form uses
// while leaving each feature responsible for its fields, schema and submission work.
import { Form as AriaForm, type FormProps } from 'react-aria-components'
import type { Ref } from 'react'

/** Props accepted by the app's accessible form primitive. */
export type AppFormProps = FormProps & { ref?: Ref<HTMLFormElement> | undefined }

/**
 * An accessible form whose errors are announced without native browser validation bubbles. Zod
 * remains the source of truth for validation; React Aria connects its messages to each field.
 */
export function Form({ validationBehavior = 'aria', ...props }: AppFormProps) {
  return <AriaForm validationBehavior={validationBehavior} {...props} />
}
