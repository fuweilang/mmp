/** Relays reject thinking.type=disabled on some Claude and OpenAI models, so leave the field off unless thinking is requested. */
export function withUpstreamThinking(body: Record<string, unknown>, _baseUrl: string | null | undefined, enabled: boolean): Record<string, unknown> {
  const next = { ...body };
  if (!enabled) {
    delete next.thinking;
    return next;
  }
  next.thinking = { type: 'enabled' };
  return next;
}
