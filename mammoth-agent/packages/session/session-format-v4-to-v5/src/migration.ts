/** Adjacent identity body conversion with explicit V4 source admission. */
import { RELEASED_V4_EVENT_TYPES } from './source-event-types.ts'
import { assertReleasedV4Header, restoreReleasedV4Artifact } from '@mammoth-ai/mmp-session-format-v3-to-v4'
import { defineSessionFormatMigration, isSessionFormatJsonObject, SessionFormatError } from '@mammoth-ai/mmp-session-format'
import type { SessionFormatEvent } from '@mammoth-ai/mmp-session-format'
import { assertReleasedV5Header } from './validation.ts'
import { assertV4MigrationRowAdmission } from './codec.ts'

/** Preserve all V4 body coordinates, sources, opaque payloads and inherited cuts. */
export const sessionFormatV4ToV5 = defineSessionFormatMigration({
  name: '@mammoth-ai/mmp-session-format-v4-to-v5', fromVersion: 4, toVersion: 5,
  migrateHeader(header) { assertReleasedV4Header(header); return { ...header, version: 5 } },
  validateTargetHeader: assertReleasedV5Header,
  createStage(input) {
    const events: SessionFormatEvent[] = []
    let cut = input.sourceHeader.isSeeded ? input.sourceInheritedEventCount : 0
    return {
      ...(cut === undefined ? {} : { headerInheritedEventCount: cut }),
      transformEvent(event, context) {
        assertV4MigrationRowAdmission(event)
        if (event.type === 'session/end-seed' && isSessionFormatJsonObject(event.data) && event.data['inherited'] === true) cut = event.seq
        if (event.type === 'session-log-deepseek/delivery-accepted' && isSessionFormatJsonObject(event.data) && event.data['sessionFormatVersion'] === 5) {
          throw new SessionFormatError('format v4 delivery marker claims target format v5')
        }
        events.push(event)
        context.emitEvent(event)
      },
      transformRun(run, context) { for (const event of run.expand()) this.transformEvent(event, context) },
      finish() {
        if (cut === undefined) throw new SessionFormatError('format v4 seeded Session lacks inherited cut')
        if (input.sourceInheritedEventCount !== undefined && cut !== input.sourceInheritedEventCount) throw new SessionFormatError('format v4 inherited cut disagrees with marker')
        restoreReleasedV4Artifact({ header: input.sourceHeader, events, inheritedEventCount: cut }, RELEASED_V4_EVENT_TYPES)
        return cut
      },
    }
  },
})
