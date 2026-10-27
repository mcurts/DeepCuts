// The registration page (/register, ADR-0031): sign-up is by invitation, and the account's key
// is a passkey (fingerprint, face or device PIN), so the form only asks for a name and the invite
// code. The layout is plain until the owner designs it.
//
// An invite link (`/register?invite=…`) fills the code in, then the code is removed from the
// address bar so it doesn't linger in history or get shared by copying the URL.
//
// With real accounts (VITE_ACCOUNTS=cloudflare), the device creates a passkey and the server checks
// the invite (single use, not expired). With the local mock, a *practice* account is made on this
// device, only the name is kept, and the page says so (ADR-0025). Like sign-in, the page then
// returns to where sign-in started.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, FieldError, Form, Input, Label, Text, TextField } from 'react-aria-components'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { AccountsApiError } from '@/adapters/cloudflare/AccountsApiError'
import { registrationSchema } from '@/adapters/SessionProvider'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { useReturnPath } from './useReturnPath'
import { useRouteFocus } from '@/hooks/useRouteFocus'
import { notify, notifySignedIn } from '@/notify'
import { useSession } from '@/session/SessionContext'
import { AuthLayout } from './AuthLayout'

// Field errors by field name, in the shape React Aria's <Form validationErrors> expects.
type FieldErrors = Record<string, string[]>

// Shown under the invite field when the server refuses the code (used, expired or unknown). The
// server doesn't say which, so a guessed code learns nothing.
const INVITE_REFUSED = 'This invite can’t be used. It may have expired or been used already.'

// Shared field styles. The whole field box shows the focus ring (focus-ring-within), and turns
// the danger color while it has an error.
const fieldBox =
  'focus-ring-within flex min-h-12 items-center border-2 border-field-border bg-field-bg rounded-field focus-within:border-field-border-focus group-data-invalid:border-fg-danger'
const inputClass =
  'min-w-0 flex-1 self-stretch bg-transparent px-3 text-base text-fg outline-none placeholder:text-fg-placeholder'

/** The registration page (ADR-0031): a name and an invite code, then a passkey. */
export function RegisterPage() {
  useRouteFocus()
  const { session, register, practiceRegistration } = useSession()
  const navigate = useNavigate()
  const from = useReturnPath()
  const [errors, setErrors] = useState<FieldErrors>({})
  // Bumped on every rejected submit, so focus moves to the first problem even if the errors match.
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // The invite code from the link, read once on arrival (the field's starting value).
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [linkInvite] = useState(() => searchParams.get('invite') ?? '')
  // Then take it out of the address bar, keeping the `from` state that says where to return.
  useEffect(() => {
    if (searchParams.has('invite')) setSearchParams({}, { replace: true, state: location.state })
  }, [searchParams, setSearchParams, location.state])

  // After a rejected submit, put the cursor in the first field that needs fixing (its error
  // message is read out with it, through aria-describedby).
  useEffect(() => {
    if (attempt === 0) return
    formRef.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus()
  }, [attempt])

  // Arriving already signed in goes to the account page (not after registering here: then the
  // page returns to where sign-in started, and `pending` stays set until it does).
  if (session.kind === 'account' && !pending) return <Navigate to="/account" replace />

  // Validates every field at once, then registers and returns to where sign-in started.
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const result = registrationSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)))
    if (!result.success) {
      setErrors(z.flattenError(result.error).fieldErrors)
      setAttempt((n) => n + 1)
      return
    }
    setErrors({})
    setPending(true)
    try {
      notifySignedIn(await register(result.data), 'Account created. ')
      navigate(from, { replace: true })
    } catch (e) {
      setPending(false)
      // The server refused the invite: say so on the field, where the person can act on it.
      if (e instanceof AccountsApiError && e.code === 'invalid_invite') {
        setErrors({ invite: [INVITE_REFUSED] })
        setAttempt((n) => n + 1)
      } else notify.error('Registration didn’t finish. Nothing was changed. Try again.')
    }
  }

  return (
    <AuthLayout title="Create an account">
      <div>
        <Eyebrow>Your account</Eyebrow>
        <h1 className="font-display text-4xl leading-none tracking-wide case-display">
          Create an account
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Keep your lists in your account instead of a single browser.
        </p>
      </div>

      {/* ADR-0025's rule: a mock must never pass for a real account. */}
      {practiceRegistration && (
        <p className="border-2 border-dashed border-border-control p-3 text-sm text-fg-muted">
          <strong className="text-fg">Practice registration.</strong> No passkey or real account is
          created yet. Your name is kept on this device; the invite code is checked, then discarded.
        </p>
      )}

      {/* validationBehavior="aria": the browser's own popups stay off; Zod's messages show under
          each field instead, and editing a field clears its message. */}
      <Form
        ref={formRef}
        onSubmit={submit}
        validationErrors={errors}
        validationBehavior="aria"
        className="grid gap-4"
      >
        <TextField name="name" isRequired autoComplete="name" className="group grid gap-1.5">
          <Label className="text-sm font-bold">Name</Label>
          <div className={fieldBox}>
            <Input className={inputClass} />
          </div>
          <Text slot="description" className="text-sm text-fg-muted">
            Shown in the header and on your account.
          </Text>
          <FieldError className="text-sm text-fg-danger" />
        </TextField>

        <TextField
          name="invite"
          isRequired
          defaultValue={linkInvite}
          autoComplete="off"
          className="group grid gap-1.5"
        >
          <Label className="text-sm font-bold">Invite code</Label>
          <div className={fieldBox}>
            {/* No auto-capitalising or spell-check on phones: they'd change the code. */}
            <Input className={inputClass} autoCapitalize="none" spellCheck={false} />
          </div>
          <Text slot="description" className="text-sm text-fg-muted">
            Deep Cuts is invite-only for now. Your invite link fills this in.
          </Text>
          <FieldError className="text-sm text-fg-danger" />
        </TextField>

        <Button
          type="submit"
          isPending={pending}
          className="flex min-h-12 w-full items-center justify-center rounded-button bg-button-primary-bg font-display text-base tracking-widest text-button-primary-fg case-display hover:bg-button-primary-bg-hover data-pending:opacity-70"
        >
          Create passkey
        </Button>
        <p className="text-sm text-fg-muted">
          Your device asks for your fingerprint, face or PIN. That passkey is how you’ll sign in: no
          password.
        </p>
      </Form>
      <p role="status" className="text-sm text-fg-muted empty:hidden">
        {pending ? 'Creating your account…' : ''}
      </p>

      <p className="text-sm text-fg-muted">
        Already have an account?{' '}
        <Link to="/sign-in" state={{ from }} className="text-accent underline">
          Sign in
        </Link>
        . No invite?{' '}
        <Link to="/sign-in" state={{ from }} className="text-accent underline">
          Try the demo
        </Link>
        .
      </p>
    </AuthLayout>
  )
}
