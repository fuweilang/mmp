/** Prepare durable user blocks for the standard attachment and text renderer. */
import { isLibrarySourceReference } from '@mammoth-ai/mmp-llm/user-content';
/**
 * Separate display text, ordered attachments, and unknown content blocks.
 * @param content - stored content, including unknown legacy values.
 * @returns the standard user-content presentation.
 */
export function userMessageContent(content) {
    const texts = [];
    const attachments = [];
    const extraBlocks = [];
    for (const block of content) {
        if (typeof block !== 'object' || block === null || !('type' in block)) {
            extraBlocks.push(block);
            continue;
        }
        if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
            if ('reference' in block && isLibrarySourceReference(block.reference)) {
                attachments.push({ type: 'library', reference: block.reference });
            }
            else
                texts.push(block.text);
        }
        else if (block.type === 'image' && 'attachment' in block && block.attachment !== undefined) {
            attachments.push({ type: 'image', image: { attachment: block.attachment } });
        }
        else if (block.type === 'file' && 'attachment' in block && block.attachment !== undefined) {
            attachments.push({ type: 'file', file: block.attachment });
        }
        else
            extraBlocks.push(block);
    }
    return { text: texts.join(''), attachments, extraBlocks };
}
//# sourceMappingURL=user-message-content.js.map