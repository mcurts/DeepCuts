// The error-log Worker (ADR-0058). Pages Functions have no Workers Logs, so the `/api` middleware
// sends each error line here over a service binding, and this Worker prints it, which Workers Logs
// keeps. The line was built and checked in server/errorLog.ts; it's checked again here, so even a
// line that somehow skipped that can't put anything else in the log.
import { WorkerEntrypoint } from 'cloudflare:workers'
import { acceptLine } from '../../../server/errorLog.ts'

/**
 * Called by the Pages Functions as `env.ERROR_LOG.report(line)` (an RPC over the service binding).
 * Not reachable from the internet: the Worker has no route and `workers_dev` is off.
 */
export default class ErrorLog extends WorkerEntrypoint {
  /** Writes one valid error line to the log; anything else is dropped. */
  async report(line: unknown): Promise<void> {
    const text = acceptLine(line)
    if (text) console.log(text)
  }

  /** Plain HTTP requests are refused: the only way in is the RPC method above. */
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 })
  }
}
