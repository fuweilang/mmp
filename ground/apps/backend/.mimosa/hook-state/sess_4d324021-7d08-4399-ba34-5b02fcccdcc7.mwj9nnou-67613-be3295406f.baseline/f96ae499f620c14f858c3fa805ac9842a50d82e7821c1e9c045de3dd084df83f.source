/** @deprecated Octop 已废弃。保留本模块仅避免计费/统计编译断裂；无 octop.db 时返回空。终端改 DeepSeek Harness。 */
/**
 * 只读 Octop usage_log（物理用量）。路径：OCTOP_HOME/octop.db 或 ~/.octop/octop.db。
 * Admin「企业 Token 统计」专用；勿用于扣费。
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type OctopUsageAggRow = {
  octopUserId: number;
  ssoSubject: string | null;
  username: string;
  enterpriseName: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turns: number;
  modelCalls: number;
};

export type OctopUsageReaderResult = {
  dbPath: string;
  rangeStart: number;
  rangeEnd: number;
  model: string | null;
  rows: OctopUsageAggRow[];
  models: string[];
};

export function resolveOctopDbPath(): string {
  const home = (process.env.OCTOP_HOME || '').trim() || join(homedir(), '.octop');
  const explicit = (process.env.OCTOP_SQLITE_PATH || '').trim();
  if (explicit) return explicit;
  return join(home, 'octop.db');
}

/** Asia/Shanghai 自然日 → [start, end) unix 秒；缺省则不限。 */
export function shanghaiDayRangeUnix(fromDay?: string, toDay?: string): {
  start: number;
  end: number;
} {
  const tz = 'Asia/Shanghai';
  const now = Math.floor(Date.now() / 1000) + 1;
  if (!fromDay && !toDay) return { start: 0, end: now };

  const dayStart = (ymd: string) => {
    // 用固定偏移构造：上海无夏令时，UTC+8
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (!m) throw new Error(`无效日期: ${ymd}`);
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return Math.floor(Date.UTC(y, mo - 1, d, 0, 0, 0) / 1000) - 8 * 3600;
  };

  const start = fromDay ? dayStart(fromDay) : 0;
  let end = now;
  if (toDay) {
    end = dayStart(toDay) + 24 * 3600;
  }
  if (end <= start) throw new Error('结束日期必须不早于开始日期');
  void tz;
  return { start, end };
}

export function readOctopUsageAggregated(query: {
  fromDay?: string;
  toDay?: string;
  model?: string;
}): OctopUsageReaderResult {
  const dbPath = resolveOctopDbPath();
  if (!existsSync(dbPath)) {
    throw new Error(`找不到 Octop 数据库: ${dbPath}（请确认 OCTOP_HOME 或本地已跑过 Octop）`);
  }

  const { start, end } = shanghaiDayRangeUnix(query.fromDay, query.toDay);
  const model = (query.model || '').trim() || null;

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const where: string[] = ['l.ts >= ?', 'l.ts < ?'];
    const params: Array<number | string> = [start, end];
    if (model) {
      where.push('l.model = ?');
      params.push(model);
    }
    const whereSql = where.join(' AND ');

    const agg = db
      .prepare(
        `
        SELECT
          u.id AS octop_user_id,
          u.sso_subject AS sso_subject,
          COALESCE(NULLIF(u.username, ''), '(unknown)') AS username,
          NULLIF(TRIM(COALESCE(u.enterprise_name, '')), '') AS enterprise_name,
          COALESCE(NULLIF(l.model, ''), '(unknown)') AS model,
          COALESCE(SUM(l.input_tokens), 0) AS input_tokens,
          COALESCE(SUM(l.output_tokens), 0) AS output_tokens,
          COALESCE(SUM(l.total_tokens), 0) AS total_tokens,
          COUNT(*) AS turns,
          COALESCE(SUM(l.model_calls), 0) AS model_calls
        FROM usage_log l
        JOIN users u ON u.id = l.user_id
        WHERE ${whereSql}
        GROUP BY u.id, u.sso_subject, u.username, u.enterprise_name, COALESCE(NULLIF(l.model, ''), '(unknown)')
        `,
      )
      .all(...params) as Array<Record<string, unknown>>;

    const modelRows = db
      .prepare(
        `
        SELECT DISTINCT COALESCE(NULLIF(model, ''), '(unknown)') AS model
        FROM usage_log
        WHERE ts >= ? AND ts < ?
        ORDER BY model ASC
        LIMIT 200
        `,
      )
      .all(start, end) as Array<{ model: string }>;

    const rows: OctopUsageAggRow[] = agg.map((r) => ({
      octopUserId: Number(r.octop_user_id),
      ssoSubject: r.sso_subject == null || r.sso_subject === '' ? null : String(r.sso_subject),
      username: String(r.username || ''),
      enterpriseName: r.enterprise_name == null ? null : String(r.enterprise_name),
      model: String(r.model || '(unknown)'),
      inputTokens: Number(r.input_tokens || 0),
      outputTokens: Number(r.output_tokens || 0),
      totalTokens: Number(r.total_tokens || 0),
      turns: Number(r.turns || 0),
      modelCalls: Number(r.model_calls || 0),
    }));

    return {
      dbPath,
      rangeStart: start,
      rangeEnd: end,
      model,
      rows,
      models: modelRows.map((m) => String(m.model)),
    };
  } finally {
    db.close();
  }
}
