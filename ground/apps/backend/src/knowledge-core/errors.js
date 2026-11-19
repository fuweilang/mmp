/** Safe application codes only. Never attach request URLs, headers or upstream bodies. */
export class KnowledgeCoreError extends Error {
    code;
    transient;
    constructor(code, transient = false) {
        super(code);
        this.code = code;
        this.transient = transient;
        this.name = 'KnowledgeCoreError';
    }
}
export function safeKnowledgeError(error) {
    return error instanceof KnowledgeCoreError
        ? error
        : new KnowledgeCoreError('KNOWLEDGE_INTERNAL_ERROR');
}
//# sourceMappingURL=errors.js.map