import { ForbiddenException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import {
  assertSkillDisplayName,
  assertSkillSummary,
} from './skill-package';
import {
  buildDisplayTranslationPrompt,
  displaySourceHash,
  needsMachineDisplayTranslation,
  parseDisplayTranslationJson,
} from './skill-display-i18n';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 展示文案机器翻译的窄端口（审计 P1-3 的断环设计）。
 *
 * 为什么选「依赖注入接口」而不是 `forwardRef`：
 * - `OfficialSkillModule ↔ LlmModule` 的循环已经存在（模块级 forwardRef），
 *   再让新文件 `import { LlmChatGatewayService }` 只会增加一条真实依赖边，
 *   forwardRef 只能推迟解析，不能消除环；
 * - 这里只需要「一次性补全」一个能力，用结构化端口描述后，新文件对 llm 模块零依赖，
 *   单测可直接塞 stub，官方技能服务仍是唯一持有 `LlmChatGatewayService` 的地方。
 */
export type SkillDisplayCompletionRequest = {
  model: string;
  temperature?: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
};

export interface SkillDisplayCompletionPort {
  completeOnce(
    user: User,
    tenantId: string | null,
    body: SkillDisplayCompletionRequest,
  ): Promise<{ content: string; modelRef: string }>;
}

/**
 * 技能展示文案批量翻译（审计 P1-3 的 display-translation 部分）。
 * 只改展示字段（name/summary + provenance/locale/hash），不碰 SKILL.md、instruction、工具。
 */
export class OfficialSkillDisplayTranslationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: SkillDisplayCompletionPort,
  ) {}

  async translateDisplayBatch(
    actor: User,
    opts: { dryRun?: boolean; limit?: number; keys?: string[]; maxAttempts?: number } = {},
  ) {
    if (!actor.isPlatformAdmin) throw new ForbiddenException('仅平台管理员可批量翻译技能展示文案');
    const limit = Math.max(1, Math.min(opts.limit ?? 20, 100));
    const maxAttempts = Math.max(1, Math.min(opts.maxAttempts ?? 3, 5));
    const rows = await this.prisma.officialSkill.findMany({
      where: opts.keys?.length ? { key: { in: opts.keys } } : undefined,
      orderBy: { key: 'asc' },
      select: {
        id: true,
        key: true,
        name: true,
        summary: true,
        sourceName: true,
        sourceSummary: true,
        displayProvenance: true,
        displaySourceHash: true,
      },
    });
    const candidates = rows.filter((row) =>
      needsMachineDisplayTranslation({
        name: row.name,
        summary: row.summary,
        sourceName: row.sourceName,
        sourceSummary: row.sourceSummary,
        displayProvenance: row.displayProvenance,
        displaySourceHash: row.displaySourceHash,
      }),
    );
    const skippedManual = rows.filter((r) => r.displayProvenance === 'manual').length;
    const selected = candidates.slice(0, limit);
    const report = {
      dryRun: Boolean(opts.dryRun),
      total: rows.length,
      needingTranslation: candidates.length,
      selected: selected.length,
      skippedManual,
      translated: 0,
      failed: 0,
      skipped: 0,
      failures: [] as Array<{ key: string; error: string }>,
      translatedKeys: [] as string[],
      modelRef: null as string | null,
    };
    if (opts.dryRun) return report;

    for (const row of selected) {
      const sourceName = (row.sourceName ?? row.name).trim();
      const sourceSummary = (row.sourceSummary || row.summary || '').trim();
      // Ensure originals are pinned before mutating display fields.
      if (!row.sourceName || row.sourceSummary === '') {
        await this.prisma.officialSkill.update({
          where: { id: row.id },
          data: {
            sourceName: row.sourceName ?? row.name,
            sourceSummary: row.sourceSummary || row.summary || '',
          },
        });
      }
      let lastError = 'unknown';
      let ok = false;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const completion = await this.llm.completeOnce(actor, null, {
            model: 'auto',
            temperature: 0.2,
            messages: [
              { role: 'system', content: '只输出 JSON 对象，不要解释。' },
              {
                role: 'user',
                content: buildDisplayTranslationPrompt({
                  key: row.key,
                  sourceName,
                  sourceSummary,
                }),
              },
            ],
          });
          report.modelRef = completion.modelRef;
          const parsed = parseDisplayTranslationJson(completion.content);
          const name = assertSkillDisplayName(parsed.name);
          const summary = assertSkillSummary(parsed.summary);
          const hash = displaySourceHash(sourceName, sourceSummary);
          await this.prisma.officialSkill.update({
            where: { id: row.id },
            data: {
              name,
              summary,
              sourceName,
              sourceSummary,
              displayProvenance: 'machine',
              displayLocale: 'zh-Hans',
              displayTranslatedAt: new Date(),
              displayModelRef: completion.modelRef,
              displaySourceHash: hash,
            },
          });
          // Do not rewrite package SKILL.md; manifest keeps source via sync helper when needed.
          report.translated += 1;
          report.translatedKeys.push(row.key);
          ok = true;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
      if (!ok) {
        report.failed += 1;
        report.failures.push({ key: row.key, error: lastError.slice(0, 300) });
      }
    }
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'admin_translate_official_skill_display',
        tenantId: null,
        meta: {
          translated: report.translated,
          failed: report.failed,
          selected: report.selected,
          modelRef: report.modelRef,
        } satisfies Prisma.InputJsonObject,
      },
    });
    return report;
  }
}
