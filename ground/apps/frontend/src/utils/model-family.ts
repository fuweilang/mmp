/** Model identity is independent of the provider/channel that serves it. */
const families: readonly (readonly [string, RegExp])[] = [
  ['Claude', /(?:^|[^a-z])claude/i],
  ['DeepSeek', /deepseek|深度求索/i],
  ['Gemini', /gemini/i],
  ['GPT', /(?:^|[^a-z])(?:gpt|chatgpt|o[134](?:\b|[-_]))/i],
  ['GLM', /(?:^|[^a-z])glm|智谱/i],
  ['Grok', /grok/i],
  ['Kimi', /kimi|moonshot|月之暗面/i],
  ['Qwen', /qwen|qwq|qvq|通义千问/i],
  ['Doubao', /doubao|豆包/i],
  ['MiniMax', /minimax|abab/i],
  ['Llama', /llama/i],
  ['Mistral', /mistral|mixtral|codestral|devstral|magistral/i],
  ['Baichuan', /baichuan|百川/i],
  ['ERNIE', /ernie|文心/i],
  ['Step', /(?:^|[^a-z])step(?:\d|[-_])|阶跃/i],
  ['Cohere', /cohere|command[-_]/i],
  ['Amazon', /amazon|nova[-_]|titan[-_]/i],
  ['AI21Labs', /ai21|jamba/i],
  ['Jina AI', /jina/i],
  ['Nvidia', /nvidia|nemotron/i],
  ['Perplexity', /perplexity|sonar/i],
];
export function modelFamily(modelId: string, displayName: string): string {
  // Resolve from the model ID first so marketing names cannot override its family.
  return families.find(([, pattern]) => pattern.test(modelId))?.[0]
    ?? families.find(([, pattern]) => pattern.test(displayName))?.[0]
    ?? '其他';
}
