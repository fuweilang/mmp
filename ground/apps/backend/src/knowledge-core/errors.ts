/** Safe application codes only. Never attach request URLs, headers or upstream bodies. */
export class KnowledgeCoreError extends Error {
  constructor(
    readonly code: string,
    readonly transient = false,
  ) {
    super(code);
    this.name = 'KnowledgeCoreError';
  }
}
export function safeKnowledgeError(error: unknown): KnowledgeCoreError {
  return error instanceof KnowledgeCoreError
    ? error
    : new KnowledgeCoreError('KNOWLEDGE_INTERNAL_ERROR');
}
