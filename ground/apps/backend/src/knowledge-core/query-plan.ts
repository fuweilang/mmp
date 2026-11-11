import { KnowledgeCoreError } from './errors';
export interface UserQueryContext {
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  visible?: boolean;
}
/** No model rewrite or hidden reasoning: deterministic, disclosed visible conversation-text concatenation only. */
export function planKnowledgeQueries(query: string, conversationId: string, context: UserQueryContext[] = []) {
  if (typeof query !== 'string' || !query.trim() || query.length > 2000 || context.length > 50)
    throw new KnowledgeCoreError('INVALID_RETRIEVAL_QUERY');
  const previous = context.filter(row => row.conversationId === conversationId && (row.role === 'user' || row.role === 'assistant' && row.visible === true) && typeof row.text === 'string')
    .slice(-2).map(row => row.text.slice(0, 500));
  const queries = [query];
  for (const text of previous.reverse()) {
    const contextual = `${text}\n${query}`;
    if (text.trim() && text !== query && !queries.includes(contextual))
      queries.push(contextual);
  }
  return {
    queries: queries.slice(0, 3), strategy: queries.length > 1 ? 'DETERMINISTIC_CONTEXT' : 'ORIGINAL'
  };
}
/** Exact identifier tokens plus Han bigrams; all scoring happens before SQL LIMIT. */
export function lexicalTerms(query: string): string[] {
  const normalized = query.toLowerCase();
  const terms = [...normalized.matchAll(/[a-z0-9][a-z0-9_.:/-]*/g)].map(match => match[0]);
  for (const match of normalized.matchAll(/[\p{Script=Han}]+/gu)) {
    const chars = [...match[0]];
    if (chars.length === 1)
      terms.push(chars[0]);
    else
      for (let i = 0; i < chars.length - 1; i++)
        terms.push(chars[i] + chars[i + 1]);
  }
  return [...new Set(terms)].slice(0, 128);
}
