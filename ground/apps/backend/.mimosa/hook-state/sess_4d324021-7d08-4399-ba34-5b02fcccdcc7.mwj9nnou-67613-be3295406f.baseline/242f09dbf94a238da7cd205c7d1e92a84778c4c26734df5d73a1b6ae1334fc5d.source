import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Public plaza discovery; starters are full prompt texts only (no short labels). */
export interface DiscoveryDetail {
  schemaVersion: 1;
  displayRevision: number;
  introduction: string;
  outputs: string[];
  materials: string[];
  boundaries: string[];
  /** Recommended questions: full prompt body only. */
  starters: Array<{ text: string }>;
}

const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function starterText(value: unknown, max = 500): string {
  if (typeof value === 'string') return value.trim().slice(0, max);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    // Prefer full body; legacy short label alone is not enough.
    if (typeof row.text === 'string' && row.text.trim()) return row.text.trim().slice(0, max);
  }
  return '';
}

function starterList(value: unknown): Array<{ text: string }> {
  if (!Array.isArray(value)) return [];
  const out: Array<{ text: string }> = [];
  for (const item of value) {
    const text = starterText(item);
    if (!text) continue;
    out.push({ text });
    if (out.length >= 4) break;
  }
  return out;
}

/** Explicit public allowlist. Never pass through role, tools, source or arbitrary metadata. */
export function publicDiscoveryDetail(value: unknown): DiscoveryDetail {
  const raw = record(value);
  const text = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const list = (v: unknown) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === 'string')
          .map((x) => text(x, 300))
          .filter(Boolean)
          .slice(0, 5)
      : [];
  return {
    schemaVersion: 1,
    displayRevision:
      Number.isSafeInteger(raw.displayRevision) && Number(raw.displayRevision) >= 0
        ? Number(raw.displayRevision)
        : 0,
    introduction: text(raw.introduction, 2000),
    outputs: list(raw.outputs),
    materials: list(raw.materials),
    boundaries: list(raw.boundaries),
    starters: starterList(raw.starters),
  };
}

export function expertDiscoveryDetail(
  definition: unknown,
  legacyStarters: unknown = [],
): DiscoveryDetail {
  const raw = record(record(definition).discoveryDetail);
  const detail = publicDiscoveryDetail(raw);
  // Existing openingQuestions are a public version field. Explicit [] clears the fallback.
  if (!Object.prototype.hasOwnProperty.call(raw, 'starters') && Array.isArray(legacyStarters)) {
    detail.starters = legacyStarters
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 4)
      .map((text) => ({ text: text.slice(0, 500) }));
  }
  return detail;
}

/** The caller supplies the previous revision; never trust a client-supplied increment. */
export function normalizeDiscoveryDetail(
  value: unknown,
  previous: unknown = {},
): Prisma.InputJsonObject {
  const raw = record(value);
  if (raw !== value || Buffer.byteLength(JSON.stringify(raw), 'utf8') > 16000) {
    throw new BadRequestException('公开详情需为不超过16KB的对象');
  }
  const allowed = new Set([
    'schemaVersion',
    'displayRevision',
    'introduction',
    'outputs',
    'materials',
    'boundaries',
    'starters',
  ]);
  if (Object.keys(raw).some((key) => !allowed.has(key))) {
    throw new BadRequestException('公开详情含未允许字段');
  }
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1) {
    throw new BadRequestException('公开详情schemaVersion必须为1');
  }
  const result = publicDiscoveryDetail(raw);
  if (
    raw.introduction !== undefined &&
    (typeof raw.introduction !== 'string' || raw.introduction.length > 2000)
  ) {
    throw new BadRequestException('详细介绍最多2000字');
  }
  for (const key of ['outputs', 'materials', 'boundaries'] as const) {
    const v = raw[key];
    if (
      v !== undefined &&
      (!Array.isArray(v) ||
        v.length > 5 ||
        v.some((x) => typeof x !== 'string' || x.length > 300))
    ) {
      throw new BadRequestException('详情列表最多5项，每项300字');
    }
  }
  if (raw.starters !== undefined) {
    if (!Array.isArray(raw.starters) || raw.starters.length > 4) {
      throw new BadRequestException('推荐提问最多4条，每条500字');
    }
    for (const item of raw.starters) {
      if (typeof item === 'string') {
        if (!item.trim() || item.length > 500) {
          throw new BadRequestException('推荐提问最多4条，每条500字');
        }
        continue;
      }
      const r = record(item);
      const text = starterText(r);
      // Reject legacy-only label payloads without body.
      if (!text || text.length > 500) {
        throw new BadRequestException('推荐提问需填写完整正文，每条最多500字');
      }
      // Disallow unknown keys except legacy label (ignored).
      if (Object.keys(r).some((k) => k !== 'label' && k !== 'text')) {
        throw new BadRequestException('推荐提问格式无效');
      }
    }
  }
  const old = publicDiscoveryDetail(previous);
  if (raw.displayRevision !== undefined && raw.displayRevision !== old.displayRevision) {
    throw new ConflictException('公开详情已被更新，请重新打开后保存');
  }
  const content = (d: DiscoveryDetail) => JSON.stringify({ ...d, displayRevision: 0 });
  result.displayRevision =
    content(result) === content(old) ? old.displayRevision : old.displayRevision + 1;
  return { ...result, starters: result.starters.map((v) => ({ text: v.text })) };
}
