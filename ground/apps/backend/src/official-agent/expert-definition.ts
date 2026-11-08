import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeDiscoveryDetail } from './discovery-detail';

/** Metadata only; never registers foreign tools/models or grants access. */
export function normalizeExpertDefinition(value: unknown, fallback: { name: string; summary: string }): Prisma.InputJsonObject {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) {
    throw new BadRequestException('专家定义需为 JSON 对象');
  }
  const raw = (value ?? {}) as Record<string, unknown>;
  if (JSON.stringify(raw).length > 100000) throw new BadRequestException('专家定义超过大小限制');
  const object = (v: unknown): Prisma.InputJsonObject => v && typeof v === 'object' && !Array.isArray(v)
    ? JSON.parse(JSON.stringify(v)) as Prisma.InputJsonObject : {};
  const text = (v: unknown, d = '') => typeof v === 'string' ? v.trim().slice(0, 12000) : d;
  const list = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean))].slice(0, 64) : [];
  const profile = object(raw.profile);
  const known = new Set(['schemaVersion','profile','workflow','deliverables','source','license','dependencies','adaptation','extensions','discoveryDetail']);
  // Normalize the merged unknown metadata through the same JSON boundary as source/license.
  const extensions = object({ ...object(raw.extensions), ...Object.fromEntries(Object.entries(raw).filter(([k]) => !known.has(k))) });
  return {
    schemaVersion: 1,
    profile: { ...profile, role: text(profile.role) || fallback.name, mission: text(profile.mission) || fallback.summary },
    workflow: list(raw.workflow), deliverables: list(raw.deliverables),
    source: object(raw.source), license: object(raw.license),
    dependencies: Array.isArray(raw.dependencies) ? JSON.parse(JSON.stringify(raw.dependencies)).slice(0,64) : [],
    adaptation: object(raw.adaptation), extensions,
    ...(raw.discoveryDetail === undefined ? {} : {discoveryDetail: object(raw.discoveryDetail)}),
  };
}

/** Compose only curated role/workflow text. Provenance and foreign config are not executable instructions. */
export function expertExecutionPrompt(systemPrompt: string, definition: Prisma.JsonValue): string {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition) || definition.schemaVersion !== 1) return systemPrompt;
  const profile = definition.profile && typeof definition.profile === 'object' && !Array.isArray(definition.profile) ? definition.profile : {};
  const lines = (v: Prisma.JsonValue | undefined) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(x => `- ${x}`).join('\n') : '';
  return [systemPrompt, typeof profile.role === 'string' ? `角色定位：${profile.role}` : '', typeof profile.mission === 'string' ? `使命：${profile.mission}` : '', lines(definition.workflow) ? `工作流程：\n${lines(definition.workflow)}` : '', lines(definition.deliverables) ? `交付标准：\n${lines(definition.deliverables)}` : ''].filter(Boolean).join('\n\n');
}
