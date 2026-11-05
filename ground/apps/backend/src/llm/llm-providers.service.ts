import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decryptApiKey, encryptApiKey, maskApiKeyHint } from './llm-key-crypto';
import axios from 'axios';
import { LlmHealthService, type HealthState } from './llm-health.service';
import { modelCapabilities } from './model-capabilities';
import {
  CreateLlmModelDto,
  CreateLlmProviderDto,
  ListRemoteModelsDto,
  ProbeLlmDto,
  UpdateLlmModelDto,
  UpdateLlmProviderDto,
} from './dto/llm-provider.dto';

export type LlmModelView = {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  thinkingEnabled: boolean;
  isPreferred: boolean;
  health?: HealthState;
  supportsTools?: boolean;
  supportsVision?: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type LlmProviderView = {
  id: string;
  name: string;
  displayName: string;
  kind: string;
  baseUrl: string | null;
  /** 永不明文；仅掩码提示 */
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  note: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  models: LlmModelView[];
};

/** 与计费 octop-providers 目录对齐的轻量行（Ground 真相源）。 */
export type GroundEnabledChatModel = {
  providerId: string;
  providerName: string;
  providerKind: string;
  modelId: string;
  modelName: string;
};

@Injectable()
export class LlmProvidersService {
  constructor(private prisma: PrismaService, private health: LlmHealthService) {}

  private requirePlatformAdmin(actor: User) {
    if (!actor.isPlatformAdmin) throw new ForbiddenException('仅平台管理员可操作');
  }

  private toModelView(m: {
    id: string;
    providerId: string;
    modelId: string;
    displayName: string;
    enabled: boolean;
    thinkingEnabled: boolean;
    isPreferred: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    meta?: Prisma.JsonValue;
  }): LlmModelView {
    return {
      id: m.id,
      providerId: m.providerId,
      modelId: m.modelId,
      displayName: m.displayName,
      enabled: m.enabled,
      thinkingEnabled: m.thinkingEnabled,
      isPreferred: m.isPreferred,
      supportsTools: modelCapabilities(m).tools,
      supportsVision: modelCapabilities(m).vision,
      sortOrder: m.sortOrder,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  }

  private toProviderView(p: {
    id: string;
    name: string;
    displayName: string;
    kind: string;
    baseUrl: string | null;
    apiKeyEnc: string | null;
    apiKeyHint: string | null;
    note: string | null;
    enabled: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    models?: Array<{
      id: string;
      providerId: string;
      modelId: string;
      displayName: string;
      enabled: boolean;
      thinkingEnabled: boolean;
      isPreferred: boolean;
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }): LlmProviderView {
    const hasApiKey = Boolean(p.apiKeyEnc);
    return {
      id: p.id,
      name: p.name,
      displayName: p.displayName,
      kind: p.kind,
      baseUrl: p.baseUrl,
      apiKeyMasked: hasApiKey ? p.apiKeyHint || '••••' : null,
      hasApiKey,
      note: p.note,
      enabled: p.enabled,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      models: (p.models ?? []).map((m) => this.toModelView(m)),
    };
  }

  async list(actor: User): Promise<LlmProviderView[]> {
    this.requirePlatformAdmin(actor);
    const rows = await this.prisma.llmProvider.findMany({
      include: { models: { orderBy: [{ sortOrder: 'asc' }, { modelId: 'asc' }] } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const states=await this.health.states();
    return rows.map(r=>{const view=this.toProviderView(r);for(const m of view.models)m.health=this.health.view(m,states);return view;});
  }

  async get(actor: User, id: string): Promise<LlmProviderView> {
    this.requirePlatformAdmin(actor);
    const row = await this.prisma.llmProvider.findUnique({
      where: { id },
      include: { models: { orderBy: [{ sortOrder: 'asc' }, { modelId: 'asc' }] } },
    });
    if (!row) throw new NotFoundException('厂商不存在');
    const view=this.toProviderView(row);const states=await this.health.states();
    for(const m of view.models)m.health=this.health.view(m,states);
    return view;
  }

  async create(actor: User, dto: CreateLlmProviderDto): Promise<LlmProviderView> {
    this.requirePlatformAdmin(actor);
    const name = dto.name.trim();
    const displayName = dto.displayName.trim();
    if (!name || !displayName) throw new BadRequestException('name / displayName 必填');

    const apiKey = dto.apiKey?.trim() || '';
    const apiKeyEnc = apiKey ? encryptApiKey(apiKey) : null;
    const apiKeyHint = apiKey ? maskApiKeyHint(apiKey) : null;

    const models = dto.models ?? [];
    let preferredSeen = false;
    for (const m of models) {
      if (m.isPreferred) {
        if (preferredSeen) throw new BadRequestException('创建时只能有一个首选模型');
        preferredSeen = true;
      }
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (preferredSeen) {
          await tx.$executeRaw`LOCK TABLE llm_model IN SHARE ROW EXCLUSIVE MODE`;
          await tx.llmModel.updateMany({ where: { isPreferred: true }, data: { isPreferred: false } });
        }
        return tx.llmProvider.create({
          data: {
            name,
            displayName,
            kind: (dto.kind || 'openai_compatible').trim() || 'openai_compatible',
            baseUrl: dto.baseUrl?.trim() || null,
            apiKeyEnc,
            apiKeyHint,
            note: dto.note?.trim() || null,
            enabled: dto.enabled ?? true,
            sortOrder: dto.sortOrder ?? 0,
            models: {
              create: models.map((m, i) => ({
                modelId: m.modelId.trim(),
                displayName: (m.displayName || m.modelId).trim(),
                enabled: m.enabled ?? true,
                thinkingEnabled: Boolean(m.thinkingEnabled),
                isPreferred: Boolean(m.isPreferred),
                sortOrder: m.sortOrder ?? i,
              })),
            },
          },
          include: { models: { orderBy: [{ sortOrder: 'asc' }, { modelId: 'asc' }] } },
        });
      });
      await this.prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: 'llm_provider_create',
          meta: { providerId: created.id, name: created.name, modelCount: created.models.length, hasApiKey: Boolean(apiKey) },
        },
      });
      for(const m of created.models)if(m.enabled)this.health.requestProbe(m.id);
      return this.toProviderView(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const dup = await this.prisma.llmProvider.findUnique({ where: { name } });
        if (dup) {
          throw new ConflictException(`厂商短名「${name}」已存在`);
        }
        throw new ConflictException('厂商 name 或模型 modelId 已存在');
      }
      throw err;
    }
  }

  async update(actor: User, id: string, dto: UpdateLlmProviderDto): Promise<LlmProviderView> {
    this.requirePlatformAdmin(actor);
    const existing = await this.prisma.llmProvider.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('厂商不存在');

    const data: Prisma.LlmProviderUpdateInput = {};
    if (dto.displayName !== undefined) {
      const v = dto.displayName.trim();
      if (!v) throw new BadRequestException('displayName 不能为空');
      data.displayName = v;
    }
    if (dto.kind !== undefined) data.kind = dto.kind.trim() || 'openai_compatible';
    if (dto.baseUrl !== undefined) data.baseUrl = dto.baseUrl?.trim() || null;
    if (dto.note !== undefined) data.note = dto.note?.trim() || null;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    if (dto.apiKey !== undefined) {
      const raw = dto.apiKey == null ? '' : String(dto.apiKey);
      if (!raw.trim()) {
        data.apiKeyEnc = null;
        data.apiKeyHint = null;
      } else {
        data.apiKeyEnc = encryptApiKey(raw.trim());
        data.apiKeyHint = maskApiKeyHint(raw.trim());
      }
    }

    const updated = await this.prisma.llmProvider.update({
      where: { id },
      data,
      include: { models: { orderBy: [{ sortOrder: 'asc' }, { modelId: 'asc' }] } },
    });
    if(dto.apiKey!==undefined||dto.baseUrl!==undefined||dto.enabled===true){
      await this.health.reset(id);
      for(const m of updated.models)if(m.enabled)this.health.requestProbe(m.id);
    }
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'llm_provider_update',
        meta: {
          providerId: id,
          name: updated.name,
          fields: Object.keys(dto),
          apiKeyTouched: dto.apiKey !== undefined,
          hasApiKey: Boolean(updated.apiKeyEnc),
        },
      },
    });
    return this.toProviderView(updated);
  }

  async remove(actor: User, id: string): Promise<{ ok: true }> {
    this.requirePlatformAdmin(actor);
    const existing = await this.prisma.llmProvider.findUnique({
      where: { id },
      include: { models: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundException('厂商不存在');

    const modelIds = existing.models.map((m) => m.id);
    // 真删干净：企业分配 → 模型 → 厂商（DB 亦有 ON DELETE CASCADE；此处显式级联便于审计）
    const deleted = await this.prisma.$transaction(async (tx) => {
      const tenantAssignments = modelIds.length
        ? await tx.llmTenantModel.deleteMany({ where: { modelRowId: { in: modelIds } } })
        : { count: 0 };
      const models = modelIds.length
        ? await tx.llmModel.deleteMany({ where: { providerId: id } })
        : { count: 0 };
      await tx.llmProvider.delete({ where: { id } });
      return {
        tenantAssignmentCount: tenantAssignments.count,
        modelCount: models.count,
      };
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'llm_provider_delete',
        meta: {
          providerId: id,
          name: existing.name,
          modelCount: deleted.modelCount,
          tenantAssignmentCount: deleted.tenantAssignmentCount,
        },
      },
    });
    return { ok: true };
  }

  async addModel(actor: User, providerId: string, dto: CreateLlmModelDto): Promise<LlmModelView> {
    this.requirePlatformAdmin(actor);
    const provider = await this.prisma.llmProvider.findUnique({ where: { id: providerId } });
    if (!provider) throw new NotFoundException('厂商不存在');
    const modelId = dto.modelId.trim();
    if (!modelId) throw new BadRequestException('modelId 必填');

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (dto.isPreferred) {
          await tx.$executeRaw`LOCK TABLE llm_model IN SHARE ROW EXCLUSIVE MODE`;
          await tx.llmModel.updateMany({ where: { isPreferred: true }, data: { isPreferred: false } });
        }
        return tx.llmModel.create({
          data: {
            providerId,
            modelId,
            displayName: (dto.displayName || modelId).trim(),
            enabled: dto.enabled ?? true,
            thinkingEnabled: Boolean(dto.thinkingEnabled),
            isPreferred: Boolean(dto.isPreferred),
            sortOrder: dto.sortOrder ?? 0,
          },
        });
      });
      await this.prisma.auditLog.create({
        data: {
          userId: actor.id,
          action: 'llm_model_create',
          meta: { providerId, modelId: created.modelId, id: created.id },
        },
      });
      if(created.enabled)this.health.requestProbe(created.id);
      return this.toModelView(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('该厂商下 modelId 已存在');
      }
      throw err;
    }
  }

  async updateModel(actor: User, modelRowId: string, dto: UpdateLlmModelDto): Promise<LlmModelView> {
    this.requirePlatformAdmin(actor);
    const existing = await this.prisma.llmModel.findUnique({ where: { id: modelRowId } });
    if (!existing) throw new NotFoundException('模型不存在');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isPreferred === true) {
        await tx.$executeRaw`LOCK TABLE llm_model IN SHARE ROW EXCLUSIVE MODE`;
        await tx.llmModel.updateMany({ where: { isPreferred: true }, data: { isPreferred: false } });
      }
      return tx.llmModel.update({
        where: { id: modelRowId },
        data: {
          ...(dto.displayName !== undefined
            ? { displayName: dto.displayName.trim() || existing.displayName }
            : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.thinkingEnabled !== undefined ? { thinkingEnabled: dto.thinkingEnabled } : {}),
          ...(dto.isPreferred !== undefined ? { isPreferred: dto.isPreferred } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...((dto.supportsTools!==undefined||dto.supportsVision!==undefined)?{meta:{
            ...(existing.meta&&typeof existing.meta==='object'&&!Array.isArray(existing.meta)?existing.meta:{}),
            ...(dto.supportsTools!==undefined?{supportsTools:dto.supportsTools}:{}),
            ...(dto.supportsVision!==undefined?{supportsVision:dto.supportsVision}:{}),
          }}:{}),
        },
      });
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'llm_model_update',
        meta: { id: modelRowId, providerId: existing.providerId, modelId: existing.modelId, fields: Object.keys(dto) },
      },
    });
    if(dto.enabled===true&&!existing.enabled){await this.health.reset(existing.providerId,existing.id);this.health.requestProbe(existing.id);}
    return this.toModelView(updated);
  }

  async removeModel(actor: User, modelRowId: string): Promise<{ ok: true }> {
    this.requirePlatformAdmin(actor);
    const existing = await this.prisma.llmModel.findUnique({ where: { id: modelRowId } });
    if (!existing) throw new NotFoundException('模型不存在');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.llmTenantModel.deleteMany({ where: { modelRowId } });
      await tx.llmModel.delete({ where: { id: modelRowId } });
      const left = await tx.llmModel.count({ where: { providerId: existing.providerId } });
      let providerDeleted = false;
      if (left === 0) {
        // 删光模型后清掉空厂商，短名可被新建复用为全新厂商
        await tx.llmProvider.delete({ where: { id: existing.providerId } });
        providerDeleted = true;
      }
      return { providerDeleted };
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: 'llm_model_delete',
        meta: {
          id: modelRowId,
          providerId: existing.providerId,
          modelId: existing.modelId,
          providerDeleted: result.providerDeleted,
        },
      },
    });
    return { ok: true };
  }


  /** 拼上游 URL：chat 或 models 列表。 */
  private buildUpstreamPath(baseUrl: string, kind: 'chat' | 'models'): string {
    const b = baseUrl.trim().replace(/\/+$/, '');
    if (kind === 'chat') {
      if (/\/chat\/completions$/i.test(b)) return b;
      if (/\/v1$/i.test(b)) return `${b}/chat/completions`;
      return `${b}/v1/chat/completions`;
    }
    if (/\/models$/i.test(b)) return b;
    if (/\/v1$/i.test(b)) return `${b}/models`;
    return `${b}/v1/models`;
  }

  /**
   * 最小连通探测：有 modelId 则打 chat/completions；否则打 models 列表。
   * 支持已存 modelRowId，或表单草稿 baseUrl/apiKey/modelId。
   */
  async probe(
    actor: User,
    dto: ProbeLlmDto,
  ): Promise<{ ok: boolean; latencyMs: number; message: string; statusCode?: number }> {
    this.requirePlatformAdmin(actor);
    if (dto.modelRowId && !dto.apiKey && !dto.baseUrl && !dto.modelId) return this.health.probeSaved(dto.modelRowId);
    const started = Date.now();

    let baseUrl = (dto.baseUrl || '').trim();
    let apiKey = (dto.apiKey || '').trim();
    let modelId = (dto.modelId || '').trim();

    if (dto.modelRowId?.trim()) {
      const model = await this.prisma.llmModel.findUnique({
        where: { id: dto.modelRowId.trim() },
        include: { provider: true },
      });
      if (!model) throw new NotFoundException('模型不存在');
      if (!baseUrl) baseUrl = (model.provider.baseUrl || '').trim();
      if (!modelId) modelId = model.modelId;
      if (!apiKey) {
        if (!model.provider.apiKeyEnc) {
          return { ok: false, latencyMs: Date.now() - started, message: '厂商未配置 API Key' };
        }
        try {
          apiKey = decryptApiKey(model.provider.apiKeyEnc);
        } catch {
          return { ok: false, latencyMs: Date.now() - started, message: '厂商 Key 解密失败' };
        }
      }
    } else if (dto.providerId?.trim() && !apiKey) {
      const provider = await this.prisma.llmProvider.findUnique({
        where: { id: dto.providerId.trim() },
      });
      if (!provider) throw new NotFoundException('厂商不存在');
      if (!baseUrl) baseUrl = (provider.baseUrl || '').trim();
      if (!provider.apiKeyEnc) {
        return { ok: false, latencyMs: Date.now() - started, message: '厂商未配置 API Key' };
      }
      try {
        apiKey = decryptApiKey(provider.apiKeyEnc);
      } catch {
        return { ok: false, latencyMs: Date.now() - started, message: '厂商 Key 解密失败' };
      }
    }

    if (!baseUrl) {
      return { ok: false, latencyMs: Date.now() - started, message: '请填写 Base URL' };
    }
    if (!apiKey) {
      return { ok: false, latencyMs: Date.now() - started, message: '请填写 API Key' };
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    try {
      if (modelId) {
        const url = this.buildUpstreamPath(baseUrl, 'chat');
        const resp = await axios.post(
          url,
          {
            model: modelId,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            stream: false,
            thinking: { type: 'disabled' },
          },
          { headers, timeout: 20000, validateStatus: () => true },
        );
        const latencyMs = Date.now() - started;
        if (resp.status >= 200 && resp.status < 300) {
          return { ok: true, latencyMs, message: `通 (${latencyMs}ms)`, statusCode: resp.status };
        }
        const detail =
          typeof resp.data === 'object' && resp.data && 'error' in (resp.data as object)
            ? JSON.stringify((resp.data as { error?: unknown }).error).slice(0, 200)
            : String(resp.statusText || resp.status);
        return {
          ok: false,
          latencyMs,
          message: `不通 HTTP ${resp.status}: ${detail}`,
          statusCode: resp.status,
        };
      }

      const url = this.buildUpstreamPath(baseUrl, 'models');
      const resp = await axios.get(url, {
        headers,
        timeout: 15000,
        validateStatus: () => true,
      });
      const latencyMs = Date.now() - started;
      if (resp.status >= 200 && resp.status < 300) {
        return { ok: true, latencyMs, message: `通 (${latencyMs}ms，models)`, statusCode: resp.status };
      }
      return {
        ok: false,
        latencyMs,
        message: `不通 HTTP ${resp.status}`,
        statusCode: resp.status,
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const msg = err instanceof Error ? err.message : '请求失败';
      return { ok: false, latencyMs, message: `不通: ${msg}` };
    }
  }


  /**
   * 拉取上游 OpenAI 兼容 /models 列表。
   * 支持表单草稿 baseUrl/apiKey，或已存 providerId（可覆盖 baseUrl/apiKey）。
   */
  async listRemoteModels(
    actor: User,
    dto: ListRemoteModelsDto,
  ): Promise<{ ok: boolean; latencyMs: number; message: string; models: Array<{ id: string; ownedBy?: string }> }> {
    this.requirePlatformAdmin(actor);
    const started = Date.now();

    let baseUrl = (dto.baseUrl || '').trim();
    let apiKey = (dto.apiKey || '').trim();

    if (dto.providerId?.trim() && (!apiKey || !baseUrl)) {
      const provider = await this.prisma.llmProvider.findUnique({
        where: { id: dto.providerId.trim() },
      });
      if (!provider) throw new NotFoundException('厂商不存在');
      if (!baseUrl) baseUrl = (provider.baseUrl || '').trim();
      if (!apiKey) {
        if (!provider.apiKeyEnc) {
          return { ok: false, latencyMs: Date.now() - started, message: '厂商未配置 API Key', models: [] };
        }
        try {
          apiKey = decryptApiKey(provider.apiKeyEnc);
        } catch {
          return { ok: false, latencyMs: Date.now() - started, message: '厂商 Key 解密失败', models: [] };
        }
      }
    }

    if (!baseUrl) {
      return { ok: false, latencyMs: Date.now() - started, message: '请填写 Base URL', models: [] };
    }
    if (!apiKey) {
      return { ok: false, latencyMs: Date.now() - started, message: '请填写 API Key', models: [] };
    }

    const url = this.buildUpstreamPath(baseUrl, 'models');
    try {
      const resp = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        timeout: 20000,
        validateStatus: () => true,
      });
      const latencyMs = Date.now() - started;
      if (resp.status < 200 || resp.status >= 300) {
        return {
          ok: false,
          latencyMs,
          message: `拉取失败 HTTP ${resp.status}`,
          models: [],
        };
      }
      const raw = resp.data;
      const list: unknown[] = Array.isArray(raw)
        ? raw
        : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)
          ? ((raw as { data: unknown[] }).data)
          : [];
      const models: Array<{ id: string; ownedBy?: string }> = [];
      const seen = new Set<string>();
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const id = String((item as { id?: unknown }).id || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const ownedBy = (item as { owned_by?: unknown }).owned_by;
        models.push({
          id,
          ownedBy: typeof ownedBy === 'string' ? ownedBy : undefined,
        });
      }
      models.sort((a, b) => a.id.localeCompare(b.id));
      return {
        ok: true,
        latencyMs,
        message: `已获取 ${models.length} 个模型 (${latencyMs}ms)`,
        models,
      };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const msg = err instanceof Error ? err.message : '请求失败';
      return { ok: false, latencyMs, message: `拉取失败: ${msg}`, models: [] };
    }
  }

  /**
   * 启用且已配置 Key 的聊天模型目录（供计费/后续网关）。
   * 不含 api_key。
   */
  async listEnabledChatCatalog(): Promise<{
    models: GroundEnabledChatModel[];
    preferredRef: string | null;
    source: 'ground';
  }> {
    const providers = await this.prisma.llmProvider.findMany({
      where: { enabled: true, apiKeyEnc: { not: null } },
      include: {
        models: {
          where: { enabled: true },
          orderBy: [{ sortOrder: 'asc' }, { modelId: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const models: GroundEnabledChatModel[] = [];
    let preferredRef: string | null = null;
    for (const p of providers) {
      if (!p.apiKeyEnc) continue;
      for (const m of p.models) {
        models.push({
          providerId: p.id,
          providerName: p.name,
          providerKind: p.kind,
          modelId: m.modelId,
          modelName: m.displayName || m.modelId,
        });
        if (m.isPreferred) preferredRef = `${p.name}/${m.modelId}`;
      }
    }
    return { models, preferredRef, source: 'ground' };
  }
}
