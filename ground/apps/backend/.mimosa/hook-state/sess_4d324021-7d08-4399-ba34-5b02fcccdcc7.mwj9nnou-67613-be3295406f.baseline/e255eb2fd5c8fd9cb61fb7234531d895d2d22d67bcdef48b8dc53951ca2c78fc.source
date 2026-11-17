import { Injectable } from '@nestjs/common';
import type { KnowledgeProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decryptApiKey } from '../llm/llm-key-crypto';
import { KnowledgeCoreError } from './errors';
export type KnowledgeProfileTask = 'EMBEDDING' | 'RERANK';
export interface CreateKnowledgeProfile {
  providerId: string;
  task: KnowledgeProfileTask;
  model: string;
  dimension?: number;
  tokenizer?: 'cl100k_base' | 'o200k_base';
  endpoint?: string;
  timeoutMs?: number;
  batchSize?: number;
  maxInputTokens?: number;
  maxResponseBytes?: number;
  predecessorId?: string;
}
const SAFE_PROFILE_SELECT = {
  id: true,
  providerId: true,
  task: true,
  adapter: true,
  model: true,
  endpoint: true,
  dimension: true,
  tokenizer: true,
  timeoutMs: true,
  batchSize: true,
  maxInputTokens: true,
  maxResponseBytes: true,
  enabled: true,
  predecessorId: true,
  createdAt: true,
} as const;
/** Explicit allowlist: neither provider relations nor encrypted/plaintext credentials are returned. */
export type SafeKnowledgeProfile = Pick<
  KnowledgeProfile,
  keyof typeof SAFE_PROFILE_SELECT
>;
export interface ProviderUsageInput {
  profileId: string;
  operationId?: string;
  task: KnowledgeProfileTask;
  inputCount: number;
  estimatedTokens: number;
  actualTokens: number | null;
  status: 'SUCCEEDED' | 'FAILED';
  errorCode?: string;
}
function integer(n: number, min: number, max: number): number {
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
  return n;
}
export function validateKnowledgeEndpoint(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new KnowledgeCoreError('PROVIDER_ENDPOINT_MISSING');
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new KnowledgeCoreError('PROFILE_INVALID_ENDPOINT');
  return url.toString();
}
/** Local-only readiness shared by publication and runtime. Credentials remain internal. */
export function validateKnowledgeProfileDependency(profile: KnowledgeProfile | null, provider: {enabled:boolean;apiKeyEnc:string|null}|null, task:KnowledgeProfileTask):string {
  if(!profile)throw new KnowledgeCoreError('PROFILE_NOT_FOUND');
  if(!profile.enabled)throw new KnowledgeCoreError('PROFILE_DISABLED');
  if(profile.task!==task)throw new KnowledgeCoreError('PROFILE_TASK_MISMATCH');
  validateKnowledgeEndpoint(profile.endpoint);
  integer(profile.batchSize, 1, 128);
  if(!profile.model?.trim() || profile.adapter!==(task==='EMBEDDING'?'OPENAI_EMBEDDINGS':'COMPATIBLE_RERANK') || (task==='EMBEDDING'&&(!Number.isInteger(profile.dimension)||Number(profile.dimension)<1)))throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
  if(!provider?.enabled)throw new KnowledgeCoreError('PROVIDER_DISABLED');
  if(!provider.apiKeyEnc)throw new KnowledgeCoreError('PROVIDER_CREDENTIALS_MISSING');
  try {const apiKey=decryptApiKey(provider.apiKeyEnc);if(!apiKey.trim())throw new Error();return apiKey;}
  catch {throw new KnowledgeCoreError('PROVIDER_CREDENTIALS_UNAVAILABLE');}
}
/** Trusted server/admin boundary. Controllers must supply super_admin authorization separately. */
@Injectable()
export class KnowledgeProfilesService {
  constructor(private readonly prisma: PrismaService) {}
  async create(input: CreateKnowledgeProfile): Promise<SafeKnowledgeProfile> {
    if (
      !input ||
      !['EMBEDDING', 'RERANK'].includes(input.task) ||
      typeof input.model !== 'string' ||
      !input.model.trim() ||
      input.model.length > 200 ||
      /[\r\n\0]/.test(input.model)
    )
      throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
    const provider = await this.prisma.llmProvider.findUnique({
      where: { id: input.providerId },
    });
    if (!provider) throw new KnowledgeCoreError('PROVIDER_UNCONFIGURED');
    if (!provider.enabled) throw new KnowledgeCoreError('PROVIDER_DISABLED');
    if (!provider.apiKeyEnc)
      throw new KnowledgeCoreError('PROVIDER_CREDENTIALS_MISSING');
    try {
      if (!decryptApiKey(provider.apiKeyEnc).trim()) throw new Error();
    } catch {
      throw new KnowledgeCoreError('PROVIDER_CREDENTIALS_UNAVAILABLE');
    }
    const endpoint = validateKnowledgeEndpoint(
      input.endpoint ??
        `${(provider.baseUrl ?? '').replace(/\/+$/, '')}/${input.task === 'EMBEDDING' ? 'embeddings' : 'rerank'}`,
    );
    const tokenizer = input.tokenizer ?? 'cl100k_base';
    if (!['cl100k_base', 'o200k_base'].includes(tokenizer))
      throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
    if (input.task === 'RERANK' && input.dimension !== undefined)
      throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
    if (input.predecessorId) {
      const previous = await this.get(input.predecessorId);
      if (previous.task !== input.task)
        throw new KnowledgeCoreError('PROFILE_SUCCESSOR_TASK_MISMATCH');
    }
    return this.prisma.knowledgeProfile.create({
      select: SAFE_PROFILE_SELECT,
      data: {
        providerId: provider.id,
        task: input.task,
        adapter:
          input.task === 'EMBEDDING'
            ? 'OPENAI_EMBEDDINGS'
            : 'COMPATIBLE_RERANK',
        model: input.model.trim(),
        endpoint,
        dimension:
          input.task === 'EMBEDDING'
            ? integer(input.dimension as number, 1, 16000)
            : null,
        tokenizer,
        timeoutMs: integer(input.timeoutMs ?? 30000, 1, 120000),
        batchSize: integer(input.batchSize ?? 32, 1, 128),
        maxInputTokens: integer(input.maxInputTokens ?? 8192, 1, 131072),
        maxResponseBytes: integer(
          input.maxResponseBytes ?? 8 * 1024 * 1024,
          1024,
          16 * 1024 * 1024,
        ),
        predecessorId: input.predecessorId,
      },
    });
  }
  async get(id: string): Promise<SafeKnowledgeProfile> {
    const profile = await this.prisma.knowledgeProfile.findUnique({
      select: SAFE_PROFILE_SELECT,
      where: { id },
    });
    if (!profile) throw new KnowledgeCoreError('PROFILE_UNCONFIGURED');
    return profile;
  }
  list(task?: KnowledgeProfileTask): Promise<SafeKnowledgeProfile[]> {
    return this.prisma.knowledgeProfile.findMany({
      select: SAFE_PROFILE_SELECT,
      where: task ? { task } : {},
      orderBy: { createdAt: 'desc' },
    });
  }
  async setEnabled(
    id: string,
    enabled: boolean,
  ): Promise<SafeKnowledgeProfile> {
    await this.get(id);
    if (typeof enabled !== 'boolean')
      throw new KnowledgeCoreError('PROFILE_INVALID_CONFIGURATION');
    return this.prisma.knowledgeProfile.update({
      select: SAFE_PROFILE_SELECT,
      where: { id },
      data: { enabled },
    });
  }
  /** Internal only: never serialize this result or place it in a trace. Endpoint stays frozen; only encrypted credential reference rotates. */
  async resolveForRequest(
    id: string,
    task: KnowledgeProfileTask,
  ): Promise<KnowledgeProfile & { apiKey: string }> {
    const profile = await this.get(id);
    const provider = await this.prisma.llmProvider.findUnique({where:{id:profile.providerId}});
    const apiKey = validateKnowledgeProfileDependency(profile, provider, task);
    return { ...profile, apiKey };
  }
  async recordUsage(input: ProviderUsageInput): Promise<void> {
    await this.prisma.knowledgeProviderUsage.create({ data: input });
  }
}
