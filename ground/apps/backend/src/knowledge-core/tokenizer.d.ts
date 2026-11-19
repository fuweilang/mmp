import { type TiktokenEncoding } from 'js-tiktoken';
import type { TokenCounter } from './types';
/** A named BPE encoding, not a promise to match any proprietary model provider. */
export declare function createTokenCounter(encoding?: TiktokenEncoding): TokenCounter;
export declare const DEFAULT_TOKEN_COUNTER: TokenCounter;
export declare function countTokens(text: string, counter?: TokenCounter): number;
//# sourceMappingURL=tokenizer.d.ts.map