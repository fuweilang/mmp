import type { SessionId } from '@mammoth-ai/mmp-session'

/** Official Agent version whose ordinary model request carries Ground usage attribution. */
export interface GroundOfficialAttribution {
  readonly agentId: string
  readonly versionId: string
}

/** Per-process Session bindings owned by the Ground plugin composition. */
export class GroundRequestAttribution {
  private readonly bindings = new Map<SessionId, GroundOfficialAttribution>()

  /**
   * Associate one running Session with its frozen official version.
   * @param sessionId - running Agent Session.
   * @param attribution - official identifiers sent only for ordinary model requests.
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
