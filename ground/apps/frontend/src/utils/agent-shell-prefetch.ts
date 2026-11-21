/** 与 mammoth-agent packages/client/web/src/foreground-plugins.ts 的种子保持一致。 */
const FOREGROUND_SEEDS = [
  '@mammoth-ai/mmp-client-connection',
  '@mammoth-ai/mmp-client-locale',
  '@mammoth-ai/mmp-client-ui-layout',
  '@mammoth-ai/mmp-client-ui-renderer',
  '@mammoth-ai/mmp-client-ui-settings',
  '@mammoth-ai/mmp-client-ui-settings-account',
  '@mammoth-ai/mmp-client-ui-theme',
] as const;

const BOOT_MARKER = 'globalThis["__MMP_BOOT__"] = ';

interface BootEntry {
  id: string;
  inject?: string[];
}

interface BootBatch {
  phase?: string;
  url?: string;
  entries?: string[];
}

/** 从智能体页 HTML 里取出启动图。页面还没就绪时返回 null。 */
export function readBootGraph(html: string): { entries: BootEntry[]; batches: BootBatch[] } | null {
  const at = html.indexOf(BOOT_MARKER);
  if (at < 0) return null;
  const start = html.indexOf('{', at + BOOT_MARKER.length);
  if (start < 0) return null;
  const end = jsonEnd(html, start);
  if (end < 0) return null;
  try {
    const value = JSON.parse(html.slice(start, end)) as { entries?: unknown; batches?: unknown };
    if (!Array.isArray(value.entries) || !Array.isArray(value.batches)) return null;
    return { entries: value.entries as BootEntry[], batches: value.batches as BootBatch[] };
  } catch {
    return null;
  }
}

/** 首屏和引导会用到的脚本地址，只保留智能体页面同源的 URL。 */
export function shellBundleUrls(html: string, pageUrl: string): string[] {
  const graph = readBootGraph(html);
  if (!graph) return [];
  const wanted = foregroundIds(graph.entries);
  const base = pageBase(pageUrl);
  const urls: string[] = [];
  for (const batch of graph.batches) {
    if (typeof batch.url !== 'string') continue;
    const entries = batch.entries ?? [];
    const needed = batch.phase === 'bootstrap' || entries.some(id => wanted.has(id));
    if (!needed) continue;
    const url = sameOrigin(base, batch.url);
    if (url) urls.push(url);
  }
  return urls;
}

/** 登录成功后、跳进智能体之前，把首屏脚本写入浏览器缓存。失败或超时也继续进入。 */
export async function prefetchAgentShell(pageUrl: string): Promise<void> {
  if (!pageUrl) return;
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, 8000);
  try {
    const response = await fetch(pageUrl, { credentials: 'include', signal: controller.signal });
    if (!response.ok) return;
    const html = await response.text();
    await Promise.all(shellBundleUrls(html, pageUrl).map(async (url) => {
      const script = await fetch(url, { credentials: 'include', signal: controller.signal });
      if (script.ok) await script.arrayBuffer();
    }));
  } catch {
    // 预取失败时页面自己还会再拉这些脚本。
  } finally {
    clearTimeout(timer);
  }
}

function foregroundIds(entries: readonly BootEntry[]): Set<string> {
  const known = new Map(entries.filter(row => typeof row.id === 'string').map(row => [row.id, row.inject ?? []]));
  const seen = new Set<string>();
  const stack = FOREGROUND_SEEDS.filter(id => known.has(id));
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    for (const dep of known.get(id) ?? []) {
      if (known.has(dep)) stack.push(dep);
    }
  }
  return seen;
}

function pageBase(pageUrl: string): string {
  const url = new URL(pageUrl);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

function sameOrigin(base: string, ref: string): string | null {
  try {
    const url = new URL(ref, base);
    if (url.origin !== new URL(base).origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

function jsonEnd(text: string, start: number): number {
  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quote = false;
      continue;
    }
    if (char === '"') quote = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}
