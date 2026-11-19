import { OfficialAgentCategory, Prisma } from '@prisma/client';

/** Stable gallery category keys (i18n on clients). */
export const OFFICIAL_AGENT_CATEGORIES = [
  'common',
  'productivity',
  'content',
  'sales',
  'expertise',
  'analytics',
] as const satisfies readonly OfficialAgentCategory[];

export type OfficialAgentCategoryKey = string;

/** Tool → Chinese capability label. Derived at read time from frozen toolScope. */
export const TOOL_CAPABILITY_LABELS: Record<string, string> = {
  enterprise_knowledge: '企业资料',
  web_search: '联网检索',
  web_fetch: '网页阅读',
  tabular_analyze: '表格分析',
  delegate_official_agent: '团队协作',
  delegate: '团队协作',
};

const TOOL_ORDER = [
  'enterprise_knowledge',
  'web_search',
  'web_fetch',
  'tabular_analyze',
  'delegate_official_agent',
  'delegate',
] as const;

/**
 * Max capability labels returned to clients. Cards truncate to 3; detail views show the rest.
 * Stored content labels come first so an Admin-entered tag is never hidden by tool labels.
 */
export const MAX_PUBLIC_CAPABILITIES = 8;

export function isOfficialAgentCategory(value: unknown): value is OfficialAgentCategoryKey {
  return typeof value === 'string' && ((OFFICIAL_AGENT_CATEGORIES as readonly string[]).includes(value) || /^cat-[a-f0-9-]{36}$/.test(value));
}

export function stringList(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Merge stored content capabilities first, then tool-derived labels.
 * Never invent tools that are not declared on the frozen version.
 */
export function buildPublicCapabilities(
  toolScope: Prisma.JsonValue | string[] | null | undefined,
  storedCapabilities: Prisma.JsonValue | string[] | null | undefined,
  limit = MAX_PUBLIC_CAPABILITIES,
): string[] {
  const tools = stringList(
    (Array.isArray(toolScope) ? toolScope : (toolScope ?? [])) as Prisma.JsonValue,
  );
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (label: string) => {
    const text = label.trim();
    if (!text || seen.has(text) || out.length >= limit) return;
    seen.add(text);
    out.push(text);
  };
  for (const label of stringList(
    Array.isArray(storedCapabilities)
      ? (storedCapabilities as unknown as Prisma.JsonValue)
      : (storedCapabilities as Prisma.JsonValue),
  )) {
    push(label);
  }
  // Unknown tools stay out of public chips (do not invent marketing labels).
  for (const tool of TOOL_ORDER) {
    if (tools.includes(tool)) push(TOOL_CAPABILITY_LABELS[tool] ?? tool);
  }
  return out;
}

export function normalizeCapabilities(values: string[] | undefined): string[] {
  if (!values) return [];
  return [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ].slice(0, 8);
}
