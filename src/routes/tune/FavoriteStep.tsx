// Onboarding step 1: a favorite film, chosen with the search field above.
import { useQuery } from '@tanstack/react-query'
import { movieQueries } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Prompt } from './Prompt'
import { primary } from './styles'
import type { StepProps } from './useTuneState'

/** Step 1: pick a favorite film with the search above (Detail → back keeps it). */
export function FavoriteStep({ state, update }: StepProps) {
  // Load the chosen film's details to show its title (only once one is chosen).
  const favorite = useQuery({
    ...movieQueries.detail(state.favorite ?? 0),
    enabled: !!state.favorite,
  }).data
  return (
    <>
      <Prompt eyebrow="One more signal" title="What’s your favorite movie?">
        <p className="mt-3 mb-4 max-w-md leading-relaxed text-content-muted">
          Use the search above to find a favorite. You can tag it there and come right back.
        </p>
        {favorite && (
          <p className="mb-3 ml-auto flex w-fit items-center gap-2 border-2 border-border-accent bg-background-overlay px-3 py-1.5 text-content">
            <Icon name="check" />
            <span className="flex flex-col">
              <small className="text-sm text-content-muted">Your pick</small>
              <strong className="text-sm">{favorite.title}</strong>
            </span>
          </p>
        )}
        <Button
          isDisabled={!favorite}
          onPress={() => update({ step: 2, pick: undefined, n: 1 })}
          className={primary}
        >
          Find my taste <Icon name="arrow" />
        </Button>
        <Button
          onPress={() => update({ step: 2, pick: undefined, n: 1 })}
          className="mt-1 ml-auto block min-h-11 px-3 text-sm text-content-muted"
        >
          {/* The favorite is optional. */}
          Skip favorite movie
        </Button>
      </Prompt>
    </>
  )
}
