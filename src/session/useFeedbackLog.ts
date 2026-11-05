// The current account's quick-action press log, for Discovery's quick actions to save
// to and the weights lab to learn from. One log per account, keyed like its cached lists
// (tagScope), so switching accounts never mixes presses. Signed out there are no tuned picks to
// press on, so there's no log.
import { useMemo } from 'react'
import { createLocalFeedbackLog, type FeedbackLog } from '@/adapters/local/LocalFeedbackLog'
import { useSession } from './SessionContext'
import { tagScope } from './tagQueries'

/** The signed-in account's press log, or undefined when signed out. */
export function useFeedbackLog(): FeedbackLog | undefined {
  const { session } = useSession()
  const scope = session.kind === 'account' ? tagScope(session) : undefined
  return useMemo(() => (scope ? createLocalFeedbackLog(`feedback-${scope}`) : undefined), [scope])
}
