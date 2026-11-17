import { getEncoding, type TiktokenEncoding } from 'js-tiktoken';
import type { TokenCounter } from './types';

/** A named BPE encoding, not a promise to match any proprietary model provider. */
export function createTokenCounter(encoding: TiktokenEncoding = 'cl100k_base'): TokenCounter {
  const tokenizer = getEncoding(encoding);
  return { encoding, count: text => tokenizer.encode(text, [], []).length };
}

let defaultCounter: TokenCounter | undefined;
export const DEFAULT_TOKEN_COUNTER: TokenCounter = {
  encoding: 'cl100k_base',
  count(text) {
    defaultCounter ??= createTokenCounter('cl100k_base');
    return defaultCounter.count(text);
  },
};

export function countTokens(text: string, counter: TokenCounter = DEFAULT_TOKEN_COUNTER): number {
  if (!counter.encoding?.trim()) throw new Error('Token counter must declare an encoding');
  const count = counter.count(text);
  if (!Number.isSafeInteger(count) || count < 0 || (text.length > 0 && count === 0)) {
    throw new Error('Token counter must return a positive safe integer for nonempty text');
  }
  return count;
}
