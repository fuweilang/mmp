import type { User } from '@prisma/client';
import type { Response } from 'express';
import type { ChatBody, LlmChatGatewayService } from '../llm/llm-chat.gateway.service';

/** 资料库问答只组装云端网关请求：默认 auto，不带本机 Key。 */
export function buildLibraryModelRequest(
  model: string | undefined,
  messages: { role: 'system' | 'user'; content: string }[],
): ChatBody {
  const requested = model?.trim() || 'auto';
  return { model: requested, stream: false, messages };
}

export function readModelText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  return typeof content === 'string' && content.trim() ? content : null;
}

type Capture = {
  res: Response;
  json: unknown;
  modelRef: string | null;
};

function captureResponse(): Capture {
  const capture: Capture = { res: {} as Response, json: null, modelRef: null };
  const headers = new Map<string, string>();
  const res = {
    headersSent: false,
    destroyed: false,
    writableEnded: false,
    writableFinished: false,
    status() {
      return res;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      if (name.toLowerCase() === 'x-mmp-model') capture.modelRef = value;
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    json(body: unknown) {
      capture.json = body;
      res.headersSent = true;
      return res;
    },
    write() {
      return true;
    },
    end() {
      res.writableEnded = true;
      res.writableFinished = true;
    },
    once() {
      return res;
    },
    on() {
      return res;
    },
    removeListener() {
      return res;
    },
  };
  capture.res = res as unknown as Response;
  return capture;
}

/**
 * 通过已经存在的云端模型网关完成一次非流式问答。
 * 没有可用模型时返回不可用，不在这里编造回答。
 */
export async function completeLibraryTurn(
  gateway: LlmChatGatewayService,
  user: User,
  tenantId: string,
  messages: { role: 'system' | 'user'; content: string }[],
  model: string | undefined,
): Promise<{ ok: true; modelRef: string; text: string } | { ok: false; reason: string }> {
  const body = buildLibraryModelRequest(model, messages);
  const capture = captureResponse();
  try {
    await gateway.proxyChatCompletions(user, tenantId, body, capture.res);
  } catch {
    return { ok: false, reason: '云端模型暂不可用，本次没有生成回答。' };
  }
  const text = readModelText(capture.json);
  if (!text || !capture.modelRef) {
    return { ok: false, reason: '云端模型暂不可用，本次没有生成回答。' };
  }
  return { ok: true, modelRef: capture.modelRef, text };
}
