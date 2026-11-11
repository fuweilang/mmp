import type { UserContentData } from '../contract/slots.ts';
/**
 * Separate display text, ordered attachments, and unknown content blocks.
 * @param content - stored content, including unknown legacy values.
 * @returns the standard user-content presentation.
 */
export declare function userMessageContent(content: readonly unknown[]): UserContentData;
//# sourceMappingURL=user-message-content.d.ts.map