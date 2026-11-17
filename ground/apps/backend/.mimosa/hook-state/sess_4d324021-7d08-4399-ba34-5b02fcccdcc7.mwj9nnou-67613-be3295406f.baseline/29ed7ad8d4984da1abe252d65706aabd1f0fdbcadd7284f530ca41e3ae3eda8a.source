/** @deprecated Octop 已废弃。保留本模块仅避免计费/统计编译断裂；无 octop.db 时返回空。终端改 DeepSeek Harness。 */
/**
 * 只读 Octop providers（超管 /agent/admin/models 同源）。
 * Admin「token计价配置」上游单价按已启用聊天模型动态渲染；勿用于扣费。
 * preferred_model 与 ActiveModelPool 星标同源（users.preferences_json）。
 */
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { resolveOctopDbPath } from './octop-usage.reader';

export type OctopEnabledChatModel = {
  providerId: number;
  providerName: string;
  providerKind: string;
  modelId: string;
  modelName: string;
};

export type OctopPreferredModel = {
  /** providerName/modelId，与 preferences.preferred_model 一致 */
  ref: string;
  providerName: string;
  modelId: string;
};

const EMBEDDING_NAME_HINTS = ['embed', 'bge-', 'e5-', 'gte-'] as const;
const RERANK_NAME_HINTS = ['rerank'] as const;

function isRerankModel(model: Record<string, unknown>): boolean {
  if (String(model.task || '').trim().toLowerCase() === 'rerank') return true;
  const id = String(model.id || '').trim().toLowerCase();
  return RERANK_NAME_HINTS.some((h) => id.includes(h));
}

function isEmbeddingModel(model: Record<string, unknown>): boolean {
  if (model.embedding === true) return true;
  if (String(model.task || '').trim().toLowerCase() === 'embedding') return true;
  if (isRerankModel(model)) return false;
  const id = String(model.id || '').trim().toLowerCase();
  return Boolean(id && EMBEDDING_NAME_HINTS.some((h) => id.includes(h)));
}

function isChatEligibleModel(model: Record<string, unknown>): boolean {
  if (model.enabled === false) return false;
  if (isEmbeddingModel(model)) return false;
  if (isRerankModel(model)) return false;
  return Boolean(String(model.id || '').trim());
}

function parsePreferredRef(raw: unknown): OctopPreferredModel | null {
  if (typeof raw !== 'string') return null;
  const ref = raw.trim();
  if (!ref || ref.toLowerCase() === 'auto' || !ref.includes('/')) return null;
  const slash = ref.indexOf('/');
  const providerName = ref.slice(0, slash).trim();
  const modelId = ref.slice(slash + 1).trim();
  if (!providerName || !modelId) return null;
  return { ref: `${providerName}/${modelId}`, providerName, modelId };
}


const SETTINGS_KEY_MODEL_POOL_ORDER = 'model_pool_order';

function normalizeModelPoolOrder(refs: unknown): string[] {
  if (!Array.isArray(refs)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of refs) {
    if (typeof raw !== 'string') continue;
    const ref = raw.trim();
    if (!ref || !ref.includes('/') || seen.has(ref)) continue;
    const slash = ref.indexOf('/');
    const provider = ref.slice(0, slash).trim();
    const model = ref.slice(slash + 1).trim();
    if (!provider || !model) continue;
    const normalized = `${provider}/${model}`;
    if (seen.has(normalized)) continue;
    out.push(normalized);
    seen.add(normalized);
  }
  return out;
}

function parseModelPoolOrder(raw: string | null | undefined): string[] {
  if (!raw || !String(raw).trim()) return [];
  try {
    return normalizeModelPoolOrder(JSON.parse(String(raw)));
  } catch {
    return [];
  }
}

/** Sort usable chat models by platform model_pool_order; leftovers keep relative order. */
export function applyModelPoolOrder(
  models: OctopEnabledChatModel[],
  order: string[],
): OctopEnabledChatModel[] {
  const keyOf = (m: OctopEnabledChatModel) => `${m.providerName}/${m.modelId}`;
  const byKey = new Map<string, OctopEnabledChatModel>();
  for (const m of models) {
    const k = keyOf(m);
    if (k && !byKey.has(k)) byKey.set(k, m);
  }
  const seen = new Set<string>();
  const out: OctopEnabledChatModel[] = [];
  for (const ref of order) {
    const item = byKey.get(ref);
    if (!item || seen.has(ref)) continue;
    out.push(item);
    seen.add(ref);
  }
  for (const m of models) {
    const k = keyOf(m);
    if (!k || seen.has(k)) continue;
    out.push(m);
    seen.add(k);
  }
  return out;
}

function preferredFromPreferencesJson(raw: string | null | undefined): OctopPreferredModel | null {
  if (!raw || !String(raw).trim()) return null;
  try {
    const data = JSON.parse(String(raw)) as Record<string, unknown>;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return parsePreferredRef(data.preferred_model);
  } catch {
    return null;
  }
}

function isPlatformAdminPreferences(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const data = JSON.parse(String(raw)) as Record<string, unknown>;
    const rbac = data?.mammoth_rbac;
    if (!rbac || typeof rbac !== 'object' || Array.isArray(rbac)) return false;
    const role = String((rbac as { platform_role?: unknown }).platform_role || '')
      .trim()
      .toLowerCase();
    if (role === 'super_admin' || role === 'platform_admin') return true;
    return Boolean((rbac as { is_platform_admin?: unknown }).is_platform_admin);
  } catch {
    return false;
  }
}

/**
 * 读取 ActiveModelPool 星标 preferred_model。
 * 优先平台超管用户；否则取任意已设置星标的用户。
 */
export function readPreferredModel(dbPath?: string): {
  dbPath: string;
  preferred: OctopPreferredModel | null;
  error?: string;
} {
  const resolved = dbPath || resolveOctopDbPath();
  if (!existsSync(resolved)) {
    return {
      dbPath: resolved,
      preferred: null,
      error: `找不到 Octop 数据库: ${resolved}`,
    };
  }

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(resolved, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT id, preferences_json
         FROM users
         WHERE preferences_json IS NOT NULL
           AND preferences_json LIKE '%preferred_model%'
         ORDER BY id ASC`,
      )
      .all() as Array<{ id: number | bigint; preferences_json: string | null }>;

    let fallback: OctopPreferredModel | null = null;
    for (const row of rows) {
      const preferred = preferredFromPreferencesJson(row.preferences_json);
      if (!preferred) continue;
      if (isPlatformAdminPreferences(row.preferences_json)) {
        return { dbPath: resolved, preferred };
      }
      if (!fallback) fallback = preferred;
    }
    return { dbPath: resolved, preferred: fallback };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { dbPath: resolved, preferred: null, error: message };
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * 与 Octop `list_resolved_models` 对齐：provider.enabled + 有 api_key + 聊天可用模型。
 * 读不到 DB 时返回空列表（前端提示手填/无模型）。
 */
export function listEnabledChatModels(): {
  dbPath: string;
  models: OctopEnabledChatModel[];
  /** provider/model refs from settings.model_pool_order (may be empty) */
  modelPoolOrder: string[];
  preferred: OctopPreferredModel | null;
  error?: string;
} {
  const dbPath = resolveOctopDbPath();
  if (!existsSync(dbPath)) {
    return {
      dbPath,
      models: [],
      modelPoolOrder: [],
      preferred: null,
      error: `找不到 Octop 数据库: ${dbPath}（请确认 OCTOP_HOME 或本地已配置 /agent/admin/models）`,
    };
  }

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT id, name, kind, api_key, models_json, enabled
         FROM providers
         WHERE enabled = 1
         ORDER BY name`,
      )
      .all() as Array<{
      id: number | bigint;
      name: string;
      kind: string;
      api_key: string | null;
      models_json: string | null;
      enabled: number | bigint;
    }>;

    const models: OctopEnabledChatModel[] = [];
    for (const row of rows) {
      const apiKey = String(row.api_key || '').trim();
      if (!apiKey) continue;
      let parsed: unknown = [];
      try {
        parsed = row.models_json ? JSON.parse(row.models_json) : [];
      } catch {
        parsed = [];
      }
      if (!Array.isArray(parsed)) continue;
      const providerName = String(row.name || '');
      const providerId = Number(row.id);
      const providerKind = String(row.kind || '');
      for (const raw of parsed) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const m = raw as Record<string, unknown>;
        if (!isChatEligibleModel(m)) continue;
        const modelId = String(m.id || '').trim();
        if (!modelId) continue;
        models.push({
          providerId,
          providerName,
          providerKind,
          modelId,
          modelName: String(m.name || modelId).trim() || modelId,
        });
      }
    }

    let modelPoolOrder: string[] = [];
    try {
      const orderRow = db
        .prepare(`SELECT value FROM settings WHERE key = ?`)
        .get(SETTINGS_KEY_MODEL_POOL_ORDER) as { value?: string | null } | undefined;
      modelPoolOrder = parseModelPoolOrder(orderRow?.value ?? null);
    } catch {
      modelPoolOrder = [];
    }
    const orderedModels = applyModelPoolOrder(models, modelPoolOrder);

    let preferred: OctopPreferredModel | null = null;
    try {
      const prefRows = db
        .prepare(
          `SELECT preferences_json
           FROM users
           WHERE preferences_json IS NOT NULL
             AND preferences_json LIKE '%preferred_model%'
           ORDER BY id ASC`,
        )
        .all() as Array<{ preferences_json: string | null }>;
      let fallback: OctopPreferredModel | null = null;
      for (const row of prefRows) {
        const p = preferredFromPreferencesJson(row.preferences_json);
        if (!p) continue;
        if (isPlatformAdminPreferences(row.preferences_json)) {
          preferred = p;
          fallback = p;
          break;
        }
        if (!fallback) fallback = p;
      }
      if (!preferred) preferred = fallback;
    } catch {
      preferred = null;
    }

    return { dbPath, models: orderedModels, modelPoolOrder, preferred };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { dbPath, models: [], modelPoolOrder: [], preferred: null, error: message };
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}
