// The onboarding's state (step, favorite, current card), kept in the URL.
import { useSearchParams } from 'react-router'
import { z } from 'zod'

/** How many rating cards step 3 shows before finishing on Discover. */
export const PICKS = 3

// Onboarding state lives in the URL, so Detail → back restores it.
const paramsSchema = z.object({
  step: z.coerce.number().int().min(1).max(2).catch(1).default(1),
  favorite: z.coerce.number().int().positive().max(99_999_999).optional().catch(undefined),
  // The film on the rating card (a TMDB id) and how many cards have been shown (1..PICKS).
  pick: z.coerce.number().int().positive().max(99_999_999).optional().catch(undefined),
  n: z.coerce.number().int().min(1).max(PICKS).catch(1).default(1),
})
/** The onboarding state, read from (and validated against) the URL. */
export type TuneState = z.infer<typeof paramsSchema>

/**
 * Returns `[state, update]`. `update(patch)` merges a change into the URL; pass `replace` to
 * avoid adding a history entry (e.g. for small in-step changes).
 */
export function useTuneState() {
  const [params, setParams] = useSearchParams()
  const state = paramsSchema.parse(Object.fromEntries(params))
  const update = (patch: Partial<TuneState>, replace = false) => {
    const next = { ...state, ...patch }
    // Write only non-default values, so URLs stay short and readable.
    const out: Record<string, string> = { step: String(next.step) }
    if (next.favorite) out.favorite = String(next.favorite)
    if (next.pick) out.pick = String(next.pick)
    if (next.n > 1) out.n = String(next.n)
    setParams(out, { replace })
  }
  return [state, update] as const
}

/** Props every step component receives. */
export type StepProps = { state: TuneState; update: ReturnType<typeof useTuneState>[1] }
