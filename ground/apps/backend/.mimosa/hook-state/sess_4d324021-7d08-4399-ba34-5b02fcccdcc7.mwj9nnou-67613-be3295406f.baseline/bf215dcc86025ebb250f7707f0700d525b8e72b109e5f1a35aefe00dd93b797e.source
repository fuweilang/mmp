import { countTokens } from './tokenizer';
import type { KnowledgeChunkInput, TokenCounter } from './types';

/** Chapter context belongs only to model input; immutable source text and citation ranges remain exact. */
export function chunkEmbeddingInput(chunk: Pick<KnowledgeChunkInput, 'text'|'locator'>, counter: TokenCounter, maxInputTokens: number): string {
  const sourceTokens = countTokens(chunk.text, counter);
  if (!chunk.locator.headingPath?.length || sourceTokens >= maxInputTokens) return chunk.text;
  const path = Array.from(chunk.locator.headingPath.slice(-2).reverse().join(' / ')).slice(0, 1024);
  const budget = Math.min(64, maxInputTokens - sourceTokens);
  let low = 0, high = path.length, length = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const prefix = path.slice(0, middle).join('');
    if (countTokens(prefix, counter) <= budget && countTokens(prefix+'\n'+chunk.text, counter) <= maxInputTokens) {length=middle;low=middle+1;}
    else high=middle-1;
  }
  return length ? path.slice(0,length).join('')+'\n'+chunk.text : chunk.text;
}
