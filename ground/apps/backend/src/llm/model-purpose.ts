/** Old rows remain chat models; supported image IDs are recognized even before sync. */
export type ModelPurpose = 'chat' | 'image';
export const IMAGE_MODEL_SIZES: Record<string,string> = {
  'Kwai-Kolors/Kolors':'1024x1024',
  'Qwen/Qwen-Image':'1328x1328',
};
export function modelPurpose(model:{modelId:string;meta?:unknown}):ModelPurpose {
  const meta=model.meta && typeof model.meta==='object' && !Array.isArray(model.meta)?model.meta as Record<string,unknown>:{};
  if(meta.purpose==='image' || Object.prototype.hasOwnProperty.call(IMAGE_MODEL_SIZES,model.modelId))return 'image';
  return 'chat';
}
