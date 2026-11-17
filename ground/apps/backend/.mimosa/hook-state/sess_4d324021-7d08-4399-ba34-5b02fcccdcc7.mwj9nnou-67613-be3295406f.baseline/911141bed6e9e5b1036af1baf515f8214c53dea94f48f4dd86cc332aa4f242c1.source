/** Models whose current APIs accept image input. Pro stays text-only. */
const VISION_MODELS = /^(deepseek-flash|deepseek-v4-flash|kimi-k3(?:\.1-pro(?:-highspeed)?)?)$/

/** Unknown models opt in to non-text capabilities explicitly in Admin. */
export function modelCapabilities(model:{modelId:string;meta?:unknown}) {
  const meta=model.meta&&typeof model.meta==='object'&&!Array.isArray(model.meta)?model.meta as Record<string,unknown>:{};
  const known=/^(deepseek-flash|deepseek-v4-pro|deepseek-v4-flash|kimi-k3(?:\.1-pro(?:-highspeed)?)?)$/.test(model.modelId);
  return {tools:typeof meta.supportsTools==='boolean'?meta.supportsTools:known,
    vision:typeof meta.supportsVision==='boolean'?meta.supportsVision:VISION_MODELS.test(model.modelId),
    contextWindow:typeof meta.contextWindow==='number'&&Number.isSafeInteger(meta.contextWindow)&&meta.contextWindow>=1024?meta.contextWindow:known?128000:8192};
}
