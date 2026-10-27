// Account settings for passkey accounts (ADR-0031 A2b, owner decision 2026-10-07): change the
// account's name, and delete the account. Shown on the Account page only when the session provider
// supports them (real accounts); the demo and practice accounts don't get these.
//
// Deleting takes two presses ("Delete account", then "Yes, delete my account"), like Sign out, and
// says plainly that it can't be undone. The passkey itself lives in the person's password manager,
// which the site can't reach, so the copy tells them where to remove it.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, FieldError, Form, Input, Label, TextField } from 'react-aria-components'
import { z } from 'zod'
import { registrationSchema } from '@/adapters/SessionProvider'
import { withToast } from '@/notify'
import { useSession } from '@/session/SessionContext'

// Same field styles as the registration form.
const fieldBox =
  'focus-ring-within flex min-h-12 items-center border-2 border-field-border bg-field-bg rounded-field focus-within:border-field-border-focus group-data-invalid:border-fg-danger'
const inputClass =
  'min-w-0 flex-1 self-stretch bg-transparent px-3 text-base text-fg outline-none placeholder:text-fg-placeholder'
const cardClass =
  'grid content-start gap-2.5 border-2 border-card-border bg-card-bg rounded-card p-4'
const secondaryButton =
  'flex h-11 items-center justify-center border-2 border-button-secondary-border bg-button-secondary-bg rounded-button px-3.5 font-display text-base tracking-widest case-display text-button-secondary-fg data-pending:opacity-70'

/** "Change name" and "Delete account" cards for a passkey account. */
export function AccountSettings({ name }: { name: string }) {
  const { rename, deleteAccount } = useSession()
  return (
    <>
      {rename && <ChangeName name={name} rename={rename} />}
      {deleteAccount && <DeleteAccount deleteAccount={deleteAccount} />}
    </>
  )
}

// The rename form: the same name rule as registration.
function ChangeName({ name, rename }: { name: string; rename: (name: string) => Promise<void> }) {
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const result = registrationSchema.shape.name.safeParse(
      new FormData(e.currentTarget).get('name'),
    )
    if (!result.success) {
      setErrors({ name: z.flattenError(result.error).formErrors })
      return
    }
    setErrors({})
    setPending(true)
    await withToast(() => rename(result.data), {
      success: 'Name saved.',
      error: 'Your name wasn’t saved. Try again.',
    })
    setPending(false)
  }

  return (
    <section aria-labelledby="name-heading" className={cardClass}>
      <h2 id="name-heading" className="font-display text-2xl tracking-wide case-display">
        Change name
      </h2>
      <Form
        onSubmit={submit}
        validationErrors={errors}
        validationBehavior="aria"
        className="grid gap-3"
      >
        <TextField
          name="name"
          defaultValue={name}
          isRequired
          autoComplete="name"
          // Clear the message while typing, not on blur: on blur it vanishes as the mouse goes
          // down on Save name, the button jumps up and the click misses (issue #60).
          onChange={() => setErrors({})}
          className="group grid gap-1.5"
        >
          <Label className="text-sm font-bold">Name</Label>
          <div className={fieldBox}>
            <Input className={inputClass} />
          </div>
          <FieldError className="text-sm text-fg-danger" />
        </TextField>
        <Button type="submit" isPending={pending} className={`${secondaryButton} w-36`}>
          Save name
        </Button>
      </Form>
    </section>
  )
}

// Delete, with a confirm step and honest copy about what happens.
function DeleteAccount({ deleteAccount }: { deleteAccount: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const askRef = useRef<HTMLButtonElement>(null)
  // After "Delete account", focus moves to the confirm button the press revealed.
  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
  }, [confirming])

  async function confirmDelete() {
    setPending(true)
    // Once it's gone, the route guard (RequireAccount) takes this page to the landing page, where
    // the toast confirms it. If it fails, the page stays so they can try again.
    const deleted = await withToast(deleteAccount, {
      success: 'Your account was deleted.',
      error: 'Your account wasn’t deleted. Try again.',
    })
    if (!deleted) setPending(false)
  }

  return (
    <section aria-labelledby="delete-heading" className={cardClass}>
      <h2 id="delete-heading" className="font-display text-2xl tracking-wide case-display">
        Delete account
      </h2>
      <p className="text-sm text-fg-muted">
        Deletes your account and every list in it. This can’t be undone. Your passkey stays in your
        password manager; you can remove it there.
      </p>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            ref={confirmRef}
            onPress={confirmDelete}
            isPending={pending}
            className={secondaryButton}
          >
            Yes, delete my account
          </Button>
          <Button
            onPress={() => {
              setConfirming(false)
              // Return focus to "Delete account" once it's back on screen (next frame).
              requestAnimationFrame(() => askRef.current?.focus())
            }}
            className="flex h-11 items-center px-2 text-sm font-bold text-accent"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          ref={askRef}
          onPress={() => setConfirming(true)}
          className={`${secondaryButton} w-36`}
        >
          Delete account
        </Button>
      )}
    </section>
  )
}
