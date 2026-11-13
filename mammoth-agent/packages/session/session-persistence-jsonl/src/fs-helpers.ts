/**
 * Filesystem-failure and listing helpers shared by the JSONL backend's read,
 * write, and migration paths: absence classification, preserve-errno checks,
 * and abort-aware waiting over shared work.
 * @module @mammoth-ai/mmp-session-persistence-jsonl/errors
 */

import type { LimitFunction } from 'p-limit'

/**
 * Whether a filesystem error means absence; every non-ENOENT failure must surface.
 * @param error - the caught failure.
 * @returns whether its errno code is `ENOENT`.
 */
export function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

/**
 * Run `task` over `items` through the backend's shared listing limiter and
 * settle every call. Callers consume the outcomes in input order, so the first
 * failure they report matches a sequential loop whatever the completion order.
 * A limited task must never wait on the same limiter.
 * @param limit - the backend's shared listing limiter.
 * @param items - inputs in their sequential order.
 * @param task - per-item operation.
 * @returns one outcome per item, in input order.
 */
export function settleLimited<T, R>(
  limit: LimitFunction,
  items: readonly T[],
  task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  return Promise.allSettled(items.map(item => limit(() => task(item))))
}

/**
 * Unwrap outcomes from {@link settleLimited}, rethrowing the first rejection in input order.
 * @param outcomes - outcomes in input order.
 * @returns the fulfilled values in input order.
 */
export function settledValues<R>(outcomes: readonly PromiseSettledResult<R>[]): R[] {
  return outcomes.map((outcome) => {
    if (outcome.status === 'rejected') throw outcome.reason
    return outcome.value
  })
}

/**
 * Whether a filesystem-owned failure should retain its original errno and path.
 * @param error - the caught failure.
 * @returns whether the failure carries a string errno code.
 */
export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof (error as NodeJS.ErrnoException | null)?.code === 'string'
}

/**
 * Preserve an Error abort reason and normalize hostile non-Error reasons.
 * @param signal - the aborted signal whose reason becomes the failure.
 * @returns the failure one waiting caller observes.
 */
export function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('session migration preparation aborted', { cause: signal.reason })
}

/**
 * Let one caller stop waiting without transferring cancellation ownership to shared work.
 * @param operation - the shared preparation promise every waiter observes.
 * @param signal - the waiting caller's lifetime; aborts only this wait.
 * @returns the operation's value, or the abort failure once the caller leaves.
 */
export function waitWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation
  /* v8 ignore next -- requireStoredLog synchronously rechecks the signal immediately before waiting. */
  if (signal.aborted) return Promise.reject(abortError(signal))
  return new Promise<T>((resolve, reject) => {
    const stopWaiting = (): void => {
      reject(abortError(signal))
    }
    signal.addEventListener('abort', stopWaiting, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', stopWaiting)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', stopWaiting)
        /* v8 ignore else -- the preparation owner normalizes every rejection before this waiter sees it. */
        if (error instanceof Error) {
          reject(error)
        } else {
          reject(new Error('session migration preparation failed', { cause: error }))
        }
      },
    )
  })
}
