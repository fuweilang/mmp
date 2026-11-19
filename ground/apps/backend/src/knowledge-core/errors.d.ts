/** Safe application codes only. Never attach request URLs, headers or upstream bodies. */
export declare class KnowledgeCoreError extends Error {
    readonly code: string;
    readonly transient: boolean;
    constructor(code: string, transient?: boolean);
}
export declare function safeKnowledgeError(error: unknown): KnowledgeCoreError;
//# sourceMappingURL=errors.d.ts.map