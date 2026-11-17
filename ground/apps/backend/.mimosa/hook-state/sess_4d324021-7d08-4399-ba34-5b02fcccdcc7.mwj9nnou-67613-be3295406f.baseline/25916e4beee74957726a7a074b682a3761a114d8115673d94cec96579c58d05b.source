import { seedMissingOfficialDraft } from '../src/official-agent/legacy-inventory';
import {
  AccessScope,
  KbStatus,
  MemberRole,
  OfficialAgentKind,
  OfficialAgentStatus,
  PrismaClient,
  RoleScope,
  TenantType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { DEFAULT_AGENT_PERSONA, LEGAL_AGENT_PERSONA } from '../src/agent/personas';
import { chunkText, embedText, vectorLiteral } from '../src/knowledge/index-text';
import { uploadRoot } from '../src/knowledge/storage';
import { loadOfficialAgentAssets } from '../src/official-agent/official-agent-assets';
import {
  ALL_PERMISSION_KEYS,
  BUILTIN_ROLE_KEYS,
  PORTAL_CONSOLE_KEYS,
  ROLE_META,
  ROLE_PERMISSION_PACKS,
  type BuiltinRoleKey,
} from '../src/permissions/catalog';

const prisma = new PrismaClient();
const PASSWORD = '12345678';

async function upsertUser(phone: string, name: string, isPlatformAdmin = false) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  return prisma.user.upsert({
    where: { phone },
    update: { passwordHash, name, isPlatformAdmin },
    create: { phone, name, passwordHash, isPlatformAdmin },
  });
}



async function purgeUnknownRolePermissions() {
  const rows = await prisma.rolePermission.findMany({ select: { id: true, permKey: true } });
  const staleIds = rows.filter((r) => !ALL_PERMISSION_KEYS.has(r.permKey)).map((r) => r.id);
  if (staleIds.length) {
    await prisma.rolePermission.deleteMany({ where: { id: { in: staleIds } } });
    console.log('purged unknown role permissions:', staleIds.length);
  }
  const overrides = await prisma.orgPresetOverridePermission.findMany({ select: { id: true, permKey: true } });
  const staleOverrideIds = overrides.filter((r) => !ALL_PERMISSION_KEYS.has(r.permKey)).map((r) => r.id);
  if (staleOverrideIds.length) {
    await prisma.orgPresetOverridePermission.deleteMany({ where: { id: { in: staleOverrideIds } } });
    console.log('purged unknown org preset override permissions:', staleOverrideIds.length);
  }
}


/** 一次性清理：系统预置 org_member 模板上残留的 console.access/workbench（不动自定义角色）。 */
async function stripOrgMemberConsoleResidue() {
  const role = await prisma.role.findUnique({ where: { key: 'org_member' } });
  if (!role) return;
  const result = await prisma.rolePermission.deleteMany({
    where: {
      roleId: role.id,
      permKey: { in: ['portal.console.access', 'portal.console.workbench'] },
    },
  });
  if (result.count) {
    console.log('stripped org_member residual console keys:', result.count);
  }
}

/** 安全回填：仅系统预置 org_admin 模板补齐企业控制台权限，不改自定义角色。 */
async function ensureOrgAdminConsoleKeys() {
  const role = await prisma.role.findUnique({ where: { key: 'org_admin' } });
  if (!role) return;
  const existing = await prisma.rolePermission.findMany({
    where: { roleId: role.id, permKey: { in: PORTAL_CONSOLE_KEYS } },
    select: { permKey: true },
  });
  const have = new Set(existing.map((row) => row.permKey));
  const missing = PORTAL_CONSOLE_KEYS.filter((key) => !have.has(key));
  if (!missing.length) return;
  await prisma.rolePermission.createMany({
    data: missing.map((permKey) => ({ roleId: role.id, permKey })),
    skipDuplicates: true,
  });
  console.log('backfilled org_admin console keys:', missing.join(', '));
}

async function ensureBuiltinRoles() {
  for (const key of BUILTIN_ROLE_KEYS) {
    const meta = ROLE_META[key];
    const role = await prisma.role.upsert({
      where: { key },
      update: {
        name: meta.name,
        description: meta.description,
        scope: meta.scope as RoleScope,
        builtIn: true,
        editable: meta.editable,
      },
      create: {
        key,
        name: meta.name,
        description: meta.description,
        scope: meta.scope as RoleScope,
        builtIn: true,
        editable: meta.editable,
      },
    });
    const pack = ROLE_PERMISSION_PACKS[key as BuiltinRoleKey];
    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { id: true, permKey: true },
    });
    // 仅 super_admin（editable=false）每次对齐默认全量包；其余内置角色保存啥就是啥，seed 不回滚。
    if (!meta.editable) {
      const want = new Set(pack);
      const have = new Set(existing.map((e) => e.permKey));
      const toDelete = existing.filter((e) => !want.has(e.permKey)).map((e) => e.id);
      if (toDelete.length) {
        await prisma.rolePermission.deleteMany({ where: { id: { in: toDelete } } });
      }
      const toAdd = pack.filter((k) => !have.has(k));
      if (toAdd.length) {
        await prisma.rolePermission.createMany({
          data: toAdd.map((permKey) => ({ roleId: role.id, permKey })),
          skipDuplicates: true,
        });
      }
    } else if (existing.length === 0) {
      await prisma.rolePermission.createMany({
        data: pack.map((permKey) => ({ roleId: role.id, permKey })),
        skipDuplicates: true,
      });
    }
  }
  console.log('roles seeded:', BUILTIN_ROLE_KEYS.join(', '));
}

async function ensurePlatformRole(userId: string, roleKey: BuiltinRoleKey) {
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) throw new Error(`missing role ${roleKey}`);
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });
  await prisma.user.update({ where: { id: userId }, data: { isPlatformAdmin: true } });
}

/** 企业成员的企业角色兜底：没有任何角色绑定时补企业预设（与 addMember 语义一致）。 */
async function ensureOrgPresetRole(userId: string, roleKey: 'org_admin' | 'org_member') {
  const has = await prisma.userRole.count({ where: { userId } });
  if (has > 0) return;
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) throw new Error(`missing role ${roleKey}`);
  await prisma.userRole.create({ data: { userId, roleId: role.id } });
}

async function main() {
  await ensureBuiltinRoles();
  await ensureOrgAdminConsoleKeys();
  await stripOrgMemberConsoleResidue();
  await purgeUnknownRolePermissions();

  // 复用已存在的总部租户，避免重复创建「猛犸总部」
  const platform = await prisma.tenant.findFirst({
    where: { type: TenantType.PLATFORM },
    orderBy: { createdAt: 'asc' },
  }) ?? await prisma.tenant.create({
    data: { name: '猛犸总部', slug: 'platform', type: TenantType.PLATFORM },
  });
  // 一期只做「猛犸总部 → 直属企业」：不再种子代理商（org_tree 结构保留，二期再开）。
  const enterprise = await prisma.tenant.upsert({
    where: { slug: 'demo-enterprise' },
    update: {},
    create: { name: '演示企业', slug: 'demo-enterprise', type: TenantType.ENTERPRISE },
  });

  await prisma.orgTree.upsert({
    where: { parentId_childId: { parentId: platform.id, childId: enterprise.id } },
    update: {},
    create: { parentId: platform.id, childId: enterprise.id },
  });

  const admin = await upsertUser('13800000001', '平台管理员', true);
  await ensurePlatformRole(admin.id, 'super_admin');
  const owner = await upsertUser('13800000004', '企业管理员');
  const demoUser = await upsertUser('13800000003', '企业员工');

  await prisma.orgMember.upsert({
    where: { userId_tenantId: { userId: admin.id, tenantId: platform.id } },
    update: {},
    create: { userId: admin.id, tenantId: platform.id, role: MemberRole.ADMIN },
  });
  await prisma.orgMember.upsert({
    where: { userId_tenantId: { userId: owner.id, tenantId: enterprise.id } },
    update: { role: MemberRole.ADMIN },
    create: { userId: owner.id, tenantId: enterprise.id, role: MemberRole.ADMIN },
  });
  await prisma.orgMember.upsert({
    where: { userId_tenantId: { userId: demoUser.id, tenantId: enterprise.id } },
    update: {},
    create: { userId: demoUser.id, tenantId: enterprise.id, role: MemberRole.MEMBER },
  });

  await ensureOrgPresetRole(owner.id, 'org_admin');
  await ensureOrgPresetRole(demoUser.id, 'org_member');
  // AgentRef 表暂留：演示种子仍静默写入，不再挂到企业设置 / console UI。
  await ensureAgent(enterprise.id, '法律顾问', LEGAL_AGENT_PERSONA);
  await ensureAgent(enterprise.id, '企业助手', DEFAULT_AGENT_PERSONA);
  await ensureOfficialAgentDrafts();
  await prisma.tenant.update({
    where: { id: enterprise.id },
    data: {
      welcomeMessage: '欢迎使用演示企业控制台。知识库已接入对话检索，请先点材料生效。',
    },
  });
  const folders: Record<string, string> = {};
  for (const name of ['法规', '合同范本', '客户名单']) {
    folders[name] = (await ensureFolder(enterprise.id, name)).id;
  }
  for (const tenant of [platform, enterprise]) {
    await prisma.quota.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: { tenantId: tenant.id, monthlyTurns: 0, monthlyTokens: 0 },
    });
  }
  await ensureSampleDoc(enterprise.id, folders['法规']);

  console.log('seed ok');
  console.log('  13800000001 / 12345678  (平台管理员)');
  console.log('  13800000004 / 12345678  (企业管理员)');
  console.log('  13800000003 / 12345678  (企业员工)');
}

async function ensureAgent(tenantId: string, name: string, persona: string) {
  const existing = await prisma.agentRef.findFirst({ where: { tenantId, name } });
  if (existing) {
    await prisma.agentRef.update({
      where: { id: existing.id },
      data: { persona, enabled: true, visibility: AccessScope.ALL },
    });
    return existing;
  }
  return prisma.agentRef.create({
    data: { tenantId, name, persona, enabled: true, visibility: AccessScope.ALL },
  });
}

/** 一期试点只准备草稿，不自动发布或开通；已有草稿不被种子覆盖。 */
async function ensureOfficialAgentDrafts() {
  const drafts = [
    {
      key: 'copy-polish-master',
      kind: OfficialAgentKind.GENERAL,
      name: '文案润色大师',
      summary: '在不改变事实和原意的前提下，提升企业文案的清晰度、简洁度与表达一致性。',
      openingQuestions: [
        '把这段产品说明改得更简洁，保留所有关键信息。',
        '将这段内部通知改成正式、易读的企业公告。',
      ],
      systemPrompt: '你是文案润色大师。保留用户提供的事实、数字、名称和原意，不编造案例、资质、价格或承诺。先直接给出润色后的正文；用户需要时再简要说明修改点。',
      toolScope: [] as string[],
    },
    {
      key: 'enterprise-product-answer',
      kind: OfficialAgentKind.KNOWLEDGE,
      name: '企业资料答疑助手',
      summary: '依据企业授权资料回答产品、制度和服务问题，并提供可定位的资料出处。',
      openingQuestions: [
        '根据企业资料介绍我们的核心产品。',
        '这份资料对相关流程有什么要求？请附出处。',
      ],
      systemPrompt: '你是企业资料答疑助手。只能依据当前企业授权且当前成员可读的资料作事实性回答，并保留资料出处。资料不足时明确说明未找到依据，不编造产品功能、客户案例、价格、资质或服务承诺。',
      toolScope: ['enterprise_knowledge'],
    },
  ];
  for (const draft of drafts) {
    await prisma.officialAgent.upsert({
      where: { key: draft.key },
      update: {},
      create: draft,
    });
  }
  // 批次 A 等仓内资产：仅创建缺失草稿；已发布不覆盖。
  await ensureOfficialAgentAssetsDrafts();
}

/** 从 src/official-agent/assets 导入草稿（幂等；不发布）。 */
async function ensureOfficialAgentAssetsDrafts() {
  let assets;
  try {
    assets = loadOfficialAgentAssets();
  } catch (err) {
    console.warn('skip official agent assets:', err);
    return;
  }
  for (const asset of assets) {
    await seedMissingOfficialDraft(prisma,{
      key:asset.key,kind:asset.kind,name:asset.name,summary:asset.summary,
      openingQuestions:asset.openingQuestions,systemPrompt:asset.systemPrompt,toolScope:asset.toolScope,
    });
  }
}

async function ensureFolder(tenantId: string, name: string) {
  const existing = await prisma.kbFolder.findFirst({ where: { tenantId, name } });
  if (existing) return existing;
  return prisma.kbFolder.create({ data: { tenantId, name } });
}

const SAMPLE_LABOR_LAW = `劳动合同试用期要点
1. 劳动合同期限三个月以上不满一年的，试用期不得超过一个月。
2. 劳动合同期限一年以上不满三年的，试用期不得超过二个月。
3. 三年以上固定期限和无固定期限的劳动合同，试用期不得超过六个月。
4. 同一用人单位与同一劳动者只能约定一次试用期。
5. 试用期包含在劳动合同期限内。劳动合同仅约定试用期的，试用期不成立，该期限为劳动合同期限。
以上摘录仅供本企业知识库演示检索，回答时必须引用本材料，不得编造法条编号或胜诉结论。
`;

async function ensureSampleDoc(tenantId: string, folderId: string) {
  const name = '劳动合同试用期.txt';
  const existing = await prisma.kbDocument.findFirst({ where: { tenantId, name } });
  if (existing) {
    await indexExisting(existing.id, tenantId, SAMPLE_LABOR_LAW);
    return existing;
  }
  const rel = join(tenantId, 'seed-labor-trial.txt');
  const abs = join(uploadRoot(), rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, SAMPLE_LABOR_LAW, 'utf8');
  const doc = await prisma.kbDocument.create({
    data: {
      tenantId,
      folderId,
      name,
      originalName: name,
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength(SAMPLE_LABOR_LAW),
      storagePath: rel.replace(/\\/g, '/'),
      status: KbStatus.READY,
      visibility: AccessScope.ALL,
    },
  });
  await indexExisting(doc.id, tenantId, SAMPLE_LABOR_LAW);
  return doc;
}

async function indexExisting(documentId: string, tenantId: string, text: string) {
  await prisma.kbChunk.deleteMany({ where: { documentId } });
  const chunks = chunkText(text);
  for (let i = 0; i < chunks.length; i += 1) {
    const row = await prisma.kbChunk.create({
      data: { tenantId, documentId, ordinal: i, content: chunks[i] },
    });
    await prisma.$executeRawUnsafe(
      'UPDATE kb_chunk SET embedding = $1::vector WHERE id = $2',
      vectorLiteral(embedText(row.content)),
      row.id,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
