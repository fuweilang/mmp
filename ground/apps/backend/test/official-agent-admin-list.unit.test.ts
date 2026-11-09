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
          OR?: Array<Record<string, { contains: string; mode?: string }>>;
        };
        orderBy?: Array<Record<string, 'asc' | 'desc'>> | Record<string, 'asc' | 'desc'>;
      }) => {
        let rows = [...agents];
        const status = args.where?.status;
        if (status) rows = rows.filter((row) => row.status === status);
        const or = args.where?.OR;
        if (or?.length) {
          const keyword = Object.values(or[0])[0]?.contains?.toLowerCase() ?? '';
          rows = rows.filter((row) =>
            [row.id, row.key, row.name, row.summary].some((value) =>
              value.toLowerCase().includes(keyword),
            ),
          );
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
          kind: 'GENERAL',
          category: null,
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
          OR?: Array<Record<string, { contains: string; mode?: string }>>;
        };
      }) => {
        let rows = [...agents];
        const or = args.where?.OR;
        if (or?.length) {
          const keyword = Object.values(or[0])[0]?.contains?.toLowerCase() ?? '';
          rows = rows.filter((row) =>
            [row.id, row.key, row.name, row.summary].some((value) =>
              value.toLowerCase().includes(keyword),
            ),
          );
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

    const byId = await service.list(actor, { keyword: 'expert-01526387' });
    assert.equal(byId.items.length, 1);
    assert.equal(byId.items[0]?.id, 'expert-01526387-d75');
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
