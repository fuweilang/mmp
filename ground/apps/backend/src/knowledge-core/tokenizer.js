import { getEncoding } from 'js-tiktoken';
/** A named BPE encoding, not a promise to match any proprietary model provider. */
export function createTokenCounter(encoding = 'cl100k_base') {
    const tokenizer = getEncoding(encoding);
    return { encoding, count: text => tokenizer.encode(text, [], []).length };
}
let defaultCounter;
export const DEFAULT_TOKEN_COUNTER = {
    encoding: 'cl100k_base',
    count(text) {
        defaultCounter ??= createTokenCounter('cl100k_base');
        return defaultCounter.count(text);
    },
};
export function countTokens(text, counter = DEFAULT_TOKEN_COUNTER) {
    if (!counter.encoding?.trim())
        throw new Error('Token counter must declare an encoding');
    const count = counter.count(text);
    if (!Number.isSafeInteger(count) || count < 0 || (text.length > 0 && count === 0)) {
        throw new Error('Token counter must return a positive safe integer for nonempty text');
    }
    return count;
}
//# sourceMappingURL=tokenizer.js.map