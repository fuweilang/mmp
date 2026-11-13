/**
 * One Remote call's invocation context: the signal its method observes, the
 * uplink decoder, and the downlink cancellation of a streamed result.
 * @module @mammoth-ai/mmp-api-gateway/invocation
 */

import {
  RemoteError,
  remoteErrorOf,
  type PeerScope,
  type RemoteInvocation,
  type TypertCodec,
} from '@mammoth-ai/mmp-typert-protocol'
import type { InvokeRemoteRequest } from './types.ts'
import { decode, isObject } from './binding.ts'
import { TypertGatewayError } from './errors.ts'

/** Signal of an invocation whose carrier supplies none. */
export const NEVER_ABORTED_SIGNAL = new AbortController().signal
const UPLINK_DONE: IteratorReturnResult<undefined> = { value: undefined, done: true }

/** Carrier inputs `GatewayInvocation.uplink()` decodes on first use. */
export interface UplinkSource {
  readonly window: RemoteInvocation['uplinkWindow']
  /** Carrier items; an immediately ended iterable when the carrier has none. */
  readonly source: AsyncIterable<unknown>
  /** Descriptor codec, or the JSON-safety codec when the descriptor declares no uplink. */
  readonly codec: TypertCodec
  readonly endpoint: string
  /** Fail the logical stream with a Remote failure as the reason. */
  readonly abort: (reason: unknown) => void
}

/**
 * The signal a method observes. A carrier that supplies an uplink fails the
 * stream through `control` when an item is rejected, so that invocation joins
 * `control` with the carrier signal; a stream also ends with its Peer. Every
 * other invocation keeps the carrier signal's identity.
 * @param request - the decoded call request.
 * @param control - per-invocation cancellation control.
 * @param stream - whether the call returns a downlink stream.
 * @returns the signal the business method reads.
 */
export function methodSignal(request: InvokeRemoteRequest, control: AbortController, stream: boolean): AbortSignal {
  const carrier = request.signal
  if (request.uplink === undefined && !stream) return carrier ?? NEVER_ABORTED_SIGNAL
  const joined = carrier === undefined || carrier === control.signal ? [control.signal] : [carrier, control.signal]
  // `AbortSignal.any` leaves each source only a weak reference to the joined signal,
  // so per-stream joins on a Host-lifetime Peer signal accumulate nothing.
  return AbortSignal.any(stream ? [...joined, request.peer.signal] : joined)
}

/**
 * Refuse a call whose Peer has been disposed.
 * @param peer - Peer the call speaks for.
 * @param endpoint - endpoint named in the failure.
 * @throws {@link TypertGatewayError} `gateway/peer-disposed` once the Peer is disposed.
 */
export function assertPeerLive(peer: PeerScope, endpoint: string): void {
  if (peer.signal.aborted) {
    throw new TypertGatewayError('gateway/peer-disposed', endpoint, 'the calling Peer has been disposed')
  }
}

/**
 * Whether a method return value can be relayed as a downlink stream.
 * @param value - the candidate value.
 * @returns whether the value exposes a sync or async iterator factory.
 */
export function isIterable(value: unknown): value is Iterable<unknown> | AsyncIterable<unknown> {
  return isObject(value)
    && (typeof Reflect.get(value, Symbol.iterator) === 'function'
      || typeof Reflect.get(value, Symbol.asyncIterator) === 'function')
}

/**
 * Relay one method-returned iterable as the call's downlink, failing it on abort.
 * @param source - the iterable the method returned.
 * @param endpoint - canonical endpoint named in failures.
 * @param invocation - the call whose uplink must close first.
 * @returns the downlink generator.
 */
export async function *cancellableStream(
  source: Iterable<unknown> | AsyncIterable<unknown>,
  endpoint: string,
  invocation: GatewayInvocation,
): AsyncGenerator {
  const { signal } = invocation
  const asyncFactory: unknown = Reflect.get(source, Symbol.asyncIterator)
  const syncFactory: unknown = Reflect.get(source, Symbol.iterator)
  const iterator = typeof asyncFactory === 'function'
    ? Reflect.apply(asyncFactory, source, []) as AsyncIterator<unknown>
    : Reflect.apply(syncFactory as (...args: never[]) => Iterator<unknown>, source, [])
  let rejectAbort: ((error: unknown) => void) | undefined
  const onAbort = (): void => {
    rejectAbort?.(streamAbortFailure(endpoint, signal.reason))
  }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    while (true) {
      if (signal.aborted) throw streamAbortFailure(endpoint, signal.reason)
      // Reusing a pending cancellation promise retains every completed race.
      const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
      // next() can abort and throw synchronously before the race subscribes.
      void aborted.catch(() => undefined)
      const next = await Promise.race([Promise.resolve(iterator.next()), aborted])
      rejectAbort = undefined
      if (next.done === true) return
      yield next.value
    }
  } finally {
    rejectAbort = undefined
    signal.removeEventListener('abort', onAbort)
    // The uplink closes first so a method blocked on `uplink.next()` unwinds
    // before its iterator is asked to return.
    await invocation.close()
    await iterator.return?.()
  }
}

/**
 * The failure a stream surfaces for its abort: a Remote failure used as the
 * reason is the Gateway or carrier failing the stream itself (a rejected,
 * overflowing, or misplaced uplink item); any other abort is a cancellation.
 * @param endpoint - canonical endpoint named in failures.
 * @param reason - the abort reason.
 * @returns the failure to throw.
 */
function streamAbortFailure(endpoint: string, reason: unknown): unknown {
  return remoteErrorOf(reason) === undefined ? remoteCancelled(endpoint, reason) : reason
}

/**
 * Express carrier-signal cancellation in the shared failure vocabulary.
 * @param endpoint - canonical endpoint named in the failure.
 * @param cause - the abort reason the failure carries.
 * @returns the `gateway/cancelled` failure.
 */
export function remoteCancelled(endpoint: string, cause: unknown): RemoteError<'gateway/cancelled'> {
  return new RemoteError('gateway/cancelled', `Remote invocation "${endpoint}" was aborted`, {}, { cause })
}

/**
 * The iterable `invocation.uplink()` returns. Each uplink item passes the
 * descriptor codec, or the JSON-safety check when the descriptor declares no
 * uplink, before delivery; a rejected item fails the whole logical stream.
 * Iteration ends when the Client half-closes or the downlink finishes, and
 * fails when the stream is cancelled, so a method blocked on the uplink always
 * wakes.
 */
class UplinkDecoder implements AsyncIterable<unknown>, AsyncIterator<unknown> {
  private readonly source: AsyncIterator<unknown>
  private readonly interrupted = new Set<PromiseWithResolvers<IteratorResult<unknown>>>()
  private readonly onAbort = (): void => {
    const failure = streamAbortFailure(this.endpoint, this.signal.reason)
    for (const read of this.interrupted) read.reject(failure)
  }
  private closed = false

  constructor(
    uplink: AsyncIterable<unknown>,
    private readonly codec: TypertCodec,
    private readonly endpoint: string,
    private readonly signal: AbortSignal,
    private readonly abort: (reason: unknown) => void,
  ) {
    this.source = uplink[Symbol.asyncIterator]()
    signal.addEventListener('abort', this.onAbort, { once: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<unknown> {
    return this
  }

  async next(): Promise<IteratorResult<unknown>> {
    // A cancelled stream reports the cancellation on every read, closed or not.
    if (this.signal.aborted) throw streamAbortFailure(this.endpoint, this.signal.reason)
    if (this.closed) return UPLINK_DONE
    // Only pending reads belong to the decoder; finish() must wake all of them.
    const interrupted = Promise.withResolvers<IteratorResult<unknown>>()
    this.interrupted.add(interrupted)
    // The source can abort and throw synchronously before the race subscribes.
    void interrupted.promise.catch(() => undefined)
    let next: IteratorResult<unknown>
    try {
      next = await Promise.race([this.source.next(), interrupted.promise])
    } finally {
      this.interrupted.delete(interrupted)
    }
    if (next.done === true) {
      this.finish()
      return UPLINK_DONE
    }
    let value: unknown
    try {
      // A top-level `undefined` is the absent `value` of its frame: without a codec it is the item itself.
      value = next.value === undefined && this.codec.mode === 'src-json'
        ? undefined
        : decode(this.codec, next.value, this.endpoint, 'uplink')
    } catch (failure) {
      // The codec failure (`gateway/input-invalid`, field `uplink`) fails the whole logical stream.
      this.abort(failure)
      throw failure
    }
    return { value, done: false }
  }

  /** Downlink finished or the method stopped reading: unread uplink items are dropped. */
  return(): Promise<IteratorResult<unknown>> {
    if (!this.closed) {
      this.finish()
      // The carrier owns the source iterator; a generator blocked in next()
      // completes this return once it yields, so it is not awaited here.
      void Promise.resolve().then(() => this.source.return?.()).catch(() => undefined)
    }
    return Promise.resolve(UPLINK_DONE)
  }

  private finish(): void {
    this.closed = true
    this.signal.removeEventListener('abort', this.onAbort)
    for (const read of this.interrupted) read.resolve(UPLINK_DONE)
  }
}

/**
 * The context of one Remote call as the receiving method reads it through
 * `this.ctx.invocation`. The uplink is decoded on first use and released when
 * the call's downlink finishes.
 */
export class GatewayInvocation implements RemoteInvocation {
  private decoder: UplinkDecoder | undefined
  private taken = false

  get uplinkWindow(): RemoteInvocation['uplinkWindow'] { return this.uplink_.window }

  /**
   * @param request - decoded endpoint and wire arguments.
   * @param service - Cordis service key of the receiver.
   * @param peer - Peer the call speaks for.
   * @param signal - the signal the method observes.
   * @param uplink - carrier items and the codec that decodes them.
   */
  constructor(
    readonly request: RemoteInvocation['request'],
    readonly service: string,
    readonly peer: PeerScope,
    readonly signal: AbortSignal,
    private readonly uplink_: UplinkSource,
  ) {}

  /**
   * @returns the decoded uplink items, available once per call.
   */
  uplink<In = unknown>(): AsyncIterable<In> {
    if (this.taken) {
      throw new Error(`typert gateway: ${this.uplink_.endpoint}: invocation.uplink() is available once per call`)
    }
    this.taken = true
    const { source, codec, endpoint, abort } = this.uplink_
    this.decoder = new UplinkDecoder(source, codec, endpoint, this.signal, abort)
    // The descriptor codec decides what arrives; `In` is the caller's assertion.
    return this.decoder as AsyncIterable<In>
  }

  /**
   * The downlink finished: release the uplink. Unread items are dropped, and a
   * carrier iterable the method never took is returned so it stops producing;
   * a later `uplink()` throws like a second one would.
   * @returns settles once a taken uplink has closed.
   */
  async close(): Promise<void> {
    if (this.decoder !== undefined) {
      await this.decoder.return()
      return
    }
    this.taken = true
    releaseUplink(this.uplink_.source)
  }
}

/**
 * Return a carrier uplink nobody will read, so it drops later items instead of
 * buffering them. The carrier owns the iterator and `return()` is not awaited:
 * a generator blocked in `next()` completes it only once it yields.
 * @param source - the carrier's uplink iterable.
 */
export function releaseUplink(source: AsyncIterable<unknown>): void {
  void Promise.resolve().then(() => source[Symbol.asyncIterator]().return?.()).catch(() => undefined)
}
