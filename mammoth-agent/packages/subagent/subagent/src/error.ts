/**
 * Typed failures shared by subagent service and provider operations.
 *
 * @module @mammoth-ai/mmp-subagent
 */

import { HarnessError } from '@mammoth-ai/mmp-llm'

/** Typed failure for the subagent seam. */
export class SubagentError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'SubagentError'
  }
}
