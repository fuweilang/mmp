export type UploadLimits = { maxFileBytes: number; allowedExtensions: readonly string[] };
export type UploadRow = { id: string; file: File; status: 'queued' | 'uploading' | 'success' | 'failed'; progress?: number; message?: string };
/** Serial, bounded by the view's 50-item queue. Only explicit pending/failed jobs can be submitted. */
export async function runLibraryUploads(rows: UploadRow[], limits: UploadLimits, upload: (file: File, progress: (ratio: number) => void) => Promise<string | void>, shouldContinue: () => boolean = () => true) {
  if (!Number.isFinite(limits.maxFileBytes) || !Array.isArray(limits.allowedExtensions)) throw new Error('无法获取上传限制');
  let successes = 0;
  for (const row of rows) {
    if (!shouldContinue()) break;
    if (row.status === 'success' || row.status === 'uploading') continue;
    row.status = 'uploading'; row.progress = undefined; row.message = undefined;
    try {
      const ext = /\.[^.]+$/.exec(row.file.name)?.[0]?.toLowerCase() ?? '';
      if (row.file.size <= 0 || row.file.size > limits.maxFileBytes || !limits.allowedExtensions.includes(ext)) throw new Error('文件为空、类型不支持或超过单文件大小上限');
      const message = await upload(row.file, ratio => { if (row.status === 'uploading' && Number.isFinite(ratio)) row.progress = Math.max(0, Math.min(1, ratio)); });
      row.status = 'success'; row.message = message || '已保存；处理状态在列表中显示'; successes++;
    } catch (cause) {
      row.status = 'failed'; row.message = cause instanceof Error ? cause.message : '上传失败';
      if (cause instanceof TypeError || (cause && typeof cause === 'object' && 'status' in cause && (cause.status === 0 || (typeof cause.status === 'number' && cause.status >= 500)))) row.message += '；结果可能已保存，请先刷新核对后再手动重试。不自动重发。';
    }
  }
  return successes;
}
