import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  OfficialAgentStatus,
  Prisma,
  User,
} from '@prisma/client';
import type { LlmChatGatewayService } from '../llm/llm-chat.gateway.service';
import { PrismaService } from '../prisma/prisma.service';
import { OfficialTabularAnalyzeService, TABULAR_ANALYZE_TOOL } from './tabular-analyze.service';
import { OfficialWebFetchService, WEB_FETCH_TOOL } from './web-fetch.service';
import { OfficialWebSearchService, WEB_SEARCH_TOOL } from './web-search.service';

/** toolScope / Host 工具稳定名 */
export const DELEGATE_OFFICIAL_AGENT_TOOL = 'delegate_official_agent';

/** 大总管可路由的子专家（单层；不可再委派 boss） */
export const BOSS_DELEGATE_ALLOWLIST = [
  'mammoth',
  'copy',
  'data',
  'spy',
  'growth',
  'xhs',
] as const;

const MAX_TASK_CHARS = 12_000;
const MAX_SEARCH_HITS_INJECT = 5;
const MAX_FETCH_URLS = 2;

export type DelegateRequest = {
  targetKey: string;
  task: string;
  /** 可选：内联表格，仅当 target=data 时使用 */
  tabularContent?: string;
  tabularFormat?: 'csv' | 'json' | 'auto';
};

export type DelegateResult = {
  route: {
    key: string;
    name: string;
    agentId: string;
    versionId: string;
    version: number;
  };
  /** 子专家侧已执行工具的结构化结果（供验收/宿主核对，不只靠 answer 文本） */
  child: {
    agentId: string;
    key: string;
    versionId: string;
    tabular?: {
      appliedGroupBy: string | null;
      rowCount: number;
      groupSummary?: Array<Record<string, string | number | null>>;
    };
  };
  answer: string;
  modelRef?: string;
  toolTrace: Array<{ tool: string; ok: boolean; detail: string }>;
  depth: 1;
  limits: { maxDepth: 1; allowlist: readonly string[] };
};

type VersionRow = {
  id: string;
  version: number;
  name: string;
  systemPrompt: string;
  toolScope: Prisma.JsonValue;
  agentId: string;
};

/**
 * 猛犸大总管服务端编排：单层路由到 allowlist 子专家，
 * 在 Ground 执行子工具后走云端模型汇总；禁止递归调用 boss。
 */
@Injectable()
export class OfficialOrchestrateService {
  private readonly logger = new Logger(OfficialOrchestrateService.name);

  constructor(
    private prisma: PrismaService,
    private webSearch: OfficialWebSearchService,
    private webFetch: OfficialWebFetchService,
    private tabular: OfficialTabularAnalyzeService,
    private moduleRef: ModuleRef,
  ) {}

  private llm(): LlmChatGatewayService {
    // 懒取网关，避免 OfficialAgentModule ↔ LlmModule 编译期循环依赖
    const { LlmChatGatewayService } = require('../llm/llm-chat.gateway.service') as typeof import('../llm/llm-chat.gateway.service');
    return this.moduleRef.get(LlmChatGatewayService, { strict: false });
  }

  async delegate(
    user: User,
    tenantId: string | null,
    bossAgentId: string,
    bossVersion: VersionRow,
    req: DelegateRequest,
    previewOrigin?: {agentId:string;previewId:string},
  ): Promise<DelegateResult> {
    const bossScope = stringList(bossVersion.toolScope);
    if (!bossScope.includes(DELEGATE_OFFICIAL_AGENT_TOOL)) {
      throw new ForbiddenException('当前专家版本未授权编排委派');
    }

    const targetKey = String(req.targetKey || '').trim();
    if (!BOSS_DELEGATE_ALLOWLIST.includes(targetKey as (typeof BOSS_DELEGATE_ALLOWLIST)[number])) {
      throw new BadRequestException(
        `目标专家不在可委派名单：${BOSS_DELEGATE_ALLOWLIST.join(', ')}`,
      );
    }
    if (targetKey === 'boss') {
      throw new BadRequestException('禁止递归委派大总管');
    }

    const task = String(req.task || '').trim();
    if (!task) throw new BadRequestException('委派任务不能为空');
    if (task.length > MAX_TASK_CHARS) {
      throw new BadRequestException(`任务过长，请控制在 ${MAX_TASK_CHARS} 字以内`);
    }

    const child = await this.prisma.officialAgent.findUnique({
      where: { key: targetKey },
      include: { onlineVersion: true },
    });
    if (
      !child ||
      child.status !== OfficialAgentStatus.PUBLISHED ||
      !child.onlineVersion ||
      child.id === bossAgentId
    ) {
      throw new BadRequestException('目标专家不可用或未发布');
    }
    const childVersion = child.onlineVersion;
    const config=childVersion.executionConfig as {route?:string;retrievalPolicy?:string}|null;
    if(config?.route==='KNOWLEDGE_CORE' && config.retrievalPolicy!=='OFF')throw new BadRequestException('KNOWLEDGE_DIRECT_DELEGATION_UNSUPPORTED: open this expert in a protocol 2 Host session');
    const childScope = stringList(childVersion.toolScope);
    const toolTrace: DelegateResult['toolTrace'] = [];
    const evidence: string[] = [];
    let childTabular: NonNullable<DelegateResult['child']['tabular']> | undefined;

    if (childScope.includes(WEB_SEARCH_TOOL)) {
      try {
        const search = await this.webSearch.search(task.slice(0, 200), { count: 8 });
        toolTrace.push({
          tool: WEB_SEARCH_TOOL,
          ok: true,
          detail: `${search.hits.length} hits via ${search.provider}`,
        });
        const lines = search.hits.slice(0, MAX_SEARCH_HITS_INJECT).map((h, i) => {
          return `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.snippet || h.summary || ''}`;
        });
        if (lines.length) evidence.push(`## 联网搜索\n${lines.join('\n\n')}`);
        else evidence.push('## 联网搜索\n无结果');
      } catch (error) {
        toolTrace.push({ tool: WEB_SEARCH_TOOL, ok: false, detail: String(error).slice(0, 200) });
        evidence.push('## 联网搜索\n暂时失败，请勿编造来源');
      }
    }

    if (childScope.includes(WEB_FETCH_TOOL)) {
      const urls = extractUrls(task).slice(0, MAX_FETCH_URLS);
      for (const url of urls) {
        try {
          const page = await this.webFetch.fetchUrl(url);
          toolTrace.push({
            tool: WEB_FETCH_TOOL,
            ok: true,
            detail: `${page.status} ${page.finalUrl} @ ${page.accessedAt}`,
          });
          evidence.push(
            `## 网页读取\nURL: ${page.finalUrl}\n访问时间: ${page.accessedAt}\n标题: ${page.title || ''}\n正文摘要:\n${page.text.slice(0, 4000)}`,
          );
        } catch (error) {
          toolTrace.push({ tool: WEB_FETCH_TOOL, ok: false, detail: `${url}: ${String(error).slice(0, 160)}` });
          evidence.push(`## 网页读取\n${url} 失败：勿编造正文`);
        }
      }
    }

    if (childScope.includes(TABULAR_ANALYZE_TOOL)) {
      const content = (req.tabularContent || extractCsvBlock(task) || '').trim();
      if (!content) {
        toolTrace.push({
          tool: TABULAR_ANALYZE_TOOL,
          ok: false,
          detail: 'missing tabular content',
        });
        evidence.push(
          '## 表格分析\n用户未提供 CSV/JSON。请明确要求粘贴数据，不要声称已连接企业数据库。',
        );
      } else {
        try {
          const analyzed = this.tabular.analyze({
            content,
            format: req.tabularFormat ?? 'auto',
            goal: task,
          });
          const groupNote = analyzed.appliedGroupBy
            ? ` groupBy=${analyzed.appliedGroupBy} groups=${analyzed.groupSummary?.length ?? 0}`
            : ' groupBy=none';
          toolTrace.push({
            tool: TABULAR_ANALYZE_TOOL,
            ok: true,
            detail: `${analyzed.rowCount}x${analyzed.columnCount} ${analyzed.format}${groupNote}`,
          });
          childTabular = {
            appliedGroupBy: analyzed.appliedGroupBy ?? null,
            rowCount: analyzed.rowCount,
            ...(analyzed.groupSummary ? { groupSummary: analyzed.groupSummary } : {}),
          };
          const mustUseGroups = Boolean(analyzed.groupSummary?.length);
          evidence.push(
            [
              '## 表格分析结果(JSON)',
              '数字必须原样引用下列 JSON；若含 groupSummary，回答必须列出各组 sum/mean/count，禁止声称「没有分组」或自行心算。',
              JSON.stringify(analyzed).slice(0, 8000),
              mustUseGroups
                ? `（已分组：appliedGroupBy=${analyzed.appliedGroupBy}，组数=${analyzed.groupSummary!.length}）`
                : '（未分组：若任务需要分组，请说明缺少匹配列名）',
            ].join('\n'),
          );
        } catch (error) {
          toolTrace.push({
            tool: TABULAR_ANALYZE_TOOL,
            ok: false,
            detail: String(error).slice(0, 200),
          });
          evidence.push(`## 表格分析\n失败：${String(error).slice(0, 300)}`);
        }
      }
    }

    const userContent = [
      `【委派任务】\n${task}`,
      evidence.length ? `【工具证据】\n${evidence.join('\n\n')}` : '',
      '请以你的角色直接回答。有证据则引用 URL/访问时间或计算数字；表格数字必须与 JSON 一致（含 groupSummary）；无证据时明确说明局限，禁止编造。',
    ]
      .filter(Boolean)
      .join('\n\n');

    let answer = '';
    let modelRef: string | undefined;
    try {
      const completion = await this.llm().completeOnce(
        user,
        tenantId,
        {
          model: 'auto',
          stream: false,
          messages: [
            { role: 'system', content: childVersion.systemPrompt },
            { role: 'user', content: userContent },
          ],
        },
        { agentId: child.id, versionId: childVersion.id, previewOrigin },
      );
      answer = completion.content.trim();
      modelRef = completion.modelRef;
      if (!answer) answer = '子专家未返回有效文本。';
    } catch (error) {
      this.logger.warn(`delegate LLM failed: ${String(error)}`);
      // 降级：至少把工具证据交还给上层，避免假完成
      answer = [
        `已路由到「${childVersion.name}」，但云端模型汇总失败。`,
        toolTrace.length ? `工具轨迹：${JSON.stringify(toolTrace)}` : '',
        evidence.length ? evidence.join('\n\n').slice(0, 6000) : '无工具证据。',
      ]
        .filter(Boolean)
        .join('\n\n');
      toolTrace.push({ tool: 'llm_complete', ok: false, detail: String(error).slice(0, 200) });
    }

    return {
      route: {
        key: child.key,
        name: childVersion.name,
        agentId: child.id,
        versionId: childVersion.id,
        version: childVersion.version,
      },
      child: {
        agentId: child.id,
        key: child.key,
        versionId: childVersion.id,
        ...(childTabular ? { tabular: childTabular } : {}),
      },
      answer,
      ...(modelRef ? { modelRef } : {}),
      toolTrace,
      depth: 1,
      limits: { maxDepth: 1, allowlist: BOSS_DELEGATE_ALLOWLIST },
    };
  }
}

function stringList(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s)\]}>'"]+/gi) ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of found) {
    const cleaned = raw.replace(/[.,;]+$/, '');
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function extractCsvBlock(text: string): string | null {
  const fenced = text.match(/```(?:csv|json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  // 简易启发式：含逗号分隔抬头行
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && lines[0].includes(',') && lines[1].includes(',')) {
    return lines.slice(0, 500).join('\n');
  }
  return null;
}
