import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decryptApiKey } from '../llm/llm-key-crypto';

/** Official Agent 联网搜索在模型侧与 toolScope 中的稳定名称。 */
export const WEB_SEARCH_TOOL = 'web_search';

/** DeepSeek Tools Search API（与 Harness mmp-web-deepseek-api 同端点）。 */
const DEEPSEEK_SEARCH_ENDPOINT = 'https://api.deepseek.com/v1/tools/search';

export type OfficialWebSearchHit = {
  title: string;
  url: string;
  snippet: string;
  summary?: string;
  publishedAt?: string | null;
  siteName?: string;
};

/**
 * 服务端联网搜索：复用 Ground 已配置的 deepseek 厂商 Key，
 * 不把搜索密钥下发到桌面；失败时给出可诊断错误，不编造结果。
 */
@Injectable()
export class OfficialWebSearchService {
  private readonly logger = new Logger(OfficialWebSearchService.name);

  constructor(private prisma: PrismaService) {}

  async search(query: string, opts?: { count?: number; signal?: AbortSignal }): Promise<{
    provider: 'deepseek-tools-search';
    hits: OfficialWebSearchHit[];
  }> {
    const apiKey = await resolveDeepSeekSearchKey(this.prisma);
    const count = Math.min(Math.max(opts?.count ?? 8, 1), 20);
    let response: Response;
    try {
      response = await fetch(DEEPSEEK_SEARCH_ENDPOINT, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${apiKey}`,
          'user-agent': 'mammoth-ground-official-agent/0.1',
        },
        body: JSON.stringify({ query, count, need_content: false }),
        ...(opts?.signal ? { signal: opts.signal } : {}),
      });
    } catch (error) {
      this.logger.warn(`deepseek search network failed: ${String(error)}`);
      throw new ServiceUnavailableException('联网搜索暂时不可用，请稍后重试');
    }

    if (!response.ok) {
      const detail = await safeErrorDetail(response);
      this.logger.warn(`deepseek search HTTP ${response.status}: ${detail}`);
      throw new ServiceUnavailableException(
        response.status === 401 || response.status === 403
          ? '联网搜索凭据无效，请联系平台管理员检查 DeepSeek 厂商配置'
          : `联网搜索上游失败（HTTP ${response.status}）`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ServiceUnavailableException('联网搜索返回无法解析');
    }
    const hits = mapDeepSeekSearch(payload);
    return { provider: 'deepseek-tools-search', hits };
  }


}

export async function resolveDeepSeekSearchKey(db:Pick<PrismaService,'llmProvider'>): Promise<string> {
    const provider = await db.llmProvider.findFirst({
      where: {
        enabled: true,
        apiKeyEnc: { not: null },
        OR: [
          { name: 'deepseek' },
          { baseUrl: { contains: 'api.deepseek.com' } },
        ],
      },
      select: { apiKeyEnc: true, name: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!provider?.apiKeyEnc) {
      throw new ServiceUnavailableException(
        '平台未配置可用的 DeepSeek 厂商 Key，无法执行联网搜索',
      );
    }
    try {
      const key = decryptApiKey(provider.apiKeyEnc).trim();
      if (!key) throw new Error('empty');
      return key;
    } catch {
      throw new ServiceUnavailableException(
        'DeepSeek 厂商 Key 无法解密，请联系平台管理员',
      );
    }
  }

function mapDeepSeekSearch(payload: unknown): OfficialWebSearchHit[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const hits: OfficialWebSearchHit[] = [];
  const seen = new Set<string>();
  for (const item of results) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = typeof row.title === 'string' ? row.title : '';
    const snippet = typeof row.snippet === 'string' ? row.snippet : '';
    const summary = typeof row.summary === 'string' ? row.summary : undefined;
    const publishedAt = typeof row.date === 'string' ? row.date : null;
    const siteName = typeof row.site_name === 'string' ? row.site_name : undefined;
    hits.push({
      title,
      url,
      snippet: snippet.slice(0, 900),
      ...(summary ? { summary: summary.slice(0, 2000) } : {}),
      publishedAt,
      ...(siteName ? { siteName } : {}),
    });
  }
  return hits;
}

async function safeErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return '';
  }
}
