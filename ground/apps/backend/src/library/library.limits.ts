export type LibraryLimits = {
  maxFileBytes: number;
  tenantQuotaBytes: number;
  recycleDays: number;
  askMaxChars: number;
  allowedExtensions: readonly string[];
};

export const LIBRARY_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.md',
  '.markdown',
  '.txt',
  '.csv',
  '.html',
  '.htm',
  '.zip',
] as const;

const DEFAULT_MAX_FILE = 20 * 1024 * 1024;
const DEFAULT_QUOTA = 5 * 1024 * 1024 * 1024;
const DEFAULT_RECYCLE_DAYS = 30;
const DEFAULT_ASK_CHARS = 12_000;

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return fallback;
  return value;
}

/** 读环境变量。不新做配置后台；非法值回落到默认。 */
export function libraryLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): LibraryLimits {
  return {
    maxFileBytes: positiveInt(env.LIBRARY_MAX_FILE_BYTES, DEFAULT_MAX_FILE),
    tenantQuotaBytes: positiveInt(env.LIBRARY_TENANT_QUOTA_BYTES, DEFAULT_QUOTA),
    recycleDays: positiveInt(env.LIBRARY_RECYCLE_DAYS, DEFAULT_RECYCLE_DAYS),
    askMaxChars: positiveInt(env.LIBRARY_ASK_MAX_CHARS, DEFAULT_ASK_CHARS),
    allowedExtensions: LIBRARY_ALLOWED_EXTENSIONS,
  };
}
