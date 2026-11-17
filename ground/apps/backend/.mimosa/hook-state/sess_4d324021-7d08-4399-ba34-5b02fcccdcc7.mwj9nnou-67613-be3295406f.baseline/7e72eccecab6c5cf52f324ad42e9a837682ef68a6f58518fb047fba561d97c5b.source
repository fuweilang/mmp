import { readFile, realpath, stat } from 'node:fs/promises';
import { sep } from 'node:path';
import { assertSuperAdmin } from '../auth/super-admin';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeCoreService } from '../knowledge-core/knowledge-core.service';
import { KnowledgeCoreError } from '../knowledge-core/errors';
import { absoluteUploadPath, uploadRoot } from '../knowledge/storage';
import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
/** Shared by seed: empty update is intentional; existing admin drafts are authoritative. */
export async function seedMissingOfficialDraft(db: Pick<PrismaClient, 'officialAgent'>, draft: Prisma.OfficialAgentCreateInput) {
    return db.officialAgent.upsert({ where: { key: draft.key }, update: {}, create: draft });
}
/** Read-only export, never loads private bytes or rewrites current IDs/ACLs. */
export async function legacyExpertInventory(db: Pick<PrismaClient, 'officialAgent' | 'officialKbDocument'>) {
    const agents = await db.officialAgent.findMany({ select: { id: true, key: true, status: true, onlineVersionId: true, executionConfig: true, systemPrompt: true }, orderBy: { key: 'asc' } });
    const documents = await db.officialKbDocument.findMany({ select: { id: true, agentId: true, name: true, storagePath: true, status: true, active: true }, orderBy: { id: 'asc' } });
    return { schemaVersion: 1, readOnly: true, agents: agents.map(({ systemPrompt, ...a }) => ({ ...a, promptHash: createHash('sha256').update(systemPrompt).digest('hex') })), documents: await Promise.all(documents.map(async ({ storagePath, ...d }) => { try {
            return { ...d, contentHash: createHash('sha256').update(await readLegacyOfficialBytes(storagePath)).digest('hex') };
        }
        catch {
            return { ...d, contentHash: null };
        } })) };
}
/** Opt-in shadow plan only: original IDs, hashes and ACL provenance are retained; no publishing or source rewrite. */
export function shadowMigrationPlan(inventory: Awaited<ReturnType<typeof legacyExpertInventory>>) {
    return { schemaVersion: 1, operation: 'SHADOW_PLAN_ONLY', autoPublish: false, items: inventory.documents.map(d => ({ sourceKind: 'LEGACY_OFFICIAL', sourceId: d.id, sourceAgentId: d.agentId, sourceHash: d.contentHash, sourceAcl: { scope: 'PLATFORM', legacyActive: d.active }, destination: null, status: 'AWAITING_EXPLICIT_IMPORT_AND_READY_RELEASE' })) };
}
async function readLegacyOfficialBytes(storagePath: string) {
    const root = await realpath(uploadRoot()), path = await realpath(absoluteUploadPath(storagePath));
    if (!path.startsWith(root + sep))
        throw new KnowledgeCoreError('UNSAFE_LEGACY_SOURCE');
    const info = await stat(path);
    if (!info.isFile() || info.size < 1 || info.size > 20 * 1024 * 1024)
        throw new KnowledgeCoreError('INVALID_LEGACY_SOURCE_SIZE');
    return readFile(path);
}
export interface OfficialShadowInput {
    actorUserId: string;
    baseId: string;
    profileId: string;
    items: Array<{
        sourceKind: 'LEGACY_OFFICIAL';
        sourceId: string;
        sourceHash: string;
    }>;
}
export async function applyOfficialShadow(db: PrismaService, core: KnowledgeCoreService, input: OfficialShadowInput) {
    if (!input.items?.length || input.items.length > 100 || input.items.some(i => i.sourceKind !== 'LEGACY_OFFICIAL'))
        throw new KnowledgeCoreError('ONLY_OFFICIAL_SHADOW_SUPPORTED');
    if (input.items.some(i => !i.sourceId || !i.sourceHash || !/^[a-f0-9]{64}$/.test(i.sourceHash)))
        throw new KnowledgeCoreError('REVIEWED_SOURCE_HASH_REQUIRED');
    await assertSuperAdmin(db, input.actorUserId);
    await core.getBase(input.baseId, { type: 'PLATFORM' });
    const mappings = [];
    for (const selected of input.items) {
        await assertSuperAdmin(db, input.actorUserId);
        const source = await db.officialKbDocument.findUnique({ where: { id: selected.sourceId } });
        if (!source?.active || source.status !== 'READY')
            throw new KnowledgeCoreError('LEGACY_SOURCE_NOT_READY');
        const bytes = await readLegacyOfficialBytes(source.storagePath);
        const hash = createHash('sha256').update(bytes).digest('hex');
        if (hash !== selected.sourceHash)
            throw new KnowledgeCoreError('LEGACY_SOURCE_CHANGED');
        const current = await db.officialKbDocument.findUnique({ where: { id: source.id } });
        if (!current?.active || current.updatedAt.getTime() !== source.updatedAt.getTime())
            throw new KnowledgeCoreError('LEGACY_SOURCE_CHANGED');
        const idempotencyKey = 'official-shadow-' + createHash('sha256').update(JSON.stringify([source.id, input.baseId, input.profileId, hash, source.originalName, source.name, source.mimeType])).digest('hex');
        const job = await core.upload(input.baseId, { type: 'PLATFORM' }, { bytes, profileId: input.profileId, idempotencyKey, originalName: source.originalName, title: source.name, mediaType: source.mimeType });
        const index = await db.knowledgeIndexRevision.findUniqueOrThrow({ where: { id: job.indexRevisionId }, include: { revision: true } });
        const mapping = { sourceKind: 'LEGACY_OFFICIAL', sourceId: source.id, sourceAgentId: source.agentId, sourceHash: hash, scope: 'PLATFORM', baseId: input.baseId, profileId: input.profileId, documentId: index.revision.documentId, revisionId: index.revisionId, indexRevisionId: index.id, jobId: job.id, idempotencyKey, status: job.status };
        await db.auditLog.create({ data: { userId: input.actorUserId, action: 'admin_official_knowledge_shadow', meta: mapping } });
        mappings.push(mapping);
    }
    return { operation: 'SHADOW_QUEUED', autoPublish: false, mappings };
}
