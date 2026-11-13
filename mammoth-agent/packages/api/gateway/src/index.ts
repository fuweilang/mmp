/**
 * Live Typert Remote dispatch over Cordis Services and registered providers.
 * Unary transport and response envelopes belong to Connection; live Remote
 * streams use the Gateway-owned WebSocket mux. RPC envelopes, call bindings,
 * invocation contexts, and the Remote event queue live in their own modules.
 * @module @mammoth-ai/mmp-api-gateway
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@mammoth-ai/cordis'
import type { RemoteAccessDecision } from '@mammoth-ai/mmp-api-remote-access'
import { callResources, eventResources } from './access.ts'
import type { WebUpgradeRoute } from '@mammoth-ai/mmp-host-webserver'
import { MAX_TIMER_DELAY_MS } from '@mammoth-ai/mmp-timeout'
import type {} from '@mammoth-ai/mmp-cmdline'
import z from '@mammoth-ai/schemastery'
export type { TypertGatewayFaultDetails } from './remote-error-codes.ts'
import {
  RemoteError,
  isRemoteJsonValue,
  remoteErrorOf,
  remoteMethods,
  type InvocationDescriptor,
  type InvocationParameterDescriptor,
  type PeerScope,
  type Principal,
  type RemoteAccessResource,
  type RemoteInvocation,
  type RemoteMethodMarker,
  type TypertCodec,
  type TypertGatewayBinding,
} from '@mammoth-ai/mmp-typert-protocol'
import type {
  InvokeRemoteRequest,
  PendingRemoteEventInfo,
  TypertGateway,
  TypertGatewayWireStream,
  TypertRemoteEventDispatch,
  TypertRemoteEventFrame,
  TypertRemoteEventInvocation,
  TypertRemoteEventOutcome,
  TypertRemoteEventSource,
} from './types.ts'
import {
  RemoteStreamMuxServer,
  rejectRemoteStreamUpgrade,
} from './stream-server.ts'
import {
  REMOTE_EVENT_STREAM_ENDPOINT,
  REMOTE_EVENT_STREAM_READY,
  REMOTE_EVENT_RESULT_ENDPOINT,
  REMOTE_STREAM_MUX_PATH,
  isRemoteEventAgentId,
  parseRemoteEventResult,
  projectRemoteEventRequest,
  restoreRemoteEventRejection,
  type RemoteEventCancellationFrame,
  type RemoteEventClientId,
  type RemoteEventEmitFrame,
  type RemoteEventHostInfo,
  type RemoteEventId,
  type RemoteEventInvocationFrame,
  type RemoteEventReadyFrame,
} from './stream-protocol.ts'
import {
  TypertGatewayError,
} from './errors.ts'
import {
  assertExactArguments,
  decode,
  isObject,
  isPlainObject,
  methodParameterNames,
  originalOf,
  readBinding,
  validateArguments,
  validateBinding,
} from './binding.ts'
import {
  assertPeerLive,
  cancellableStream,
  GatewayInvocation,
  isIterable,
  methodSignal,
  NEVER_ABORTED_SIGNAL,
  releaseUplink,
  remoteCancelled,
} from './invocation.ts'
import type { ConnectionRpcResult } from './envelope.ts'
import {
  encodeRpcResult,
  endpointOf,
  rpcError,
  rpcFailure,
} from './envelope.ts'
import { RemoteEventQueue } from './remote-event-queue.ts'

export { TypertGatewayError } from './errors.ts'
export type {
  InvokeRemoteRequest,
  PendingRemoteEventInfo,
  TypertGateway,
  TypertGatewayErrorCode,
  TypertGatewayWireStream,
  TypertRemoteEventContext,
  TypertRemoteEventDispatch,
  TypertRemoteEventFrame,
  TypertRemoteEventInvocation,
  TypertRemoteEventOutcome,
  TypertRemoteEventSource,
} from './types.ts'
export type { RemoteEventHostInfo } from './stream-protocol.ts'

interface PreparedInvocation {
  readonly endpoint: string
  readonly descriptor: InvocationDescriptor
  /** Service view bound to a Context carrying `invocation`, so the method reads it as `this.ctx.invocation`. */
  readonly receiver: object
  readonly args: readonly unknown[]
  readonly method: (...args: never[]) => unknown
  readonly invocation: GatewayInvocation
}

interface RegisteredRemoteEventSource {
  readonly lifetime: AbortController
  readonly done: Promise<void>
  readonly host: RemoteEventHostInfo
}

interface RemoteEventClient {
  readonly peer: PeerScope
  readonly id: RemoteEventClientId
  readonly queue: RemoteEventQueue
  readonly signal: AbortSignal
  readonly deliveries: Map<RemoteEventId, PendingRemoteEvent>
  /** The stream's Peer principal: only the owner answers scoped waterfalls and receives every broadcast. */
  readonly principal: Principal
  /** Only owner streams receive scoped waterfalls they could answer; other Peers receive admitted broadcasts only. */
  readonly answers: boolean
}

interface PendingRemoteEvent {
  readonly id: RemoteEventId
  readonly source: TypertRemoteEventInvocation
  readonly frame: RemoteEventInvocationFrame
  readonly deliveries: Set<RemoteEventClient>
  releaseContext: () => void
  releaseSignal: () => void
}

const DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS = 2_000
const DEFAULT_STREAM_INBOX_BYTES = 262_144
const EMPTY_ASYNC_ITERABLE: AsyncIterable<never> = {
  [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ value: undefined, done: true }) }),
}
const SRC_JSON_CODEC: TypertCodec = { mode: 'src-json' }

/** Gateway transport configuration. */
export interface Config {
  /** WebSocket Ping interval from 1 through 2,147,483,647 milliseconds. @default 2000 */
  readonly websocketHeartbeatIntervalMs?: number
  /** Buffered uplink frame bytes one logical stream may hold before it fails with `gateway/uplink-overflow`. @default 262144 */
  readonly streamInboxBytes?: number
  /** Per-message compression for the Remote stream WebSocket; `'none'` disables the extension. @default 'deflate' */
  readonly websocketCompression?: 'none' | 'deflate'
}

interface ResolvedConfig extends Config {
  readonly websocketHeartbeatIntervalMs: number
  readonly streamInboxBytes: number
  readonly websocketCompression: 'none' | 'deflate'
}

export class TypertGatewayService extends Service implements TypertGateway {
  static inject = ['typert', 'remoteAccess']
  static Config: z<Config> = z.object({
    websocketHeartbeatIntervalMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS)
      .default(DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS),
    streamInboxBytes: z.number().step(1).min(1).default(DEFAULT_STREAM_INBOX_BYTES),
    websocketCompression: z.union([z.const('none'), z.const('deflate')]).default('deflate'),
  })

  /** Carrier adapter shared by the WebSocket mux and local Host transports. */
  readonly wireStream: TypertGatewayWireStream = {
    open: (endpoint, payload, uplink, peer, signal) =>
      this.openWireStream(endpoint, payload, uplink, peer, signal, new AbortController()),
    failure: error => rpcError(error),
  }

  private srcClaims: ReadonlySet<string> | undefined
  private remoteEvents: RegisteredRemoteEventSource | undefined
  private readonly remoteEventClients = new Map<RemoteEventClientId, RemoteEventClient>()
  private readonly pendingRemoteEvents = new Map<RemoteEventId, PendingRemoteEvent>()

  /**
   * Register the Gateway against the active Typert registry.
   * WebSocket admission waits for launcher-owned application readiness when supplied;
   * direct invocation and in-process streams remain available independently.
   * @param ctx - owning Host Context with Typert registry access.
   * @param config - validated Gateway transport configuration.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'typertGateway')
    const resolved = config as ResolvedConfig
    ctx.on('internal/service', () => {
      this.srcClaims = undefined
    })
    ctx.inject(['connection'], (connectionCtx) => {
      connectionCtx.connection.rpc.intercept(
        '/api',
        endpoint => this.claimsEndpoint(endpoint),
        (endpoint, payload, signal, peer) => this.dispatchRpc(endpoint, payload, signal, peer),
      )
    })
    ctx.inject(['connection', 'webServer'], (webCtx) => {
      const listen = (): void => {
        const mux = new RemoteStreamMuxServer(
          (endpoint, payload, uplink, peer, control, window) =>
            this.openWireStream(endpoint, payload, uplink, peer, control.signal, control, window),
          this.wireStream.failure,
          {
            heartbeatIntervalMs: resolved.websocketHeartbeatIntervalMs,
            streamInboxBytes: resolved.streamInboxBytes,
            compression: resolved.websocketCompression === 'deflate',
          },
        )
        const releases = new Set<Promise<void>>()
        webCtx.effect(function* () {
          yield async () => {
            await mux.close()
            await Promise.all(releases)
          }
          const route: WebUpgradeRoute = {
            path: REMOTE_STREAM_MUX_PATH,
            handler: (req, socket, head) => {
              const admission = webCtx.connection.admitConnection(req)
              if ('rejection' in admission) {
                rejectRemoteStreamUpgrade(socket, admission.rejection)
                return
              }
              const release = (): void => {
                // release removes the API Peer synchronously, before awaiting
                // scope cleanup or any logical-stream iterator's return.
                const done = admission.release().catch((error: unknown) => {
                  console.error('[api-gateway] Peer release failed:', error)
                })
                releases.add(done)
                void done.then(() => { releases.delete(done) })
              }
              const closed = (): void => {
                socket.removeListener('error', release)
                release()
              }
              socket.on('error', release)
              socket.once('close', closed)
              if (socket.destroyed) {
                closed()
                return
              }
              try {
                mux.handleUpgrade(req, socket, head, admission.peer)
              } catch (error) {
                release()
                socket.destroy()
                console.error('[api-gateway] Remote stream upgrade failed:', error)
              }
            },
          }
          yield webCtx.webServer.registerUpgrade(route)
        }, `api-gateway: ${REMOTE_STREAM_MUX_PATH} WebSocket`)
      }
      // Existing pages reconnect before the new Host prints its URL. No stream
      // may enter until the launcher has activated and audited its controllers.
      const ready = webCtx.get('appReady')
      if (ready === undefined) listen()
      else webCtx.effect(() => {
        let closed = false
        const cancel = ready.onReady(() => { if (!closed) listen() })
        return () => {
          closed = true
          cancel()
        }
      }, 'api-gateway: application readiness')
    })
  }

  /**
   * Check for an active owner Client event stream, the only kind that can answer forwarded waterfalls.
   * @returns whether an owner stream is open and has not been cancelled.
   */
  hasLiveClient(): boolean {
    for (const client of this.remoteEventClients.values()) {
      if (client.answers && !client.signal.aborted) return true
    }
    return false
  }

  /**
   * Inspect unsettled forwarded events without changing their lifetime.
   * @returns detached event names and Agent identities.
   */
  getPendingRemoteEvents(): readonly PendingRemoteEventInfo[] {
    return [...this.pendingRemoteEvents.values()].map(({ frame }) => ({ event: frame.event, agentId: frame.agentId }))
  }

  /**
   * Register the sole application-selected forwarded-event source.
   * @param source - stream factory installed by the Remote assembly.
   * @param host - stable Host facts included in each Client generation's opening frame.
   * @returns disposer removing this source and cancelling its active streams.
   */
  registerRemoteEvents(
    source: TypertRemoteEventSource,
    host: RemoteEventHostInfo,
  ): () => Promise<void> {
    if (this.remoteEvents !== undefined) {
      throw new Error('typert gateway: forwarded Remote event source is already registered')
    }
    const lifetime = new AbortController()
    const stream = source(lifetime.signal)
    const done = this.consumeRemoteEvents(stream, lifetime.signal).catch((error: unknown) => {
      if (this.remoteEvents?.lifetime !== lifetime || lifetime.signal.aborted) return
      this.closeRemoteEvents(error)
      this.remoteEvents = undefined
      lifetime.abort(error)
    })
    const registration: RegisteredRemoteEventSource = { lifetime, done, host: { home: host.home } }
    this.remoteEvents = registration
    return async () => {
      if (this.remoteEvents === registration) {
        this.remoteEvents = undefined
        const error = new Error('typert gateway: forwarded Remote event source was removed')
        registration.lifetime.abort(error)
        this.closeRemoteEvents(error)
      }
      await registration.done
    }
  }

  private claimsEndpoint(endpoint: string): boolean {
    if (endpoint === REMOTE_EVENT_RESULT_ENDPOINT) return true
    const segments = endpoint.split('/')
    if (segments.length !== 2 || segments[0] === '' || segments[1] === '') return false
    if (this.ctx.typert.local.get(endpoint) !== undefined || this.ctx.typert.local.hasSeen(endpoint)) return true
    this.srcClaims ??= this.collectSrcClaims()
    return this.srcClaims.has(endpoint)
  }

  /**
   * The `resources` readers of a method, read from the root Service's class
   * metadata so a Context method's receiver is not resolved before access is
   * decided; `undefined` when the Service is absent or the method declares none.
   */
  private resourceReaders(descriptor: InvocationDescriptor): RemoteMethodMarker['resources'] {
    const receiver: unknown = this.ctx.get(descriptor.service)
    if (!isObject(receiver)) return undefined
    const member = descriptor.implementation ?? descriptor.method
    return remoteMethods(originalOf(receiver)).find(marker => marker.method === member)?.resources
  }

  private collectSrcClaims(): ReadonlySet<string> {
    const claims = new Set<string>()
    for (const [serviceKey, definition] of Object.entries(this.ctx.reflect.props)) {
      if (definition.type !== 'service') continue
      const receiver: unknown = this.ctx.get(serviceKey)
      if (!isObject(receiver)) continue
      const original = originalOf(receiver)
      const binding: unknown = Reflect.get(original, 'typertRemote')
      if (!isObject(binding) || typeof Reflect.get(binding, 'namespace') !== 'string') continue
      const namespace = Reflect.get(binding, 'namespace') as string
      for (const candidate of remoteMethods(original)) {
        claims.add(endpointOf(namespace, candidate.exportName ?? candidate.method))
      }
    }
    return claims
  }

  /**
   * Invoke one live Remote method through strict generated reflection or SRC markers.
   * @param request - decoded endpoint and exact named wire arguments.
   * @returns the business result without output decoding.
   * @throws {@link TypertGatewayError} for dispatch, provider, or boundary failures; lookup-policy and business errors retain identity.
   */
  async invoke(request: InvokeRemoteRequest): Promise<unknown> {
    return this.invokePrepared(await this.prepareInvocation(request, new AbortController()))
  }

  private async invokePrepared(prepared: PreparedInvocation): Promise<unknown> {
    if (prepared.descriptor.mode !== undefined) {
      throw new TypertGatewayError(
        'gateway/signature-invalid',
        prepared.endpoint,
        'stream Remote methods must be opened through the stream carrier',
      )
    }

    try {
      return await Reflect.apply(prepared.method, prepared.receiver, prepared.args) as unknown
    } catch (error) {
      if (prepared.invocation.signal.aborted) throw remoteCancelled(prepared.endpoint, error)
      throw error
    } finally {
      // A unary call's uplink is readable only while the method runs.
      await prepared.invocation.close()
    }
  }

  /**
   * Open one live stream Remote method without assuming a physical carrier.
   * @param request - decoded endpoint, named wire arguments, and the Client uplink when the carrier has one.
   * @returns a cancellation-aware iterable over the business results.
   */
  async stream(request: InvokeRemoteRequest): Promise<AsyncIterable<unknown>> {
    return this.openStream(request, new AbortController())
  }

  /**
   * `control` belongs to the logical stream: a rejected uplink item aborts it
   * with the Remote failure as the reason so the carrier delivers that failure.
   */
  private async openStream(request: InvokeRemoteRequest, control: AbortController): Promise<AsyncIterable<unknown>> {
    const prepared = await this.prepareInvocation(request, control)
    if (prepared.descriptor.mode === undefined) {
      await prepared.invocation.close()
      throw new TypertGatewayError(
        'gateway/signature-invalid',
        prepared.endpoint,
        'unary Remote methods cannot be opened through the stream carrier',
      )
    }
    let source: unknown
    try {
      source = Reflect.apply(prepared.method, prepared.receiver, prepared.args) as unknown
    } catch (error) {
      await prepared.invocation.close()
      if (prepared.invocation.signal.aborted) throw remoteCancelled(prepared.endpoint, error)
      throw error
    }
    if (!isIterable(source)) {
      await prepared.invocation.close()
      throw new TypertGatewayError(
        'gateway/result-invalid',
        prepared.endpoint,
        'stream Remote method did not return Iterable or AsyncIterable',
        { field: 'result' },
      )
    }
    return cancellableStream(source, prepared.endpoint, prepared.invocation)
  }

  private async dispatchRpc(
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
    peer: PeerScope,
  ): Promise<ConnectionRpcResult> {
    if (endpoint === REMOTE_EVENT_RESULT_ENDPOINT) {
      try {
        assertPeerLive(peer, endpoint)
        requireInteractions(peer, endpoint)
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- other packages merge non-owner kinds into PrincipalMap.
        if (peer.principal.kind !== 'owner') {
          throw new TypertGatewayError('gateway/invocation-unavailable', endpoint, 'only owner Peers answer forwarded Remote events')
        }
        const result = parseRemoteEventResultPayload(payload)
        const client = this.remoteEventClients.get(result.clientId)
        if (client === undefined) {
          throw new Error('typert gateway: Remote event result identifies no active event stream')
        }
        if (client.peer !== peer) {
          throw new TypertGatewayError(
            'gateway/interactions-forbidden', endpoint,
            'Remote event result belongs to another Peer',
          )
        }
        this.receiveRemoteEventResult(client, result)
        return { ok: true, value: undefined }
      } catch (error) {
        return rpcFailure(error)
      }
    }
    return this.invokeRpc(endpoint, payload, signal, peer)
  }

  private async openWireStream(
    endpoint: string,
    payload: unknown,
    uplink: AsyncIterable<unknown>,
    peer: PeerScope,
    signal: AbortSignal,
    control: AbortController,
    uplinkWindow?: RemoteInvocation['uplinkWindow'],
  ): Promise<AsyncIterable<unknown>> {
    if (endpoint === REMOTE_EVENT_STREAM_ENDPOINT) {
      // A Gateway-owned stream reads no uplink: releasing it now keeps its items out of the bounded inbox.
      releaseUplink(uplink)
      assertPeerLive(peer, endpoint)
      requireInteractions(peer, endpoint)
      return this.openRemoteEvents(payload, signal, peer)
    }
    return this.openStream({ ...remoteRequest(endpoint, payload, signal, peer), uplink, uplinkWindow }, control)
  }

  private async *openRemoteEvents(
    payload: unknown,
    signal: AbortSignal,
    peer: PeerScope,
  ): AsyncGenerator<
    RemoteEventEmitFrame | RemoteEventInvocationFrame | RemoteEventCancellationFrame
    | RemoteEventReadyFrame
  > {
    if (!isObject(payload)
      || !isPlainObject(payload)
      || Reflect.ownKeys(payload).length !== 1
      || !Object.hasOwn(payload, 'args')
      || !isObject(payload.args)
      || !isPlainObject(payload.args)
      || Reflect.ownKeys(payload.args).length !== 0) {
      throw new TypertGatewayError(
        'gateway/arguments-invalid',
        REMOTE_EVENT_STREAM_ENDPOINT,
        'forwarded Remote event stream requires an empty args object',
      )
    }
    const registration = this.remoteEvents
    if (registration === undefined) {
      throw new TypertGatewayError(
        'gateway/service-unavailable',
        REMOTE_EVENT_STREAM_ENDPOINT,
        'forwarded Remote event source is unavailable',
      )
    }
    const lifetime = AbortSignal.any([signal, registration.lifetime.signal, peer.signal])
    let clientId = randomUUID() as RemoteEventClientId
    while (this.remoteEventClients.has(clientId)) clientId = randomUUID() as RemoteEventClientId
    const client: RemoteEventClient = {
      peer,
      id: clientId,
      queue: new RemoteEventQueue(),
      signal: lifetime,
      deliveries: new Map(),
      principal: peer.principal,
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- other packages merge non-owner kinds into PrincipalMap.
      answers: peer.principal.kind === 'owner',
    }
    this.remoteEventClients.set(clientId, client)
    if (client.answers) {
      for (const pending of this.pendingRemoteEvents.values()) this.deliverRemoteEvent(pending, client)
    }
    try {
      yield { ...REMOTE_EVENT_STREAM_READY, clientId, host: registration.host }
      yield* client.queue.iterate(lifetime)
    } finally {
      this.removeRemoteEventClient(client)
    }
  }

  private async consumeRemoteEvents(
    source: AsyncIterable<TypertRemoteEventDispatch>,
    signal: AbortSignal,
  ): Promise<void> {
    for await (const dispatch of source) {
      if (signal.aborted) {
        if ('context' in dispatch) dispatch.reject(signal.reason)
        return
      }
      if ('context' in dispatch) this.startRemoteEvent(dispatch)
      else this.broadcastRemoteEvent(dispatch)
    }
    if (!signal.aborted) {
      throw new Error('typert gateway: forwarded Remote event source ended unexpectedly')
    }
  }

  private broadcastRemoteEvent(frame: TypertRemoteEventFrame): void {
    assertRemoteEventFrame(frame)
    const wire: RemoteEventEmitFrame = {
      type: 'emit',
      event: frame.event,
      args: frame.args,
    }
    let resolved = false
    let resources: readonly RemoteAccessResource[] | undefined
    for (const client of this.remoteEventClients.values()) {
      if (!client.answers) {
        // A non-owner receives the whole notification or nothing: its resources decide, payloads are never trimmed,
        // and a notification with invalid resources reaches no non-owner.
        if (!resolved) {
          resources = eventResources(frame.resources, frame.args)
          resolved = true
        }
        if (resources === undefined) continue
        if (this.ctx.remoteAccess.decide({ principal: client.principal, action: `event:${frame.event}`, resources }).kind === 'deny') continue
      }
      client.queue.push(wire)
    }
  }

  private startRemoteEvent(source: TypertRemoteEventInvocation): void {
    try {
      assertRemoteEventName(source)
      if (!isRemoteEventAgentId(source.context.agentId)) {
        throw new TypeError(
          'typert gateway: scoped Remote events require a non-empty Agent identity',
        )
      }
      const projected = projectRemoteEventRequest(source.request, source.context.subject)
      let id = randomUUID() as RemoteEventId
      while (this.pendingRemoteEvents.has(id)) id = randomUUID() as RemoteEventId
      let releaseContext: () => void
      try {
        const dispose = source.context.value.effect(
          () => () => {
            this.cancelRemoteEvent(
              pending,
              new Error('typert gateway: Remote event Agent Context was released'),
            )
          },
          `api-gateway: Remote event ${JSON.stringify(source.event)}`,
        )
        releaseContext = () => { void dispose() }
      } catch {
        source.resolve({ kind: 'next' })
        return
      }
      const signals = new Set(projected.signal === undefined ? [] : [projected.signal])
      const abort = (): void => {
        const reason: unknown = [...signals].find(signal => signal.aborted)?.reason
        this.cancelRemoteEvent(pending, reason instanceof Error
          ? reason
          : new Error('typert gateway: Remote event was cancelled', { cause: reason }))
      }
      const pending: PendingRemoteEvent = {
        id,
        source,
        frame: {
          type: 'waterfall',
          event: source.event,
          eventId: id,
          agentId: source.context.agentId,
          request: projected.request,
        },
        deliveries: new Set(),
        releaseContext,
        releaseSignal: () => {
          for (const signal of signals) signal.removeEventListener('abort', abort)
        },
      }
      this.pendingRemoteEvents.set(id, pending)
      for (const signal of signals) signal.addEventListener('abort', abort, { once: true })
      if ([...signals].some(signal => signal.aborted)) abort()
      else {
        for (const client of this.remoteEventClients.values()) {
          if (client.answers) this.deliverRemoteEvent(pending, client)
        }
      }
    } catch (error) {
      source.reject(error)
    }
  }

  private deliverRemoteEvent(pending: PendingRemoteEvent, client: RemoteEventClient): void {
    pending.deliveries.add(client)
    client.deliveries.set(pending.id, pending)
    client.queue.push(pending.frame)
  }

  private receiveRemoteEventResult(
    client: RemoteEventClient,
    result: ReturnType<typeof parseRemoteEventResult>,
  ): void {
    const pending = this.pendingRemoteEvents.get(result.eventId)
    // Settlement and Client replacement may race the result request. Results
    // from a completed event or a superseded delivery are idempotent no-ops.
    if (pending === undefined || !pending.deliveries.has(client)) return
    this.removeRemoteEventDelivery(pending, client)
    if (result.outcome.kind === 'result') {
      this.settleRemoteEvent(pending, {
        kind: 'result',
        value: result.outcome.value,
      })
    } else if (result.outcome.kind === 'rejected') {
      this.cancelRemoteEvent(pending, restoreRemoteEventRejection(result.outcome.error))
    } else if (pending.deliveries.size === 0) {
      this.settleRemoteEvent(pending, { kind: 'next' })
    }
  }

  private removeRemoteEventDelivery(pending: PendingRemoteEvent, client: RemoteEventClient): void {
    pending.deliveries.delete(client)
    client.deliveries.delete(pending.id)
  }

  private removeRemoteEventClient(client: RemoteEventClient): void {
    this.remoteEventClients.delete(client.id)
    for (const pending of [...client.deliveries.values()]) this.removeRemoteEventDelivery(pending, client)
    client.queue.end()
  }

  private settleRemoteEvent(pending: PendingRemoteEvent, outcome: TypertRemoteEventOutcome): void {
    this.finishRemoteEvent(pending)
    pending.source.resolve(outcome)
  }

  private cancelRemoteEvent(pending: PendingRemoteEvent, reason: unknown): void {
    if (this.pendingRemoteEvents.get(pending.id) !== pending) return
    this.finishRemoteEvent(pending)
    pending.source.reject(reason)
  }

  private finishRemoteEvent(pending: PendingRemoteEvent): void {
    this.pendingRemoteEvents.delete(pending.id)
    pending.releaseSignal()
    pending.releaseContext()
    const clients = new Set(pending.deliveries)
    for (const client of clients) this.removeRemoteEventDelivery(pending, client)
    const cancellation: RemoteEventCancellationFrame = {
      type: 'cancel',
      eventId: pending.id,
    }
    for (const client of clients) client.queue.push(cancellation)
  }

  private closeRemoteEvents(reason: unknown): void {
    for (const pending of [...this.pendingRemoteEvents.values()]) {
      this.cancelRemoteEvent(pending, reason)
    }
    for (const client of [...this.remoteEventClients.values()]) client.queue.end()
  }

  private async invokeRpc(
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
    peer: PeerScope,
  ): Promise<ConnectionRpcResult> {
    try {
      const prepared = await this.prepareInvocation(
        remoteRequest(endpoint, payload, signal, peer),
        new AbortController(),
      )
      const value = await this.invokePrepared(prepared)
      // A void or explicitly absent business result carries no `value` field;
      // JSON has no `undefined`, and the envelope's optional slot is the one
      // representation of absence that both args and results already use.
      return encodeRpcResult(value, prepared.descriptor.result)
    } catch (error) {
      return rpcFailure(error)
    }
  }

  /** `control` fails the logical stream when an uplink item is rejected; unary calls hand over an inert one. */
  private async prepareInvocation(
    request: InvokeRemoteRequest,
    control: AbortController,
  ): Promise<PreparedInvocation> {
    const endpoint = endpointOf(request.namespace, request.method)
    assertPeerLive(request.peer, endpoint)
    const descriptor = this.resolveDescriptor(request.namespace, request.method, endpoint)
    assertExactArguments(request.args, descriptor, endpoint)
    const validated = validateArguments(descriptor, request.args, endpoint)
    // Access precedes lookup resolution, so a refused call activates nothing.
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- other packages merge non-owner kinds into PrincipalMap.
    if (request.peer.principal.kind !== 'owner') {
      const resources = callResources(
        this.ctx.typert,
        this.resourceReaders(descriptor),
        descriptor,
        validated,
        request.signal ?? NEVER_ABORTED_SIGNAL,
      )
      const decision: RemoteAccessDecision = resources === undefined
        ? { kind: 'deny', reason: 'resource-invalid' }
        : this.ctx.remoteAccess.decide({
          principal: request.peer.principal,
          action: `${descriptor.namespace}/${descriptor.method}`,
          resources,
          args: validated,
        })
      if (decision.kind === 'deny') {
        throw new RemoteError('remote-access/denied', `remote access: ${endpoint}: access denied (${decision.reason})`, {
          action: endpoint,
          reason: decision.reason,
        })
      }
    }
    const receiverContext = await this.resolveReceiverContext(descriptor, validated, endpoint)
    const receiver: unknown = receiverContext.get(descriptor.service)
    if (!isObject(receiver)) {
      throw new TypertGatewayError(
        'gateway/service-unavailable',
        endpoint,
        `active Service ${JSON.stringify(descriptor.service)} is unavailable`,
      )
    }
    validateBinding(receiver, descriptor.service, descriptor.namespace, endpoint)
    const args = await Promise.all(descriptor.parameters.map(parameter =>
      this.resolveParameter(parameter, validated, endpoint)))
    const signal = methodSignal(request, control, descriptor.mode === 'stream')
    const invocation = new GatewayInvocation(
      { namespace: request.namespace, method: request.method, args: request.args },
      descriptor.service,
      request.peer,
      signal,
      {
        source: request.uplink ?? EMPTY_ASYNC_ITERABLE,
        window: request.uplinkWindow,
        codec: descriptor.uplink?.codec ?? SRC_JSON_CODEC,
        endpoint,
        abort: (reason) => { control.abort(reason) },
      },
    )
    if (descriptor.cancellation !== undefined) args.push(signal)
    // The method runs on a Service view bound to a Context carrying this call:
    // Cordis rebinds `this.ctx` to the accessing Context, so `this.ctx.invocation`
    // is this call and nothing travels through the parameter list. The view
    // resolves the Service the plain read above already found.
    const callReceiver = receiverContext.extend({ invocation }).get(descriptor.service) as object
    const implementation = descriptor.implementation ?? descriptor.method
    const method: unknown = Reflect.get(callReceiver, implementation)
    if (typeof method !== 'function') {
      throw new TypertGatewayError(
        'gateway/method-unavailable',
        endpoint,
        `active Service ${JSON.stringify(descriptor.service)} has no callable method ${JSON.stringify(implementation)}`,
      )
    }
    return {
      endpoint,
      descriptor,
      receiver: callReceiver,
      args,
      method: method as (...args: never[]) => unknown,
      invocation,
    }
  }

  private resolveDescriptor(namespace: string, method: string, endpoint: string): InvocationDescriptor {
    const strict = this.ctx.typert.local.get(endpoint)
    if (strict !== undefined) return strict
    if (this.ctx.typert.local.hasSeen(endpoint)) {
      throw new TypertGatewayError(
        'gateway/definition-unavailable',
        endpoint,
        'its strict definition was withdrawn and SRC fallback is forbidden',
      )
    }
    return this.resolveSrcDescriptor(namespace, method, endpoint)
  }

  private resolveSrcDescriptor(namespace: string, method: string, endpoint: string): InvocationDescriptor {
    const candidates: InvocationDescriptor[] = []
    for (const [serviceKey, definition] of Object.entries(this.ctx.reflect.props)) {
      if (definition.type !== 'service') continue
      const receiver: unknown = this.ctx.get(serviceKey)
      if (!isObject(receiver)) continue
      const original = originalOf(receiver)
      const value: unknown = Reflect.get(original, 'typertRemote')
      if (value === undefined) continue
      const binding = readBinding(value, original, serviceKey, endpoint)
      if (binding.namespace !== namespace) continue
      const marker = remoteMethods(original).find(candidate => (candidate.exportName ?? candidate.method) === method)
      if (marker === undefined) continue
      candidates.push(this.srcDescriptor(binding, marker, method, endpoint))
    }
    if (candidates.length === 0) {
      throw new TypertGatewayError('gateway/invocation-unavailable', endpoint, 'no active Remote method exports this endpoint')
    }
    if (candidates.length > 1) {
      throw new TypertGatewayError(
        'gateway/ambiguous-endpoint',
        endpoint,
        `multiple active Services export this endpoint: ${candidates.map(candidate => candidate.service).sort().join(', ')}`,
      )
    }
    return candidates[0] as InvocationDescriptor
  }

  private srcDescriptor(
    binding: TypertGatewayBinding,
    marker: ReturnType<typeof remoteMethods>[number],
    method: string,
    endpoint: string,
  ): InvocationDescriptor {
    const names = methodParameterNames(binding.service, marker.method, endpoint)
    const signalIndex = names.indexOf('signal')
    if (signalIndex >= 0 && signalIndex !== names.length - 1) {
      throw new TypertGatewayError(
        'gateway/signature-invalid',
        endpoint,
        'SRC cancellation parameter signal must be the final parameter',
        { field: 'signal' },
      )
    }
    const cancellation = signalIndex >= 0
      ? { parameter: 'signal' as const }
      : undefined
    const businessNames = cancellation === undefined ? names : names.slice(0, -1)
    const parameters: InvocationParameterDescriptor[] = []
    const wires = new Set<string>()
    for (const name of businessNames) {
      const matches = this.ctx.typert.lookups.definitions()
        .filter(definition => definition.parameter === name)
      if (matches.length > 1) {
        throw new TypertGatewayError(
          'gateway/signature-invalid',
          endpoint,
          `parameter ${JSON.stringify(name)} matches multiple lookup providers`,
          { field: name },
        )
      }
      const match = matches[0]
      const parameter: InvocationParameterDescriptor = match === undefined
        ? { name, wire: name, source: 'json', codec: { mode: 'src-json' } }
        : {
          name,
          wire: match.wire,
          source: 'lookup',
          lookup: match.key,
          codec: { mode: 'src-json' },
        }
      if (wires.has(parameter.wire)) {
        throw new TypertGatewayError(
          'gateway/signature-invalid',
          endpoint,
          `multiple parameters use wire field ${JSON.stringify(parameter.wire)}`,
          { field: parameter.wire },
        )
      }
      wires.add(parameter.wire)
      parameters.push(parameter)
    }

    let receiver: InvocationDescriptor['invocation'] = { kind: 'direct' }
    if (marker.invocation.kind === 'context') {
      const provider = this.ctx.typert.contexts.getHost(marker.invocation.context)
      if (provider === undefined) {
        throw new TypertGatewayError(
          'gateway/context-unavailable',
          endpoint,
          `Context provider ${JSON.stringify(marker.invocation.context)} is unavailable`,
        )
      }
      if (wires.has(provider.wire)) {
        throw new TypertGatewayError(
          'gateway/signature-invalid',
          endpoint,
          `Context identity conflicts with wire field ${JSON.stringify(provider.wire)}`,
          { field: provider.wire },
        )
      }
      receiver = {
        kind: 'context',
        context: marker.invocation.context,
        wire: provider.wire,
        codec: { mode: 'src-json' },
      }
    }

    return {
      id: `src:${binding.serviceKey}#${endpoint}`,
      service: binding.serviceKey,
      namespace: binding.namespace,
      method,
      ...(marker.method === method ? {} : { implementation: marker.method }),
      ...(marker.mode === undefined ? {} : { mode: marker.mode }),
      invocation: receiver,
      parameters,
      ...(cancellation === undefined ? {} : { cancellation }),
      result: { mode: 'src-json' },
    }
  }

  private async resolveReceiverContext(
    descriptor: InvocationDescriptor,
    args: Readonly<Record<string, unknown>>,
    endpoint: string,
  ): Promise<Context> {
    if (descriptor.invocation.kind === 'direct') return this.ctx
    const invocation = descriptor.invocation
    const provider = this.ctx.typert.contexts.getHost(invocation.context)
    if (provider === undefined) {
      throw new TypertGatewayError(
        'gateway/context-unavailable',
        endpoint,
        `Context provider ${JSON.stringify(invocation.context)} is unavailable`,
      )
    }
    if (provider.wire !== invocation.wire
      || (invocation.codec.mode === 'strict' && provider.wireTypeSymbol !== invocation.codec.typeSymbol)) {
      throw new TypertGatewayError(
        'gateway/provider-mismatch',
        endpoint,
        `Context provider ${JSON.stringify(invocation.context)} does not match its strict definition`,
        { field: invocation.wire },
      )
    }
    const identity = decode(invocation.codec, args[invocation.wire], endpoint, invocation.wire)
    let context: Context | undefined
    try {
      context = await provider.resolve(identity)
    } catch (cause) {
      if (remoteErrorOf(cause) !== undefined) throw cause
      throw new TypertGatewayError(
        'gateway/context-failed',
        endpoint,
        `Context provider ${JSON.stringify(invocation.context)} failed`,
        { cause, field: invocation.wire },
      )
    }
    if (context === undefined) {
      throw new TypertGatewayError(
        'gateway/context-not-found',
        endpoint,
        `Context provider ${JSON.stringify(invocation.context)} did not resolve the requested identity`,
        { field: invocation.wire },
      )
    }
    return context
  }

  private async resolveParameter(
    parameter: InvocationParameterDescriptor,
    args: Readonly<Record<string, unknown>>,
    endpoint: string,
  ): Promise<unknown> {
    // Lookup ids are never omissible, so an absent field belongs to a json parameter that takes undefined.
    if (!Object.hasOwn(args, parameter.wire)) return undefined
    if (parameter.source === 'json') return args[parameter.wire]
    const value = decode(parameter.codec, args[parameter.wire], endpoint, parameter.wire)
    const key = parameter.lookup
    /* v8 ignore next -- registry validation rejects strict descriptors without a key, and SRC derivation always supplies one. */
    if (key === undefined) {
      throw new TypertGatewayError(
        'gateway/lookup-unavailable',
        endpoint,
        `lookup parameter ${JSON.stringify(parameter.name)} has no provider key`,
        { field: parameter.wire },
      )
    }
    const provider = this.ctx.typert.lookups.get(key)
    if (provider === undefined) {
      throw new TypertGatewayError(
        'gateway/lookup-unavailable',
        endpoint,
        `lookup provider ${JSON.stringify(key)} is unavailable`,
        { field: parameter.wire },
      )
    }
    if (provider.wire !== parameter.wire
      || (parameter.codec.mode === 'strict' && provider.wireTypeSymbol !== parameter.codec.typeSymbol)) {
      throw new TypertGatewayError(
        'gateway/provider-mismatch',
        endpoint,
        `lookup provider ${JSON.stringify(key)} does not match its strict definition`,
        { field: parameter.wire },
      )
    }
    let resolved: unknown
    try {
      resolved = await provider.resolve(value)
    } catch (cause) {
      if (remoteErrorOf(cause) !== undefined) throw cause
      throw new TypertGatewayError(
        'gateway/lookup-failed',
        endpoint,
        `lookup provider ${JSON.stringify(key)} failed`,
        { cause, field: parameter.wire },
      )
    }
    if (resolved === undefined) {
      throw new TypertGatewayError(
        'gateway/lookup-not-found',
        endpoint,
        `lookup provider ${JSON.stringify(key)} did not resolve the requested identity`,
        { field: parameter.wire },
      )
    }
    return resolved
  }
}



function assertRemoteEventFrame(frame: TypertRemoteEventFrame): void {
  assertRemoteEventName(frame)
  if (!Array.isArray(frame.args) || !isRemoteJsonValue(frame.args)) {
    throw new TypeError(`typert gateway: Remote event ${JSON.stringify(frame.event)} arguments are not lossless JSON data`)
  }
}

function assertRemoteEventName(frame: { readonly event: unknown }): void {
  if (typeof frame.event !== 'string' || frame.event.length === 0) {
    throw new TypeError('typert gateway: Remote event name must be a nonempty string')
  }
}

function requireInteractions(peer: PeerScope, endpoint: string): void {
  if (peer.interactions !== 'answer') {
    throw new TypertGatewayError(
      'gateway/interactions-forbidden', endpoint,
      'forwarded Remote events require interactions=answer',
    )
  }
}

function parseRemoteEventResultPayload(payload: unknown): ReturnType<typeof parseRemoteEventResult> {
  if (!isObject(payload)
    || !isPlainObject(payload)
    || Reflect.ownKeys(payload).length !== 1
    || !Object.hasOwn(payload, 'args')) {
    throw new Error('typert gateway: Remote event result requires exactly one plain-object args field')
  }
  return parseRemoteEventResult(payload.args)
}

function remoteRequest(
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
  peer: PeerScope,
): InvokeRemoteRequest {
  // A disposed Peer is refused whatever it sent.
  assertPeerLive(peer, endpoint)
  const segments = endpoint.split('/')
  if (segments.length !== 2 || segments[0] === '' || segments[1] === '') {
    throw new Error(`invalid Remote endpoint ${JSON.stringify(endpoint)}`)
  }
  const [namespace, method] = segments as [string, string]
  if (!isObject(payload)
    || !isPlainObject(payload)
    || Reflect.ownKeys(payload).length !== 1
    || !Object.hasOwn(payload, 'args')
    || !isObject(payload.args)
    || !isPlainObject(payload.args)) {
    throw new Error('Remote payload must contain exactly one plain-object args field')
  }
  return { namespace, method, args: payload.args, signal, peer }
}




export default TypertGatewayService
