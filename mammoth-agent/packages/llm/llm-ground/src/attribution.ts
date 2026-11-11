import type { GenerateOptions } from '@mammoth-ai/mmp-llm'
import type { SessionId } from '@mammoth-ai/mmp-session'

/** Official Agent version whose model requests carry Ground usage attribution. */
export interface GroundOfficialAttribution {
  readonly agentId: string
  readonly versionId?: string
  readonly previewId?: string
}

/** Final provider messages after all send-time fitting. */
export interface GroundWireBody {
  readonly messages: readonly { readonly role: string; readonly content?: unknown }[]
}
/** A Session owner validates its logged invariants at the last provider boundary. */
export type GroundWireGuard = (request: GenerateOptions, body: GroundWireBody) => void

/** Per-process Session bindings owned by the Ground plugin composition. */
export class GroundRequestAttribution {
  private readonly guards = new Map<SessionId, GroundWireGuard>()
  private readonly bindings = new Map<SessionId, GroundOfficialAttribution>()

  /** Register a lifecycle-owned final wire invariant; disposal removes only this registration.
   * @param sessionId - requesting Session.
   * @param guard - validator of the final provider body; throwing prevents HTTP.
   * @returns registration disposer.
   */
  guard(sessionId: SessionId, guard: GroundWireGuard): () => void {
    if (this.guards.has(sessionId)) throw new Error('Ground Session wire guard already registered')
    this.guards.set(sessionId, guard)
    return () => { if (this.guards.get(sessionId) === guard) this.guards.delete(sessionId) }
  }

  /** Validate the final wire for an owned Session, including purpose-qualified requests.
   * @param request - immutable provider request.
   * @param body - exact final fitted message body.
   */
  validateWire(request: GenerateOptions, body: GroundWireBody): void {
    if (request.sessionId !== undefined) this.guards.get(request.sessionId)?.(request, body)
  }

  /**
   * Associate one running Session with its frozen official version.
   * @param sessionId - running Agent Session.
   * @param attribution - official identifiers used for main-answer enforcement or separate helper origin attribution.
   */
  bind(sessionId: SessionId, attribution: GroundOfficialAttribution): void {
    this.bindings.set(sessionId, attribution)
  }

  /**
   * Remove a running Session binding.
   * @param sessionId - disposed Agent Session.
   */
  unbind(sessionId: SessionId): void {
    this.bindings.delete(sessionId)
  }

  /**
   * Read the official version for a model request.
   * @param sessionId - requesting Session.
   * @returns the current binding, or undefined for an ordinary Session.
   */
  officialFor(sessionId: SessionId): GroundOfficialAttribution | undefined {
    return this.bindings.get(sessionId)
  }
}
