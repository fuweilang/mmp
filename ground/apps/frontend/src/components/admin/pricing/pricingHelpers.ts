/** 仅用于「刷新参考」元数据兜底；不再在目录空时伪造厂商行 */
export const FALLBACK_OFFICIAL: Record<
  string,
  { label: string; hintInput: string; hintOutput: string; officialInput: number; officialOutput: number }
> = {
  deepseek: {
    label: 'DeepSeek',
    hintInput: '参考约 ¥2（$0.3×7 · flash 高峰）',
    hintOutput: '参考约 ¥8（$1.2×7 · flash 高峰）',
    officialInput: 2,
    officialOutput: 8,
  },
  kimi: {
    label: 'Kimi',
    hintInput: '官网参考 ¥13（kimi-k3.1-pro）',
    hintOutput: '官网参考 ¥68（kimi-k3.1-pro）',
    officialInput: 13,
    officialOutput: 68,
  },
  zhipu: {
    label: '智谱',
    hintInput: '官网参考 ¥8（GLM-5.3）',
    hintOutput: '官网参考 ¥28（GLM-5.3）',
    officialInput: 8,
    officialOutput: 28,
  },
};

export function round2(n: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}
