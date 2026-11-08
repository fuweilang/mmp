import { BadRequestException, Injectable } from '@nestjs/common';

/** toolScope / Host 工具稳定名 */
export const TABULAR_ANALYZE_TOOL = 'tabular_analyze';

const MAX_BYTES = 1_500_000;
const MAX_ROWS = 20_000;
const MAX_COLS = 80;
const MAX_GROUPS = 50;

export type TabularAnalyzeRequest = {
  content: string;
  format?: 'csv' | 'json' | 'auto';
  groupBy?: string;
  metrics?: string[];
  /** 可选分析目标（如「按城市汇总收入」）；未显式 groupBy 时用于确定性推断分组列。 */
  goal?: string;
};

export type TabularColumnProfile = {
  name: string;
  inferredType: 'number' | 'string' | 'boolean' | 'empty' | 'mixed';
  nonNull: number;
  nullish: number;
  sampleValues: string[];
  min?: number;
  max?: number;
  sum?: number;
  mean?: number;
};

export type TabularAnalyzeResult = {
  format: 'csv' | 'json';
  rowCount: number;
  columnCount: number;
  columns: TabularColumnProfile[];
  /** 实际使用的分组列；未分组则为 undefined。 */
  appliedGroupBy?: string;
  groupSummary?: Array<Record<string, string | number | null>>;
  outliers?: Array<{ column: string; rowIndex: number; value: number; reason: string }>;
  warnings: string[];
};


/**
 * 从分析目标/用户问题中确定性解析分组列。
 * 规则：列名原文命中 > 别名命中 > 「按X/各X」抽取后与列名/别名对齐。
 * 不在无命中时静默挑「第一个字符串列」（避免误分组）。
 */
export function resolveGroupByFromGoal(
  goal: string | undefined,
  columns: Array<Pick<TabularColumnProfile, 'name' | 'inferredType'>>,
): string | undefined {
  if (!goal || !goal.trim() || columns.length === 0) return undefined;
  const g = goal.trim();

  const matchDim = (dimRaw: string): string | undefined => {
    let dim = dimRaw.trim();
    if (!dim) return undefined;
    dim = dim.replace(/(合计|汇总|收入|订单|数量|金额|数|额)$/u, '');
    if (!dim) return undefined;
    for (const col of columns) {
      if (col.name === dim) return col.name;
    }
    for (const col of columns) {
      if (dimensionAliases(col.name).some((a) => a === dim)) return col.name;
    }
    for (const col of columns) {
      if (col.name.includes(dim) || dim.includes(col.name)) return col.name;
      if (dimensionAliases(col.name).some((a) => a.includes(dim) || dim.includes(a))) return col.name;
    }
    return undefined;
  };

  // 1) 「按X / 各X」优先（避免英文句里较长指标列名误命中）
  const patterned = g.match(/按\s*([A-Za-z0-9_\u4e00-\u9fff]{1,24})|各\s*([A-Za-z0-9_\u4e00-\u9fff]{1,24})/);
  if (patterned) {
    const hit = matchDim(patterned[1] || patterned[2] || '');
    if (hit) return hit;
  }

  // 2) 中文别名
  for (const col of columns) {
    for (const alias of dimensionAliases(col.name)) {
      if (alias && g.includes(alias)) return col.name;
    }
  }

  // 3) 列名命中：ASCII 用词边界；CJK 用 includes；同分歧时优先 string 列
  const hits: string[] = [];
  for (const col of columns) {
    const name = col.name;
    if (!name) continue;
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
      const re = new RegExp(`(?:^|[^A-Za-z0-9_])${name}(?:[^A-Za-z0-9_]|$)`, 'i');
      if (re.test(g)) hits.push(col.name);
    } else if (g.includes(name)) {
      hits.push(col.name);
    }
  }
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    const stringHit = hits.find((h) => columns.find((c) => c.name === h)?.inferredType === 'string');
    return stringHit ?? hits[0];
  }
  return undefined;
}

function dimensionAliases(columnName: string): string[] {
  const key = columnName.trim().toLowerCase();
  const table: Record<string, string[]> = {
    city: ['城市', '城市名', '市区', '地区'],
    channel: ['渠道', '来源渠道', '投放渠道'],
    sku: ['商品', '货号', '品名'],
    product: ['产品', '商品'],
    region: ['区域', '大区', '省份', '省'],
    category: ['品类', '分类', '类目'],
  };
  return table[key] ?? [];
}

/**
 * 确定性表格分析：解析 CSV/JSON，做列类型、汇总、分组与简单 IQR 异常。
 * 不执行公式、不读磁盘路径；数值由代码计算，不交给模型猜。
 */
@Injectable()
export class OfficialTabularAnalyzeService {
  analyze(input: TabularAnalyzeRequest): TabularAnalyzeResult {
    const raw = typeof input.content === 'string' ? input.content : '';
    if (!raw.trim()) {
      throw new BadRequestException('请粘贴 CSV 或 JSON 表格内容后再分析');
    }
    if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) {
      throw new BadRequestException(`表格过大，请控制在 ${MAX_BYTES} 字节以内`);
    }
    rejectPathLikePayload(raw);

    const format = resolveFormat(raw, input.format);
    const { rows, warnings } = format === 'csv' ? parseCsv(raw) : parseJsonTable(raw);
    if (rows.length === 0) throw new BadRequestException('未解析到任何数据行');
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(`行数超过上限 ${MAX_ROWS}`);
    }

    const columnNames = collectColumns(rows);
    if (columnNames.length > MAX_COLS) {
      throw new BadRequestException(`列数超过上限 ${MAX_COLS}`);
    }

    const columns = columnNames.map((name) => profileColumn(name, rows));
    const outliers = detectOutliers(columns, rows);
    const explicitGroupBy = typeof input.groupBy === 'string' ? input.groupBy.trim() : '';
    const inferredGroupBy = explicitGroupBy
      ? undefined
      : resolveGroupByFromGoal(input.goal, columns);
    const appliedGroupBy = explicitGroupBy || inferredGroupBy || undefined;
    const warn = [...warnings];
    if (!explicitGroupBy && inferredGroupBy) {
      warn.push(`已根据分析目标推断 groupBy=${inferredGroupBy}`);
    }
    if (!appliedGroupBy && input.goal && /各|按.+|分组|合计|汇总/.test(input.goal)) {
      warn.push('分析目标疑似需要分组，但未能匹配到表头列名；请显式传 groupBy');
    }
    const groupSummary = buildGroupSummary(rows, columns, appliedGroupBy, input.metrics);

    return {
      format,
      rowCount: rows.length,
      columnCount: columnNames.length,
      columns,
      ...(appliedGroupBy ? { appliedGroupBy } : {}),
      ...(groupSummary ? { groupSummary } : {}),
      ...(outliers.length ? { outliers: outliers.slice(0, 30) } : {}),
      warnings: warn,
    };
  }
}

function rejectPathLikePayload(raw: string) {
  const first = raw.trim().split(/\r?\n/, 1)[0] ?? '';
  if (
    /^(\/|~|[A-Za-z]:[\\/]|\\\\)/.test(first) ||
    /(^|[\s=])(\.\.\/|\.\.\\)/.test(first)
  ) {
    throw new BadRequestException('只接受内联 CSV/JSON 内容，不接受文件路径');
  }
  // 单元格以 =/+/@/- 开头的“公式”按文本保留，但整体若几乎全是公式则拒绝执行语义
  const lines = raw.split(/\r?\n/).slice(0, 50);
  let formulaish = 0;
  let cells = 0;
  for (const line of lines) {
    for (const cell of line.split(',')) {
      cells += 1;
      if (/^\s*[=+]/.test(cell) && /[A-Z]+\d+/i.test(cell)) formulaish += 1;
    }
  }
  if (cells > 0 && formulaish / cells > 0.3) {
    throw new BadRequestException('检测到疑似电子表格公式内容，已拒绝执行');
  }
}

function resolveFormat(raw: string, format?: 'csv' | 'json' | 'auto'): 'csv' | 'json' {
  if (format === 'csv' || format === 'json') return format;
  const t = raw.trim();
  if (t.startsWith('[') || t.startsWith('{')) return 'json';
  return 'csv';
}

function parseJsonTable(raw: string): { rows: Record<string, string>[]; warnings: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('JSON 无法解析');
  }
  const warnings: string[] = [];
  let list: unknown[];
  if (Array.isArray(parsed)) list = parsed;
  else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { data?: unknown }).data)) {
    list = (parsed as { data: unknown[] }).data;
    warnings.push('使用了对象中的 data 数组');
  } else {
    throw new BadRequestException('JSON 需为对象数组，或包含 data 数组');
  }
  const rows: Record<string, string>[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push('跳过非对象行');
      continue;
    }
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      row[String(k)] = valueToCell(v);
    }
    rows.push(row);
  }
  return { rows, warnings };
}

function parseCsv(raw: string): { rows: Record<string, string>[]; warnings: string[] } {
  const warnings: string[] = [];
  const matrix = parseCsvMatrix(raw);
  if (matrix.length === 0) return { rows: [], warnings };
  const header = matrix[0].map((h, i) => (h.trim() ? h.trim() : `col_${i + 1}`));
  if (new Set(header).size !== header.length) warnings.push('存在重复列名，后列覆盖前列');
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (line.every((c) => c.trim() === '')) continue;
    const row: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      row[header[c]] = line[c] ?? '';
    }
    rows.push(row);
  }
  return { rows, warnings };
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function valueToCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

function collectColumns(rows: Record<string, string>[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        names.push(key);
      }
    }
  }
  return names;
}

function profileColumn(name: string, rows: Record<string, string>[]): TabularColumnProfile {
  const samples: string[] = [];
  let nonNull = 0;
  let nullish = 0;
  const nums: number[] = [];
  let bools = 0;
  let strings = 0;
  for (const row of rows) {
    const raw = row[name];
    if (raw === undefined || raw.trim() === '') {
      nullish += 1;
      continue;
    }
    nonNull += 1;
    if (samples.length < 5) samples.push(raw.slice(0, 80));
    const n = Number(String(raw).replace(/,/g, ''));
    if (String(raw).trim() !== '' && Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(String(raw).trim().replace(/,/g, ''))) {
      nums.push(n);
      continue;
    }
    if (/^(true|false|yes|no|是|否)$/i.test(raw.trim())) {
      bools += 1;
      continue;
    }
    strings += 1;
  }
  let inferredType: TabularColumnProfile['inferredType'] = 'empty';
  if (nonNull === 0) inferredType = 'empty';
  else if (nums.length === nonNull) inferredType = 'number';
  else if (bools === nonNull) inferredType = 'boolean';
  else if (strings === nonNull) inferredType = 'string';
  else if (nums.length > 0 && (bools > 0 || strings > 0)) inferredType = 'mixed';
  else if (nums.length > 0) inferredType = 'mixed';
  else inferredType = 'string';

  const profile: TabularColumnProfile = {
    name,
    inferredType,
    nonNull,
    nullish,
    sampleValues: samples,
  };
  if (nums.length > 0) {
    const sum = nums.reduce((a, b) => a + b, 0);
    profile.min = Math.min(...nums);
    profile.max = Math.max(...nums);
    profile.sum = round4(sum);
    profile.mean = round4(sum / nums.length);
  }
  return profile;
}

function detectOutliers(
  columns: TabularColumnProfile[],
  rows: Record<string, string>[],
): Array<{ column: string; rowIndex: number; value: number; reason: string }> {
  const out: Array<{ column: string; rowIndex: number; value: number; reason: string }> = [];
  for (const col of columns) {
    if (col.inferredType !== 'number') continue;
    const values: Array<{ rowIndex: number; value: number }> = [];
    rows.forEach((row, idx) => {
      const n = Number(String(row[col.name] ?? '').replace(/,/g, ''));
      if (Number.isFinite(n) && String(row[col.name] ?? '').trim() !== '') {
        values.push({ rowIndex: idx, value: n });
      }
    });
    if (values.length < 8) continue;
    const sorted = values.map((v) => v.value).sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    if (iqr <= 0) continue;
    const low = q1 - 1.5 * iqr;
    const high = q3 + 1.5 * iqr;
    for (const item of values) {
      if (item.value < low || item.value > high) {
        out.push({
          column: col.name,
          rowIndex: item.rowIndex,
          value: item.value,
          reason: `IQR 外（${round4(low)} ~ ${round4(high)}）`,
        });
      }
    }
  }
  return out;
}

function buildGroupSummary(
  rows: Record<string, string>[],
  columns: TabularColumnProfile[],
  groupBy?: string,
  metrics?: string[],
): Array<Record<string, string | number | null>> | undefined {
  if (!groupBy || !groupBy.trim()) return undefined;
  const key = groupBy.trim();
  if (!columns.some((c) => c.name === key)) {
    throw new BadRequestException(`分组列不存在：${key}`);
  }
  const metricCols = (metrics?.length ? metrics : columns.filter((c) => c.inferredType === 'number').map((c) => c.name))
    .filter((name) => name !== key)
    .slice(0, 8);
  const groups = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const g = (row[key] ?? '').trim() || '(空)';
    const list = groups.get(g) ?? [];
    list.push(row);
    groups.set(g, list);
  }
  if (groups.size > MAX_GROUPS) {
    throw new BadRequestException(`分组过多（>${MAX_GROUPS}），请换列或先过滤`);
  }
  const summary: Array<Record<string, string | number | null>> = [];
  for (const [g, list] of groups) {
    const row: Record<string, string | number | null> = { [key]: g, __count: list.length };
    for (const m of metricCols) {
      const nums = list
        .map((r) => Number(String(r[m] ?? '').replace(/,/g, '')))
        .filter((n) => Number.isFinite(n));
      row[`${m}__sum`] = nums.length ? round4(nums.reduce((a, b) => a + b, 0)) : null;
      row[`${m}__mean`] = nums.length ? round4(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
    }
    summary.push(row);
  }
  return summary;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  if (next === undefined) return sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
