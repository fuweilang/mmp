import { geekAiChatBase } from '../billing/geekai-model-price';

/** GeekAI rejects thinking.type=disabled on some Claude and OpenAI models, so leave the field off unless thinking is requested. */
export function withUpstreamThinking(body: Record<string, unknown>, baseUrl: string | null | undefined, enabled: boolean): Record<string, unknown> {
  const next = { ...body };
  if (geekAiChatBase(baseUrl) && !enabled) {
    delete next.thinking;
    return next;
  }
  next.thinking = { type: enabled ? 'enabled' : 'disabled' };
  return next;
}
