/** Native V5 validation retains V4 body semantics and advances delivery coordinates. */
import { assertReleasedV4Header, restoreReleasedV4Artifact, assertReleasedV4Relationships } from '@mammoth-ai/mmp-session-format-v3-to-v4'
import { SessionFormatError, isSessionFormatJsonObject } from '@mammoth-ai/mmp-session-format'
import type { SessionFormatArtifact, SessionFormatHeader } from '@mammoth-ai/mmp-session-format'

/**
 * Validate native V5 metadata.
 * @param header - untrusted logical header.
 */
export function assertReleasedV5Header(header: unknown): void {
  if (!isSessionFormatJsonObject(header) || header['version'] !== 5) throw new SessionFormatError('expected format v5 header')
  assertReleasedV4Header({ ...header, version: 4 })
}

// The retained validator owns unchanged body rules. Only its validation view translates
// generation-relative delivery coordinates; the original artifact is never rewritten.
function validationView(artifact: SessionFormatArtifact): SessionFormatArtifact {
  return { ...artifact, header: { ...artifact.header, version: 4 }, events: artifact.events.map((event) => {
    if (event.type !== 'session-log-deepseek/delivery-accepted' || !isSessionFormatJsonObject(event.data)) return event
    const version = event.data['sessionFormatVersion']
    return version === 4 || version === 5
      ? { ...event, data: { ...event.data, sessionFormatVersion: version === 5 ? 4 : 0 } }
      : event
  }) }
}

/**
 * Validate native V5 relationships before recovery completes.
 * @param artifact - decoded artifact.
 * @param knownEventTypes - installed event names.
 */
export function assertReleasedV5Relationships(artifact: SessionFormatArtifact, knownEventTypes: ReadonlySet<string>): void {
  assertReleasedV4Relationships(validationView(artifact), knownEventTypes)
}

/**
 * Restore V5 without rewriting any body object.
 * @param artifact - complete artifact.
 * @param knownEventTypes - installed event names.
 * @returns the admitted original artifact.
 */
export function restoreReleasedV5Artifact(artifact: SessionFormatArtifact, knownEventTypes: ReadonlySet<string>): SessionFormatArtifact {
  assertReleasedV5Header(artifact.header)
  restoreReleasedV4Artifact(validationView(artifact), knownEventTypes)
  return artifact
}

/**
 * Decode the V5 header using unchanged V4 field rules.
 * @param header - V5 logical header.
 * @returns V4 validation view.
 */
export function v4HeaderView(header: SessionFormatHeader): SessionFormatHeader {
  assertReleasedV5Header(header)
  return { ...header, version: 4 }
}
