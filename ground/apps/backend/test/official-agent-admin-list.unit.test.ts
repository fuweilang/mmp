import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OfficialAgentStatus, User } from '@prisma/client';
import { AdminOfficialAgentsService } from '../src/admin/admin-official-agents.service';

const actor = { id: 'admin-list-1' } as User;

type AgentSeed = {
  id: string;
  key: string;
  name: string;
  summary: string;
  status: OfficialAgentStatus;
  kind?: 'GENERAL' | 'KNOWLEDGE';
  category?: string | null;
  createdAt: Date;
};

function createListService(agents: AgentSeed[]) {
  const prisma = {
    user: {
      findMany: async () => [],
    },
    officialAgent: {
      findMany: async (args: {
        where?: {
          status?: OfficialAgentStatus;
          kind?: 'GENERAL' | 'KNOWLEDGE';
          category?: string;
          OR?: Array<Record<string, { contains?: string; equals?: string; mode?: string }>>;
        };
        orderBy?: Array<Record<string, 'asc' | 'desc'>> | Record<string, 'asc' | 'desc'>;
      }) => {
        let rows = [...agents];
        const status = args.where?.status;
        if (status) rows = rows.filter((row) => row.status === status);
        const kind = args.where?.kind;
        if (kind) rows = rows.filter((row) => (row.kind ?? 'GENERAL') === kind);
        const category = args.where?.category;
        if (category) rows = rows.filter((row) => row.category === category);
        const or = args.where?.OR;
        if (or?.length) {
          rows = rows.filter((row) => or.some(clause => Object.entries(clause).some(([field, condition]) => {
            const source = String(row[field as keyof AgentSeed]);
            const value = condition.mode === 'insensitive' ? source.toLowerCase() : source;
            if (condition.equals !== undefined) return value === (condition.mode === 'insensitive' ? condition.equals.toLowerCase() : condition.equals);
            return condition.contains !== undefined && value.includes(condition.mode === 'insensitive' ? condition.contains.toLowerCase() : condition.contains);
          })));
        }
        const orderBy = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy ?? {}];
        rows.sort((left, right) => {
          for (const rule of orderBy) {
            const [[field, direction]] = Object.entries(rule ?? {});
            if (!field) continue;
            const lv = left[field as keyof AgentSeed];
            const rv = right[field as keyof AgentSeed];
            if (lv === rv) continue;
            if (lv instanceof Date && rv instanceof Date) {
              return direction === 'desc'
                ? rv.getTime() - lv.getTime()
                : lv.getTime() - rv.getTime();
            }
            const cmp = String(lv).localeCompare(String(rv));
            return direction === 'desc' ? -cmp : cmp;
          }
          return 0;
        });
        return rows.map((row) => ({
          ...row,
          kind: row.kind ?? 'GENERAL',
          category: row.category ?? null,
          capabilities: [],
          openingQuestions: [],
          systemPrompt: 'prompt',
          toolScope: [],
          expertDefinition: {},
          onlineVersionId: null,
          onlineVersion: null,
          versions: [],
          grants: [],
          skillLinks: [],
          updatedAt: row.createdAt,
        }));
      },
      groupBy: async (args: {
        where?: {
          kind?: 'GENERAL' | 'KNOWLEDGE';
          category?: string;
          OR?: Array<Record<string, { contains?: string; equals?: string; mode?: string }>>;
        };
      }) => {
        let rows = [...agents];
        const kind = args.where?.kind;
        if (kind) rows = rows.filter((row) => (row.kind ?? 'GENERAL') === kind);
        const category = args.where?.category;
        if (category) rows = rows.filter((row) => row.category === category);
        const or = args.where?.OR;
        if (or?.length) {
          rows = rows.filter((row) => or.some(clause => Object.entries(clause).some(([field, condition]) => {
            const source = String(row[field as keyof AgentSeed]);
            const value = condition.mode === 'insensitive' ? source.toLowerCase() : source;
            if (condition.equals !== undefined) return value === (condition.mode === 'insensitive' ? condition.equals.toLowerCase() : condition.equals);
            return condition.contains !== undefined && value.includes(condition.mode === 'insensitive' ? condition.contains.toLowerCase() : condition.contains);
          })));
        }
        const counts = new Map<OfficialAgentStatus, number>();
        for (const row of rows) {
          counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
        }
        return [...counts.entries()].map(([status, count]) => ({
          status,
          _count: { _all: count },
        }));
      },
    },
  };

  return new AdminOfficialAgentsService(
    prisma as never,
    { adminScope: async () => null } as never,
    { loadAssetFiles: () => [], syncFromAssets: async () => [] } as never,
    { setAgentSkillLinks: async () => undefined } as never,
  );
}

const seed: AgentSeed[] = [
  {
    id: 'agent-old',
    key: 'old-expert',
    name: '旧专家',
    summary: '较早创建',
    status: OfficialAgentStatus.PUBLISHED,
    createdAt: new Date('2026-11-01T08:00:00Z'),
  },
  {
    id: 'agent-mid',
    key: 'mid-expert',
    name: '中专家',
    summary: '中间创建',
    status: OfficialAgentStatus.OFFLINE,
    createdAt: new Date('2026-11-05T08:00:00Z'),
  },
  {
    id: 'expert-01526387-d75',
    key: 'expert-01526387-d75',
    name: 'a专家',
    summary: '新建草稿',
    status: OfficialAgentStatus.DRAFT,
    createdAt: new Date('2026-11-09T08:00:00Z'),
  },
  {
    id: 'agent-same-time-b',
    key: 'same-b',
    name: '同秒B',
    summary: '同时间稳定排序',
    status: OfficialAgentStatus.DRAFT,
    createdAt: new Date('2026-11-09T08:00:00Z'),
  },
];

describe('admin official agent list ordering and filters', () => {
  it('defaults to createdAt desc with stable id tie-break so newest draft leads', async () => {
    const service = createListService(seed);
    const result = await service.list(actor, {});
    assert.deepEqual(
      result.items.map((row) => row.id),
      ['expert-01526387-d75', 'agent-same-time-b', 'agent-mid', 'agent-old'],
    );
    assert.equal(result.items[0]?.draft.name, 'a专家');
    assert.equal(result.items[0]?.status, 'DRAFT');
  });

  it('returns full-universe statusCounts independent of status tab filter', async () => {
    const service = createListService(seed);
    const filtered = await service.list(actor, { status: 'DRAFT' });
    assert.deepEqual(
      filtered.items.map((row) => row.id),
      ['expert-01526387-d75', 'agent-same-time-b'],
    );
    assert.deepEqual(filtered.statusCounts, {
      all: 4,
      DRAFT: 2,
      PUBLISHED: 1,
      OFFLINE: 1,
    });
  });

  it('supports name and id keyword search while keeping counts keyword-scoped', async () => {
    const service = createListService(seed);
    const byName = await service.list(actor, { keyword: 'a专家' });
    assert.deepEqual(
      byName.items.map((row) => row.id),
      ['expert-01526387-d75'],
    );
    assert.deepEqual(byName.statusCounts, {
      all: 1,
      DRAFT: 1,
      PUBLISHED: 0,
      OFFLINE: 0,
    });

    const byId = await service.list(actor, { keyword: 'EXPERT-01526387-D75' });
    assert.equal(byId.items.length, 1);
    assert.equal(byId.items[0]?.id, 'expert-01526387-d75');
  });

  it('filters by kind and keeps status counts inside that kind', async () => {
    const service = createListService(seed.map((row) => row.id === 'agent-old' ? { ...row, kind: 'KNOWLEDGE' as const } : row));
    const knowledge = await service.list(actor, { kind: 'KNOWLEDGE' });
    assert.deepEqual(knowledge.items.map((row) => row.id), ['agent-old']);
    assert.equal(knowledge.items[0]?.kind, 'KNOWLEDGE');
    assert.deepEqual(knowledge.statusCounts, { all: 1, DRAFT: 0, PUBLISHED: 1, OFFLINE: 0 });
    const drafts = await service.list(actor, { kind: 'GENERAL', status: 'DRAFT' });
    assert.deepEqual(drafts.items.map((row) => row.id), ['expert-01526387-d75', 'agent-same-time-b']);
    assert.deepEqual(drafts.statusCounts, { all: 3, DRAFT: 2, PUBLISHED: 0, OFFLINE: 1 });
  });

  it('filters by category and keeps status counts inside that category', async () => {
    const service = createListService(seed.map((row) => ({
      ...row,
      category: row.id === 'agent-old' ? 'content' : 'sales',
    })));
    const content = await service.list(actor, { category: 'content' });
    assert.deepEqual(content.items.map((row) => row.id), ['agent-old']);
    assert.deepEqual(content.statusCounts, { all: 1, DRAFT: 0, PUBLISHED: 1, OFFLINE: 0 });
    assert.equal(content.items[0]?.status, 'PUBLISHED');

    const sales = await service.list(actor, { category: 'sales' });
    assert.ok(sales.items.length > 0);
    assert.ok(sales.items.every((row) => row.category === 'sales'));
    assert.equal(sales.statusCounts.all, seed.length - 1);
  });

  it('keeps non-draft newest agents first under createdAt desc', async () => {
    const service = createListService([
      {
        id: 'published-new',
        key: 'published-new',
        name: '新发布',
        summary: '刚发布',
        status: OfficialAgentStatus.PUBLISHED,
        createdAt: new Date('2026-11-09T10:00:00Z'),
      },
      ...seed,
    ]);
    const result = await service.list(actor, {});
    assert.equal(result.items[0]?.id, 'published-new');
    assert.equal(result.items[0]?.status, 'PUBLISHED');
    assert.equal(result.statusCounts.PUBLISHED, 2);
  });
});

it('does not match hidden introductions or partial identifiers and keeps counts consistent', async () => {
  const service = createListService(seed.map(row => ({ ...row, summary: '咱们一起想办法' })));
  for (const keyword of ['们', '01526387']) {
    const result = await service.list(actor, { keyword });
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.statusCounts, { all: 0, DRAFT: 0, PUBLISHED: 0, OFFLINE: 0 });
  }
  assert.equal((await service.list(actor, { keyword: ' A专家 ' })).items[0]?.draft.name, 'a专家');
  assert.equal((await service.list(actor, { keyword: 'old-expert' })).items[0]?.id, 'agent-old');
  assert.equal((await service.list(actor, { keyword: '   ' })).statusCounts.all, seed.length);
});
