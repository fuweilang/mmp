import { ExpertRuntimeService } from '../official-agent/expert-runtime.service';
import type { ModelPricingSnapshot } from '../billing/model-pricing';
import type { TokenUsageSettlementMark } from '../billing/token-usage.service';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { settleModelPrice } from '../billing/model-pricing';
import { billingKeys } from '../billing/charge.service';
import axios, { AxiosResponse } from 'axios';
import { createHash, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { ApplicationLog } from '../logging/application-log.service';
import { LlmHealthService } from './llm-health.service';
import { LlmConcurrencyService } from './llm-concurrency.service';
import { modelCapabilities } from './model-capabilities';
import { estimateInputTokens, promptFitsContext } from './prompt-tokens';
import { resolveChatProviderConfiguration } from './provider-configuration';

interface UpstreamUsage {
  cacheWrite5mTokens?: number;
  cacheWrite1hTokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export type ResolvedUpstreamModel = {
  providerId: string;
  providerName: string;
  providerKind: string;
  baseUrl: string;
  apiKey: string;
  modelRowId: string;
  modelId: string;
  modelName: string;
  modelRef: string;
  thinkingEnabled: boolean;
};

export type ChatBody = Record<string, unknown> & {
  model?: unknown;
  messages?: unknown;
  stream?: unknown;
};

/** 已由 Controller 重新核验的官方智能体版本，仅用于用量归因，不进入上游模型请求。 */
export type ModelRequestAttribution = {
  agentId?: string;
  versionId?: string;
  sessionId?: string;
  previewId?: string;
  helperPurpose?: 'compaction' | 'session-title';
  helperOrigin?: {agentId:string;versionId?:string;previewId?:string};
  /** Server-only delegation origin, never accepted as a client payload. */
  previewOrigin?: {agentId:string;previewId:string};
};

/**
 * 余额不足（HTTP 402）响应约定 — Harness 可据此弹出充值/联系管理员：
 * ```json
 * {
 *   "statusCode": 402,
 *   "error": "Payment Required",
 *   "message": "企业 AI 币余额不足，请联系管理员充值",
 *   "code": "INSUFFICIENT_AI_COINS",
 *   "balanceCoins": 0,
 *   "requiredCoins": 1
 * }
 * ```
 * `code` 稳定字符串；`balanceCoins`/`requiredCoins` 为整数 AI 币。
 */
export const INSUFFICIENT_BALANCE_CODE = 'INSUFFICIENT_AI_COINS';

@Injectable()
export class LlmChatGatewayService {
  private readonly logger = new Logger(LlmChatGatewayService.name);

  constructor(
    private prisma: PrismaService,
    private billing: BillingService,
    private health: LlmHealthService,
    private concurrency: LlmConcurrencyService,
    private operationLog: ApplicationLog,
    private expertRuntime?: ExpertRuntimeService,
  ) {}

  /**
   * OpenAI-style model list（无 Key）。
   * 一期：平台已启用且有 Key 的模型，对全部企业开放（不做企业级例外）。
   * 企业用户无 tenantId：空列表。
   */
  async listModelsOpenAiShape(user: User, tenantId: string | null) {
    if (!tenantId && !user.isPlatformAdmin) {
      return { object: 'list', data: [] };
    }

    const candidates=await this.candidates(user,tenantId);
    return {object:'list',data:[{id:'auto',object:'model',created:0,owned_by:'mammoth',display_name:'Automatic',is_preferred:true,is_default:true},
      ...candidates.map(m=>({id:`${m.provider.name}/${m.modelId}`,object:'model',created:Math.floor(m.createdAt.getTime()/1000),owned_by:m.provider.name,display_name:m.displayName||m.modelId,is_preferred:false,is_default:false,capabilities:modelCapabilities(m)}))]};
  }

  private async candidates(user:User,tenantId:string|null,body?:ChatBody) {
    if(!tenantId&&!user.isPlatformAdmin)return [];
    const rows=await this.prisma.llmModel.findMany({
      where:{enabled:true,provider:{enabled:true,apiKeyEnc:{not:null}},
        ...(tenantId?{tenantAssignments:{none:{tenantId,blocked:true}}}:{}),},
      include:{provider:true},orderBy:[{isPreferred:'desc'},{sortOrder:'asc'},{provider:{sortOrder:'asc'}},{modelId:'asc'}],
    });
    const states=await this.health.states();
    const checks=await Promise.all(rows.map(async row=>{
      if(!this.health.available({id:row.id,providerId:row.providerId},states))return false;
      const capabilities=modelCapabilities(row);
      if(body&&requestHasTools(body)&&!capabilities.tools)return false;
      if(body&&requestHasImages(body)&&!capabilities.vision)return false;
      if(body&&!promptFitsContext(body.messages,Number(body.max_tokens??8192),capabilities.contextWindow))return false;
      try{await this.billing.quoteModel(row.provider.name,row.modelId);return true;}
      catch(error){this.operationLog.event('warn','model.price.unavailable',{modelId:row.id,error});return false;}
    }));
    return rows.filter((_row,i)=>checks[i]);
  }

  /**
   * model 支持：
   * - `provider/modelId`（推荐）
   * - 裸 `modelId`（仅当全局唯一启用）
   */
  async resolveModel(
    user: User,
    tenantId: string | null,
    modelRaw: string,
  ): Promise<ResolvedUpstreamModel> {
    const raw = (modelRaw || '').trim();
    if (!raw) throw new BadRequestException('model 必填');

    let providerName: string | null = null;
    let modelId = raw;
    if (raw.includes('/')) {
      const slash = raw.indexOf('/');
      providerName = raw.slice(0, slash).trim();
      modelId = raw.slice(slash + 1).trim();
    }
    if (!modelId) throw new BadRequestException('model 无效');

    if (!tenantId && !user.isPlatformAdmin) {
      throw new ForbiddenException(`缺少企业上下文，无法使用模型：${raw}`);
    }

    let resolved: ResolvedUpstreamModel;
    if (providerName) {
      const provider = await this.prisma.llmProvider.findFirst({
        where: { name: providerName, enabled: true },
        include: {
          models: { where: { modelId, enabled: true }, take: 1 },
        },
      });
      if (!provider || !provider.models[0]) {
        throw new NotFoundException(`模型不可用或不在平台池：${raw}`);
      }
      resolved = this.toResolved(provider, provider.models[0]);
    } else {
      const matches = await this.prisma.llmModel.findMany({
        where: {
          modelId,
          enabled: true,
          provider: { enabled: true, apiKeyEnc: { not: null } },
        },
        include: { provider: true },
        take: 3,
      });
      if (matches.length === 0) {
        throw new NotFoundException(`模型不可用或不在平台池：${raw}`);
      }
      if (matches.length > 1) {
        throw new BadRequestException(
          `model「${raw}」对应多个厂商，请使用 provider/modelId：${matches
            .map((m) => `${m.provider.name}/${m.modelId}`)
            .join(', ')}`,
        );
      }
      resolved = this.toResolved(matches[0].provider, matches[0]);
    }

    const available=await this.candidates(user,tenantId);
    if(!available.some(m=>m.id===resolved.modelRowId))throw new ServiceUnavailableException({code:'MODEL_UNAVAILABLE',message:'所选模型暂不可用，请选择“自动”或其他模型',model:raw});
    return resolved;
  }

  private toResolved(
    provider: {
      id: string;
      name: string;
      kind: string;
      baseUrl: string | null;
      apiKeyEnc: string | null;
    },
    model: { id: string; modelId: string; displayName: string; thinkingEnabled: boolean },
  ): ResolvedUpstreamModel {
    const {baseUrl,apiKey}=resolveChatProviderConfiguration(provider);
    return {
      providerId: provider.id,
      providerName: provider.name,
      providerKind: provider.kind,
      baseUrl,
      apiKey,
      modelRowId: model.id,
      modelId: model.modelId,
      modelName: model.displayName || model.modelId,
      modelRef: `${provider.name}/${model.modelId}`,
      thinkingEnabled: model.thinkingEnabled,
    };
  }

  /** 拼上游 chat completions URL。 */
  buildUpstreamUrl(baseUrl: string): string {
    const b = baseUrl.trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(b)) return b;
    if (/\/v1$/i.test(b)) return `${b}/chat/completions`;
    return `${b}/v1/chat/completions`;
  }

  /**
   * 将计费/校验 HttpException 写成 JSON（@Res 手工响应路径）。
   * 402 形状见文件头注释。
   */
  writeGatewayError(res: Response, err: unknown): boolean {
    if (!(err instanceof HttpException)) return false;
    if (res.headersSent) return true;
    const status = err.getStatus();
    if (status === 429) res.setHeader('Retry-After', '1');
    const body = err.getResponse();
    if (typeof body === 'string') {
      res.status(status).json({
        statusCode: status,
        message: body,
        code: status === 402 ? INSUFFICIENT_BALANCE_CODE : undefined,
      });
      return true;
    }
    const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    res.status(status).json({
      statusCode: status,
      error: status === 402 ? 'Payment Required' : undefined,
      ...obj,
      requestId: this.operationLog.requestId(),
      code: obj.code ?? (status === 402 ? INSUFFICIENT_BALANCE_CODE : undefined),
    });
    return true;
  }

  async proxyChatCompletions(
    user: User,
    tenantId: string | null,
    body: ChatBody,
    res: Response,
    attribution?: ModelRequestAttribution,
  ): Promise<void> {
    let releaseConcurrency: (() => void) | undefined;
    try {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new BadRequestException('请求体无效');
      }
      if (!Array.isArray(body.messages)) {
        throw new BadRequestException('messages 必须是数组');
      }
      releaseConcurrency = this.concurrency.acquire(user.id, tenantId);

      if(attribution?.previewId && (!attribution.agentId || attribution.versionId))throw new BadRequestException('INVALID_PREVIEW_ATTRIBUTION');
      if(attribution?.agentId && !attribution.versionId && !attribution.previewId)throw new BadRequestException('INVALID_EXPERT_ATTRIBUTION');
      const binding=attribution?.agentId?{agentId:attribution.agentId,versionId:attribution.versionId,previewId:attribution.previewId}:undefined;
      if(attribution?.helperOrigin)await this.expertRuntime!.load(user,tenantId,attribution.helperOrigin);
      if(attribution?.previewOrigin)await this.expertRuntime!.load(user,tenantId,attribution.previewOrigin);
      const policy=binding?await this.expertRuntime!.enforceModel(user,tenantId,binding):undefined;
      const requested=policy?.model??(String(body.model??'auto').trim()||'auto');
      const automatic=requested==='auto'||requested==='*';
      await this.billing.precheck(user,tenantId);
      const rows=await this.candidates(user,tenantId,body);
      const routes=automatic?rows.map(m=>this.toResolved(m.provider,m)):[await this.resolveModel(user,tenantId,requested)];
      if(!routes.length)throw new ServiceUnavailableException({code:'MODELS_UNAVAILABLE',message:'暂无可用模型，请稍后重试或联系管理员'});
      if(!automatic&&!rows.some(m=>m.id===routes[0].modelRowId))throw new BadRequestException('所选模型不支持当前任务，请选择“自动”或其他模型');
      const stream=Boolean(body.stream);
      for(let attempt=0;attempt<routes.length;attempt++){
        if(res.destroyed)return;
        const resolved=routes[attempt];
        const states=await this.health.states();
        if(!this.health.available({id:resolved.modelRowId,providerId:resolved.providerId},states))continue;
        let pricing:ModelPricingSnapshot;
        try{pricing=await this.billing.quoteModel(resolved.providerName,resolved.modelId);}
        catch(error){this.operationLog.event('error','model.price.failed',{model:resolved.modelRef,error});if(automatic)continue;throw error;}
        // 请求前按估算上限冻结（402/429 会经 writeGatewayError 返回，不发上游）
        const baseKey=createHash('sha256').update(`${user.id}|${tenantId||''}|${resolved.modelRef}|${Date.now()}|${attempt}|${randomUUID()}`).digest('hex').slice(0,40);
        const keys=billingKeys(baseKey);
        if(!user.isPlatformAdmin){
          const est=estimateRequestTokens(body);
          const freezeCoins=Math.max(1,settleModelPrice(pricing,est.input,est.output,0,0,0).chargedCoins);
          await this.billing.freeze(user,tenantId,{idempotencyKey:keys.freezeKey,coins:freezeCoins,provider:resolved.providerName,model:resolved.modelId,inputEstimate:est.input,outputEstimate:est.output});
        }
        const releaseFrozen=async(reason:string)=>{
          try{await this.billing.releaseFrozen(user,tenantId,{freezeKey:keys.freezeKey,unfreezeKey:keys.unfreezeKey,reason});}
          catch(error){this.operationLog.event('error','billing.unfreeze_failed',{userId:user.id,tenantId,model:resolved.modelRef,reason,error});}
        };
        if(binding || attribution?.helperOrigin){
          try{if(attribution?.helperOrigin)await this.expertRuntime!.load(user,tenantId,attribution.helperOrigin);if(attribution?.previewOrigin)await this.expertRuntime!.load(user,tenantId,attribution.previewOrigin);const current=binding?await this.expertRuntime!.enforceModel(user,tenantId,binding):undefined;if(current?.model && current.model!==resolved.modelRef)throw new ForbiddenException('FIXED_GENERATION_MODEL_CHANGED');}
          catch(error){await releaseFrozen('runtime-authorization-revoked');throw error;}
        }
        const upstreamBody:Record<string,unknown>={...body,model:resolved.modelId,stream,thinking:{type:resolved.thinkingEnabled||(!binding && requestHasTools(body))?'enabled':'disabled'}};
        if(stream)upstreamBody.stream_options={...(typeof body.stream_options==='object'&&body.stream_options?body.stream_options:{}),include_usage:true};
        const started=Date.now();
        this.operationLog.event('info','model.request',{userId:user.id,tenantId,model:resolved.modelRef,automatic,attempt:attempt+1,stream});
        const abort=new AbortController();const cancel=()=>abort.abort();res.once('close',cancel);
        let upstream:AxiosResponse;
        try{
          upstream=await axios.post(this.buildUpstreamUrl(resolved.baseUrl),upstreamBody,{
            headers:{Authorization:`Bearer ${resolved.apiKey}`,'Content-Type':'application/json',Accept:stream?'text/event-stream':'application/json'},
            responseType:stream?'stream':'json',timeout:600000,validateStatus:()=>true,maxRedirects:0,signal:abort.signal,
          });
        }catch(error){
          res.removeListener('close',cancel);
          await releaseFrozen(abort.signal.aborted?'client-cancel-before-response':'transport-error');
          if(abort.signal.aborted)return;
          await this.health.failure({id:resolved.modelRowId,providerId:resolved.providerId},0);
          this.operationLog.event('error','model.transport_error',{userId:user.id,tenantId,model:resolved.modelRef,durationMs:Date.now()-started,error});
          if(automatic)continue;
          throw new ServiceUnavailableException({code:'MODEL_UNAVAILABLE',message:'所选模型连接失败，请选择“自动”或其他模型'});
        }
        if(upstream.status>=400){
          res.removeListener('close',cancel);
          await releaseFrozen(`upstream-${upstream.status}`);
          const reroutable=await this.health.failure({id:resolved.modelRowId,providerId:resolved.providerId},upstream.status);
          this.operationLog.event('warn','model.upstream_error',{userId:user.id,tenantId,model:resolved.modelRef,status:upstream.status,automatic,durationMs:Date.now()-started});
          if(stream&&upstream.data&&typeof upstream.data.destroy==='function')upstream.data.destroy();
          // A rejected request can be retried on another eligible route before any response is sent.
          if(automatic&&reroutable)continue;
          if(reroutable)throw new ServiceUnavailableException({code:'MODEL_UNAVAILABLE',message:'所选模型暂不可用，请选择“自动”或其他模型'});
          throw new BadRequestException({code:'MODEL_REQUEST_REJECTED',message:'模型不接受当前请求，请缩短上下文或调整输入后重试'});
        }
        res.setHeader('X-MMP-Model',resolved.modelRef);
        this.operationLog.event('info','model.selected',{userId:user.id,tenantId,model:resolved.modelRef,automatic,attempt:attempt+1,headersMs:Date.now()-started});
        try{
          if(stream){await this.pipeStreamAndSettle(user,tenantId,resolved,upstream,res,pricing,keys,attribution);}
          else{
            await this.health.success({id:resolved.modelRowId,providerId:resolved.providerId},Date.now()-started);
            res.status(upstream.status).json(upstream.data);
            await this.settleUsage(user,tenantId,resolved,withCacheWriteUsage(extractUsage(upstream.data),upstream.headers),'json',pricing,keys,attribution);
          }
        }finally{res.removeListener('close',cancel);}
        return;
      }
      throw new ServiceUnavailableException({code:'MODELS_UNAVAILABLE',message:'当前可用模型暂时繁忙，请稍后重试'});
    } catch (err) {
      if (this.writeGatewayError(res, err)) return;
      throw err;
    } finally {
      releaseConcurrency?.();
    }
  }


  /**
   * 非流式一次性补全（供官方智能体编排等服务端可信路径复用）。
   * 走与 chat/completions 相同的选模/冻结/结算；不经 Express Response。
   */
  async completeOnce(
    user: User,
    tenantId: string | null,
    body: ChatBody,
    attribution?: ModelRequestAttribution,
  ): Promise<{ modelRef: string; content: string; raw: unknown }> {
    let releaseConcurrency: (() => void) | undefined;
    try {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new BadRequestException('请求体无效');
      }
      if (!Array.isArray(body.messages)) {
        throw new BadRequestException('messages 必须是数组');
      }
      releaseConcurrency = this.concurrency.acquire(user.id, tenantId);
      if(attribution?.previewId && (!attribution.agentId || attribution.versionId))throw new BadRequestException('INVALID_PREVIEW_ATTRIBUTION');
      if(attribution?.agentId && !attribution.versionId && !attribution.previewId)throw new BadRequestException('INVALID_EXPERT_ATTRIBUTION');
      const binding=attribution?.agentId?{agentId:attribution.agentId,versionId:attribution.versionId,previewId:attribution.previewId}:undefined;
      if(attribution?.helperOrigin)await this.expertRuntime!.load(user,tenantId,attribution.helperOrigin);
      if(attribution?.previewOrigin)await this.expertRuntime!.load(user,tenantId,attribution.previewOrigin);
      const policy=binding?await this.expertRuntime!.enforceModel(user,tenantId,binding):undefined;
      const requested = policy?.model ?? (String(body.model ?? 'auto').trim() || 'auto');
      const automatic = requested === 'auto' || requested === '*';
      await this.billing.precheck(user, tenantId);
      const rows = await this.candidates(user, tenantId, body);
      const routes = automatic
        ? rows.map((m) => this.toResolved(m.provider, m))
        : [await this.resolveModel(user, tenantId, requested)];
      if (!routes.length) {
        throw new ServiceUnavailableException({
          code: 'MODELS_UNAVAILABLE',
          message: '暂无可用模型，请稍后重试或联系管理员',
        });
      }
      if(!automatic&&!rows.some(m=>m.id===routes[0].modelRowId))throw new BadRequestException('FIXED_MODEL_TASK_UNSUPPORTED');
      for (let attempt = 0; attempt < routes.length; attempt++) {
        const resolved = routes[attempt];
        const states = await this.health.states();
        if (!this.health.available({ id: resolved.modelRowId, providerId: resolved.providerId }, states)) continue;
        let pricing: ModelPricingSnapshot;
        try {
          pricing = await this.billing.quoteModel(resolved.providerName, resolved.modelId);
        } catch (error) {
          this.operationLog.event('error', 'model.price.failed', { model: resolved.modelRef, error });
          if (automatic) continue;
          throw error;
        }
        const baseKey = createHash('sha256')
          .update(`${user.id}|${tenantId || ''}|${resolved.modelRef}|${Date.now()}|${attempt}|${randomUUID()}|once`)
          .digest('hex')
          .slice(0, 40);
        const keys = billingKeys(baseKey);
        if (!user.isPlatformAdmin) {
          const est = estimateRequestTokens(body);
          const freezeCoins = Math.max(1, settleModelPrice(pricing, est.input, est.output, 0, 0, 0).chargedCoins);
          await this.billing.freeze(user, tenantId, {
            idempotencyKey: keys.freezeKey,
            coins: freezeCoins,
            provider: resolved.providerName,
            model: resolved.modelId,
            inputEstimate: est.input,
            outputEstimate: est.output,
          });
        }
        const releaseFrozen = async (reason: string) => {
          try {
            await this.billing.releaseFrozen(user, tenantId, {
              freezeKey: keys.freezeKey,
              unfreezeKey: keys.unfreezeKey,
              reason,
            });
          } catch (error) {
            this.operationLog.event('error', 'billing.unfreeze_failed', {
              userId: user.id,
              tenantId,
              model: resolved.modelRef,
              reason,
              error,
            });
          }
        };
        if(binding || attribution?.helperOrigin){try{if(attribution?.helperOrigin)await this.expertRuntime!.load(user,tenantId,attribution.helperOrigin);if(attribution?.previewOrigin)await this.expertRuntime!.load(user,tenantId,attribution.previewOrigin);const current=binding?await this.expertRuntime!.enforceModel(user,tenantId,binding):undefined;if(current?.model && current.model!==resolved.modelRef)throw new ForbiddenException('FIXED_GENERATION_MODEL_CHANGED');}catch(error){await releaseFrozen('runtime-authorization-revoked');throw error;}}
        const upstreamBody: Record<string, unknown> = {
          ...body,
          model: resolved.modelId,
          stream: false,
          thinking: { type: resolved.thinkingEnabled || (!binding && requestHasTools(body)) ? 'enabled' : 'disabled' },
        };
        const started = Date.now();
        let upstream: AxiosResponse;
        try {
          upstream = await axios.post(this.buildUpstreamUrl(resolved.baseUrl), upstreamBody, {
            headers: {
              Authorization: `Bearer ${resolved.apiKey}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            responseType: 'json',
            timeout: 180000,
            validateStatus: () => true,
            maxRedirects: 0,
          });
        } catch (error) {
          await releaseFrozen('transport-error');
          await this.health.failure({ id: resolved.modelRowId, providerId: resolved.providerId }, 0);
          this.operationLog.event('error', 'model.transport_error', {
            userId: user.id,
            tenantId,
            model: resolved.modelRef,
            durationMs: Date.now() - started,
            error,
          });
          if (automatic) continue;
          throw new ServiceUnavailableException({
            code: 'MODEL_UNAVAILABLE',
            message: '所选模型连接失败，请选择“自动”或其他模型',
          });
        }
        if (upstream.status >= 400) {
          await releaseFrozen(`upstream-${upstream.status}`);
          const reroutable = await this.health.failure(
            { id: resolved.modelRowId, providerId: resolved.providerId },
            upstream.status,
          );
          if (automatic && reroutable) continue;
          if (reroutable) {
            throw new ServiceUnavailableException({
              code: 'MODEL_UNAVAILABLE',
              message: '所选模型暂不可用，请选择“自动”或其他模型',
            });
          }
          throw new BadRequestException({
            code: 'MODEL_REQUEST_REJECTED',
            message: '模型不接受当前请求，请缩短上下文或调整输入后重试',
          });
        }
        await this.health.success({ id: resolved.modelRowId, providerId: resolved.providerId }, Date.now() - started);
        await this.settleUsage(
          user,
          tenantId,
          resolved,
          withCacheWriteUsage(extractUsage(upstream.data), upstream.headers),
          'json',
          pricing,
          keys,
          attribution,
        );
        const content = extractAssistantText(upstream.data);
        return { modelRef: resolved.modelRef, content, raw: upstream.data };
      }
      throw new ServiceUnavailableException({
        code: 'MODELS_UNAVAILABLE',
        message: '当前可用模型暂时繁忙，请稍后重试',
      });
    } finally {
      releaseConcurrency?.();
    }
  }

  private async pipeStreamAndSettle(
    user: User,
    tenantId: string | null,
    resolved: ResolvedUpstreamModel,
    upstream: AxiosResponse,
    res: Response,
    pricing: ModelPricingSnapshot,
    keys: ReturnType<typeof billingKeys>,
    attribution?: ModelRequestAttribution,
  ): Promise<void> {
    const contentType =
      String(upstream.headers['content-type'] || '') || 'text/event-stream; charset=utf-8';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // 避免某些代理缓冲 SSE
    res.setHeader('X-Accel-Buffering', 'no');

    const src = upstream.data as Readable;
    let buffer = '';
    let streamFailed=false;
    let upstreamEnded=false;
    let clientCancelled=false;
    let usage: UpstreamUsage | null =
      null;

    src.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      buffer += text;
      // 只保留尾部，避免无限膨胀
      if (buffer.length > 64_000) buffer = buffer.slice(-32_000);
      const parsed = extractUsageFromSseBuffer(buffer);
      if (parsed) usage = parsed;
      if (!res.writableEnded) res.write(chunk);
    });

    await new Promise<void>((resolve) => {
      const done = () => resolve();
      src.on('end', () => {upstreamEnded=true;done();});
      src.on('close', done);
      src.on('error', (err) => {
        streamFailed=true;
        this.operationLog.event('error','model.stream_error',{model:resolved.modelRef,userId:user.id,tenantId,error:err});
        done();
      });
      res.on('close', () => {
        if(!res.writableFinished)clientCancelled=true;
        try {
          src.destroy();
        } catch {
          /* ignore */
        }
      });
    });

    if(!clientCancelled&&(!upstreamEnded||streamFailed)){
      await this.health.failure({id:resolved.modelRowId,providerId:resolved.providerId},502);
      if(!res.writableEnded)res.write(`data: ${JSON.stringify({error:{code:'MODEL_STREAM_INTERRUPTED',message:'模型输出中断，请重试；本次未自动切换模型',requestId:this.operationLog.requestId()}})}\n\n`);
    }else if(!clientCancelled){await this.health.success({id:resolved.modelRowId,providerId:resolved.providerId});}
    if (!res.writableEnded) res.end();
    await this.settleUsage(user, tenantId, resolved, withCacheWriteUsage(usage, upstream.headers), 'stream', pricing, keys, attribution);
  }

  /**
   * 记账：写 token_usage_turn + 结算（解冻冻结额、按实际扣费，同事务）。
   * 无 usage（上游未计量）：全额解冻、不计费。失败只打日志，不回滚已完成的上游对话。
   */
  private async settleUsage(
    user: User,
    tenantId: string | null,
    resolved: ResolvedUpstreamModel,
    usage: UpstreamUsage | null,
    mode: 'json' | 'stream',
    pricing: ModelPricingSnapshot,
    keys: ReturnType<typeof billingKeys>,
    attribution?: ModelRequestAttribution,
  ): Promise<void> {
    const input = Math.max(0, Math.floor(Number(usage?.prompt_tokens ?? 0) || 0));
    const output = Math.max(0, Math.floor(Number(usage?.completion_tokens ?? 0) || 0));
    let total = Math.max(0, Math.floor(Number(usage?.total_tokens ?? 0) || 0));
    if (total <= 0) total = input + output;

    const usageKey = `gw-usage-${keys.chargeKey.slice('gw-charge-'.length)}`;

    const cached = Math.max(0, Math.floor(Number(usage?.prompt_tokens_details?.cached_tokens ?? usage?.prompt_cache_hit_tokens ?? 0)));
    this.operationLog.event('info','model.usage',{userId:user.id,tenantId,model:resolved.modelRef,inputTokens:input,outputTokens:output,cachedTokens:cached,hasUsage:!!usage,officialAgentId:attribution?.agentId,officialAgentVersionId:attribution?.versionId});
    let usageMeta: Prisma.InputJsonObject = { actorUserId:user.id, previewId:attribution?.previewId??attribution?.previewOrigin?.previewId??attribution?.helperOrigin?.previewId??null, usagePurpose:(attribution?.previewId||attribution?.previewOrigin||attribution?.helperOrigin?.previewId)?'PLATFORM_OPERATIONAL_PREVIEW':'CHAT', helperPurpose:attribution?.helperPurpose??null, requestId:this.operationLog.requestId()??null, exempt: user.isPlatformAdmin, billingStatus: usage && input + output > 0 ? 'usage-recorded' : 'usage-missing' };
    if (attribution?.agentId || attribution?.helperOrigin) {
      usageMeta = {
        ...usageMeta,
        officialAgentId: attribution.agentId ?? attribution.helperOrigin!.agentId,
        officialAgentVersionId: attribution.versionId ?? attribution.helperOrigin?.versionId ?? null,
      };
    }
    if (usage && input + output > 0) {
      try { usageMeta = { ...usageMeta, ...settleModelPrice(pricing, input, output, cached, usage.cacheWrite5mTokens ?? 0, usage.cacheWrite1hTokens ?? 0), billingStatus: 'pending-settlement' }; }
      catch { usageMeta = { ...usageMeta, billingStatus: 'usage-invalid' }; }
    }
    try {
      await this.billing.reportTokenUsage(user, tenantId, {
        idempotencyKey: usageKey,
        model: resolved.modelRef,
        inputTokens: input,
        outputTokens: output,
        totalTokens: total,
        modelCalls: 1,
        threadId: attribution?.sessionId ?? '',
        agentId: attribution?.agentId ?? attribution?.helperOrigin?.agentId ?? '',
        clientKind: 'gateway',
        source: 'ground_chat_gateway',
      }, usageMeta);
    } catch (e) {
      this.operationLog.event('error','billing.usage_record_failed',{userId:user.id,tenantId,model:resolved.modelRef,error:e});
    }

    if (!usage || input + output <= 0) {
      // 无 usage：不计费，全额解冻
      try{await this.billing.releaseFrozen(user,tenantId,{freezeKey:keys.freezeKey,unfreezeKey:keys.unfreezeKey,reason:'usage-missing'});}
      catch(error){this.operationLog.event('error','billing.unfreeze_failed',{userId:user.id,tenantId,model:resolved.modelRef,reason:'usage-missing',error});}
      this.operationLog.event('error','billing.usage_missing',{userId:user.id,tenantId,model:resolved.modelRef,mode});
      return;
    }

    try {
      const charged=await this.billing.settleFrozen(user, tenantId, {
        freezeKey: keys.freezeKey,
        unfreezeKey: keys.unfreezeKey,
        charge: {
          tokens: input + output,
          inputTokens: input,
          outputTokens: output,
          cachedInputTokens: cached,
          cacheWrite5mTokens: usage.cacheWrite5mTokens ?? 0,
          cacheWrite1hTokens: usage.cacheWrite1hTokens ?? 0,
          idempotencyKey: keys.chargeKey,
          provider: resolved.providerName,
          model: resolved.modelId,
        },
      }, pricing);
      this.operationLog.event('info','billing.settled',{userId:user.id,tenantId,model:resolved.modelRef,charged});
      await this.markUsageSettlement(usageKey, {
        status: charged.skipped ? 'exempt' : 'settled',
        chargedCoins: charged.chargedCoins,
        ...('ledgerId' in charged && charged.ledgerId ? { ledgerId: charged.ledgerId } : {}),
      });
    } catch (e) {
      const insufficient = e instanceof HttpException && e.getStatus() === 402;
      await this.markUsageSettlement(usageKey, {
        status: 'settlement-failed',
        reason: insufficient ? 'insufficient-ai-coins' : 'charge-failed',
      });
      if (insufficient) {
        this.operationLog.event('error','billing.insufficient_after_usage',{userId:user.id,tenantId,model:resolved.modelRef,totalTokens:total});
        return;
      }
      this.operationLog.event('error','billing.settlement_failed',{userId:user.id,tenantId,model:resolved.modelRef,error:e});
    }
  }

  /** 结算状态更新失败只告警，不改变已经完成的模型响应。 */
  private async markUsageSettlement(idempotencyKey: string, mark: TokenUsageSettlementMark): Promise<void> {
    try {
      const result = await this.billing.markTokenUsageSettlement(idempotencyKey, mark);
      if (!result.ok) this.operationLog.event('warn','billing.usage_settlement_mark_missing',{idempotencyKey,status:mark.status});
    } catch (error) {
      this.operationLog.event('error','billing.usage_settlement_mark_failed',{idempotencyKey,status:mark.status,error});
    }
  }
}

/** Ordinary Agent tools retain their thinking policy; official experts honor the model's Admin setting. */
function requestHasTools(body: Record<string, unknown>): boolean {
  const tools = body.tools;
  return Array.isArray(tools) && tools.length > 0;
}

/**
 * 冻结用估算上限：文字仍按 JSON 字符数/2，每张图按固定视觉开销，
 * 与 candidates 的上下文估算一致。输出 = max_tokens（缺省 8192）。
 * 全部按非缓存价折算，保证覆盖实际成本。
 */
function estimateRequestTokens(body: ChatBody): { input: number; output: number } {
  const input = estimateInputTokens(body.messages, body.tools);
  const rawOut = Number(body.max_tokens ?? 8192);
  const output = Number.isFinite(rawOut) && rawOut > 0 ? Math.floor(rawOut) : 8192;
  return { input, output };
}


function extractAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return '';
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : ''))
      .join('');
  }
  return '';
}

function extractUsage(data: unknown): UpstreamUsage | null {
  if (!data || typeof data !== 'object') return null;
  const u = (data as { usage?: unknown }).usage;
  if (!u || typeof u !== 'object') return null;
  return u as UpstreamUsage;
}

function extractUsageFromSseBuffer(buf: string): UpstreamUsage | null {
  // 找最后一次带 usage 的 data 行
  let last: ReturnType<typeof extractUsage> = null;
  for (const line of buf.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const json = JSON.parse(payload) as unknown;
      const u = extractUsage(json);
      if (u) last = u;
    } catch {
      /* ignore partial */
    }
  }
  return last;
}

/** Kimi reports additional cache-write charges in response headers, including SSE responses. */
function withCacheWriteUsage(usage: UpstreamUsage | null, headers: AxiosResponse['headers']): UpstreamUsage | null {
  if (!usage) return null;
  return { ...usage,
    cacheWrite5mTokens: Number(headers['msh-usage-cache-write-tokens-5m'] ?? 0),
    cacheWrite1hTokens: Number(headers['msh-usage-cache-write-tokens-1h'] ?? 0),
  };
}

function requestHasImages(body:ChatBody):boolean {return Array.isArray(body.messages)&&body.messages.some(message=>message&&typeof message==='object'&&'content' in message&&Array.isArray(message.content)&&message.content.some((part:unknown)=>part&&typeof part==='object'&&'type' in part&&part.type==='image_url'));}
