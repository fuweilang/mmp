import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OfficialAgentGrantStatus, OfficialAgentStatus, User } from '@prisma/client';
import { AdminOfficialAgentsService } from '../src/admin/admin-official-agents.service';
import { loadOfficialAgentAssets } from '../src/official-agent/official-agent-assets';
import { resolveOfficialAvatar } from '../src/official-agent/gallery-avatars';

const actor = { id: 'admin-avatar-1' } as User;

function createListHarness(agents: Array<Record<string, unknown>>) {
  const prisma = {
    officialAgent: {
      findMany: async () =>
        agents.map((agent) => ({
          ...agent,
          onlineVersion: null,
          versions: [],
          grants: [],
        })),
    },
  };
  const service = new AdminOfficialAgentsService(
    prisma as never,
    { adminScope: async () => null } as never,
    {
      loadAssetFiles: () => [],
      syncFromAssets: async () => [],
    } as never,
  );
  return service;
}

describe('admin official agent avatar presentation', () => {
  it('list returns public avatarUrl for disk-backed portraits and null for missing ones', async () => {
    const assets = loadOfficialAgentAssets();
    const growth = assets.find((row) => row.key === 'growth');
    const mammoth = assets.find((row) => row.key === 'mammoth');
    const niche = assets.find((row) => row.key === 'niche');
    assert.ok(growth);
    assert.ok(mammoth);
    assert.ok(niche);
    assert.equal(resolveOfficialAvatar('growth', growth.avatar ?? null)?.fileName, 'growth.jpg');
    assert.equal(resolveOfficialAvatar('mammoth', mammoth.avatar ?? null), null);
    assert.equal(resolveOfficialAvatar('niche', niche.avatar ?? null)?.fileName, 'data.jpg');

    const service = createListHarness([
      {
        id: 'a-growth',
        key: 'growth',
        kind: 'GENERAL',
        category: 'content',
        capabilities: ['内容创作'],
        status: OfficialAgentStatus.PUBLISHED,
        name: '增长顾问',
        summary: 's',
        openingQuestions: [],
        systemPrompt: 'p',
        toolScope: [],
        onlineVersionId: null,
        createdAt: new Date('2026-11-06T08:00:00Z'),
        updatedAt: new Date('2026-11-06T08:00:00Z'),
      },
      {
        id: 'a-mammoth',
        key: 'mammoth',
        kind: 'GENERAL',
        category: 'common',
        capabilities: [],
        status: OfficialAgentStatus.PUBLISHED,
        name: '猛犸 AI',
        summary: 's',
        openingQuestions: [],
        systemPrompt: 'p',
        toolScope: ['web_search'],
        onlineVersionId: null,
        createdAt: new Date('2026-11-06T08:00:00Z'),
        updatedAt: new Date('2026-11-06T08:00:00Z'),
      },
      {
        id: 'a-niche',
        key: 'niche',
        kind: 'GENERAL',
        category: 'analytics',
        capabilities: [],
        status: OfficialAgentStatus.DRAFT,
        name: '细分专家',
        summary: 's',
        openingQuestions: [],
        systemPrompt: 'p',
        toolScope: [],
        onlineVersionId: null,
        createdAt: new Date('2026-11-06T08:00:00Z'),
        updatedAt: new Date('2026-11-06T08:00:00Z'),
      },
    ]);

    const rows = await service.list(actor, {});
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

    assert.match(String(byKey.growth?.avatarUrl), /\/api\/official-agents\/avatars\/growth\.jpg$/);
    assert.equal(byKey.mammoth?.avatarUrl, null);
    assert.match(String(byKey.niche?.avatarUrl), /\/api\/official-agents\/avatars\/data\.jpg$/);
    assert.equal(byKey.growth?.category, 'content');
    assert.deepEqual(byKey.growth?.capabilities, ['内容创作']);
    // Admin list stays JWT-scoped via adminScope; avatar URL itself is public branding.
    assert.equal(byKey.growth?.draft.name, '增长顾问');
    assert.ok(!('status' in (byKey.growth?.draft ?? {})));
  });

  it('detail returns the same avatarUrl and draft/version envelopes as list', async () => {
    const agent = {
      id: 'a-copy',
      key: 'copy',
      kind: 'GENERAL',
      category: 'content',
      capabilities: ['表达优化'],
      status: OfficialAgentStatus.PUBLISHED,
      name: '文案润色',
      summary: '简介',
      openingQuestions: ['帮我润色'],
      systemPrompt: '保留事实',
      toolScope: [],
      onlineVersionId: 'v1',
      createdAt: new Date('2026-11-06T08:00:00Z'),
      updatedAt: new Date('2026-11-06T09:00:00Z'),
    };
    const version = {
      id: 'v1',
      agentId: 'a-copy',
      version: 1,
      name: '文案润色',
      summary: '简介',
      openingQuestions: ['帮我润色'],
      systemPrompt: '保留事实',
      toolScope: [],
      publishedByUserId: actor.id,
      publishedAt: new Date('2026-11-06T08:30:00Z'),
    };
    const prisma = {
      officialAgent: {
        findUnique: async () => ({
          ...agent,
          onlineVersion: version,
          versions: [version],
          grants: [
            {
              id: 'g1',
              tenant: { id: 't1', name: '试点', slug: 'pilot', status: 'active' },
              version: { id: 'v1', version: 1, name: '文案润色' },
              status: OfficialAgentGrantStatus.ACTIVE,
              revokedAt: null,
              createdAt: new Date('2026-11-06T08:40:00Z'),
              updatedAt: new Date('2026-11-06T08:40:00Z'),
            },
          ],
        }),
      },
    };
    const service = new AdminOfficialAgentsService(
      prisma as never,
      { adminScope: async () => null } as never,
      { loadAssetFiles: () => [], syncFromAssets: async () => [] } as never,
    );

    const detail = await service.detail(actor, 'a-copy');
    assert.match(String(detail.avatarUrl), /\/api\/official-agents\/avatars\/copy\.jpg$/);
    assert.equal(detail.draft.name, '文案润色');
    assert.equal(detail.onlineVersion?.version, 1);
    assert.equal(detail.onlineVersion?.publishedAt instanceof Date, true);
    assert.equal(detail.versions.length, 1);
    assert.equal(detail.activeGrantCount, 1);
  });
});

describe('admin official agent custom avatar presentation order', () => {
  it('customAvatarPath wins over packaged asset default', async () => {
    const prev = process.env.UPLOAD_DIR;
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'oa-admin-avatar-'));
    process.env.UPLOAD_DIR = root;
    try {
      mkdirSync(join(root, 'official-avatars'), { recursive: true });
      const fileName = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png';
      writeFileSync(
        join(root, 'official-avatars', fileName),
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
      );
      const service = createListHarness([
        {
          id: 'a-growth',
          key: 'growth',
          kind: 'GENERAL',
          category: 'content',
          capabilities: ['内容创作'],
          status: OfficialAgentStatus.PUBLISHED,
          name: '增长顾问',
          summary: 's',
          openingQuestions: [],
          systemPrompt: 'p',
          toolScope: [],
          onlineVersionId: null,
          customAvatarPath: `official-avatars/${fileName}`,
          createdAt: new Date('2026-11-06T08:00:00Z'),
          updatedAt: new Date('2026-11-06T08:00:00Z'),
        },
      ]);
      const rows = await service.list(actor, {});
      assert.match(
        String(rows[0]?.avatarUrl),
        new RegExp(`/api/official-agents/avatars/${fileName.replace(/\./g, '\\.')}$`),
      );
    } finally {
      if (prev === undefined) delete process.env.UPLOAD_DIR;
      else process.env.UPLOAD_DIR = prev;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
