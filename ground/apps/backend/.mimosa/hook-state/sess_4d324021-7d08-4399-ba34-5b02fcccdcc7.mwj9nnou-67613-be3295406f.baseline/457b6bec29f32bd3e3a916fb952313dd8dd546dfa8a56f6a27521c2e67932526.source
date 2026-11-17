import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** toolScope / Host 工具稳定名 */
export const WEB_FETCH_TOOL = 'web_fetch';

const MAX_BYTES = 800_000;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

export type OfficialWebFetchResult = {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  accessedAt: string;
  title?: string;
  text: string;
  truncated: boolean;
};

/**
 * 受控公开网页读取：仅 http(s)，防 SSRF，限大小/超时；不编造正文。
 */
@Injectable()
export class OfficialWebFetchService {
  private readonly logger = new Logger(OfficialWebFetchService.name);

  async fetchUrl(rawUrl: string): Promise<OfficialWebFetchResult> {
    const accessedAt = new Date().toISOString();
    let current = normalizePublicUrl(rawUrl);
    await assertPublicHostname(current.hostname);

    let response: Response | null = null;
    let redirects = 0;
    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        response = await fetch(current.href, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            accept: 'text/html,text/plain,application/json,text/markdown;q=0.9,*/*;q=0.1',
            'user-agent': 'mammoth-ground-official-agent-fetch/0.1',
          },
        });
      } catch (error) {
        this.logger.warn(`web_fetch network failed: ${String(error)}`);
        throw new ServiceUnavailableException('网页读取暂时不可用，请稍后重试');
      } finally {
        clearTimeout(timer);
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const loc = response.headers.get('location');
        if (!loc) throw new BadRequestException('重定向缺少 Location');
        redirects += 1;
        if (redirects > MAX_REDIRECTS) throw new BadRequestException('重定向次数过多');
        current = normalizePublicUrl(new URL(loc, current).href);
        await assertPublicHostname(current.hostname);
        continue;
      }
      break;
    }

    if (!response) throw new ServiceUnavailableException('网页读取失败');
    if (response.status >= 400) {
      throw new BadRequestException(`目标页返回 HTTP ${response.status}`);
    }

    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType && !isAllowedContentType(contentType)) {
      throw new BadRequestException(`不支持的内容类型：${contentType || 'unknown'}`);
    }

    const buf = Buffer.from(await response.arrayBuffer());
    const truncated = buf.byteLength > MAX_BYTES;
    const slice = truncated ? buf.subarray(0, MAX_BYTES) : buf;
    const rawText = slice.toString('utf8');
    const text = contentType.includes('html') ? htmlToText(rawText) : rawText;
    const title = contentType.includes('html') ? extractTitle(rawText) : undefined;

    return {
      url: rawUrl.trim(),
      finalUrl: current.href,
      status: response.status,
      contentType: contentType || 'text/plain',
      accessedAt,
      ...(title ? { title } : {}),
      text: text.slice(0, 60_000),
      truncated,
    };
  }
}

function normalizePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new BadRequestException('URL 无效');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('仅支持 http/https');
  }
  if (url.username || url.password) {
    throw new BadRequestException('URL 不能包含用户名或密码');
  }
  if (!url.hostname) throw new BadRequestException('URL 缺少主机名');
  return url;
}

async function assertPublicHostname(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new BadRequestException('禁止访问本地地址');
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new BadRequestException('禁止访问内网地址');
    return;
  }
  let records: { address: string; family: number }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BadRequestException('无法解析主机名');
  }
  if (!records.length) throw new BadRequestException('无法解析主机名');
  for (const rec of records) {
    if (isPrivateIp(rec.address)) {
      throw new BadRequestException('禁止访问解析到内网的地址');
    }
  }
}

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
  const v4 = ip.includes('.') ? ip : null;
  if (!v4) return false;
  const parts = v4.split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isAllowedContentType(ct: string): boolean {
  return (
    ct.startsWith('text/') ||
    ct === 'application/json' ||
    ct === 'application/javascript' ||
    ct.endsWith('+json') ||
    ct.endsWith('+xml') ||
    ct === 'application/xml'
  );
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  return decodeEntities(m[1].replace(/\s+/g, ' ').trim()).slice(0, 200);
}

function htmlToText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
