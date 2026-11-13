import { PrismaService } from '../prisma/prisma.service';
import type { KnowledgeSourceReference } from '../knowledge-core/retrieval-access';
import type { ExpertRuntimeBinding } from './expert-runtime.service';

/**
 * Terminal disclosure decision. This single PostgreSQL SELECT observes one READ COMMITTED
 * statement snapshot for principal, tenant, immutable binding and every exact source together.
 * Its statement snapshot is the authorization linearization point. The caller must perform
 * no later positive-path async I/O; only synchronous cancellation/boolean checks may follow.
 * Revocations committed after this point affect subsequent requests, not this authorized read.
 */
export async function authorizeExpertDisclosure(
  db: PrismaService,
  actorUserId: string,
  tenantId: string | null,
  binding: ExpertRuntimeBinding,
  sources: KnowledgeSourceReference[],
): Promise<boolean> {
  return authorizeExpertHistoryDisclosure(db, actorUserId, tenantId, [{binding, sources}]);
}

/** All historical bindings and tuples share the same terminal statement snapshot. */
export async function authorizeExpertHistoryDisclosure(
  db: PrismaService, actorUserId: string, tenantId: string | null,
  entries: Array<{binding: ExpertRuntimeBinding; sources: Array<KnowledgeSourceReference & {text?:string}>}>,
  verifyContent = false,
  requireCurrentRelease = false,
): Promise<boolean> {
  const requested = entries.map(({binding, sources}) => ({...binding, sources: sources.map(({knowledgeReleaseId,indexRevisionId,revisionId,documentId,chunkId,text})=>({knowledgeReleaseId,indexRevisionId,revisionId,documentId,chunkId,...verifyContent?{text:text??null}:{}}))}));
  const rows = await db.$queryRaw<Array<{allowed:boolean}>>`
    /* expert_terminal_disclosure_v1 */
    WITH requested AS (SELECT value AS entry, ordinality AS ordinal FROM jsonb_array_elements(${JSON.stringify(requested)}::jsonb) WITH ORDINALITY), principal AS (
      SELECT u.id FROM "user" u
      WHERE u.id = ${actorUserId} AND u.status = 'active'
        AND (${tenantId}::text IS NULL OR EXISTS (
          SELECT 1 FROM org_member m JOIN tenant t ON t.id = m.tenant_id
          WHERE m.user_id = u.id AND m.tenant_id = ${tenantId} AND t.status = 'active'
        ))
    ), bound AS (
      SELECT requested.ordinal, v.execution_config AS config, current_version.execution_config AS grants, requested.entry
      FROM official_agent a JOIN official_agent_version v ON v.agent_id = a.id
      JOIN official_agent_version current_version ON current_version.id=a.online_version_id AND current_version.agent_id=a.id
      CROSS JOIN principal p CROSS JOIN requested
      WHERE (entry ->> 'previewId') IS NULL
        AND a.id = (entry ->> 'agentId') AND v.id = (entry ->> 'versionId')
        AND a.status = 'PUBLISHED' AND a.online_version_id IS NOT NULL
      UNION ALL
      SELECT requested.ordinal, preview.snapshot -> 'executionConfig' AS config, preview.snapshot -> 'executionConfig' AS grants, requested.entry
      FROM official_expert_preview preview CROSS JOIN principal p CROSS JOIN requested
      WHERE (entry ->> 'versionId')::text IS NULL
        AND preview.id = (entry ->> 'previewId') AND preview.agent_id = (entry ->> 'agentId')
        AND preview.actor_user_id = p.id AND preview.expires_at > statement_timestamp()
        AND EXISTS (
          SELECT 1 FROM user_role ur JOIN role r ON r.id = ur.role_id
          WHERE ur.user_id = p.id AND r.key = 'super_admin' AND r.scope = 'PLATFORM'
        )
    )
    SELECT EXISTS (SELECT 1 FROM principal) AND NOT EXISTS (
      SELECT 1 FROM requested r WHERE NOT EXISTS (
      SELECT 1 FROM bound
      WHERE bound.ordinal = r.ordinal AND (
        (grants ->> 'route' = 'KNOWLEDGE_CORE' AND grants ->> 'retrievalPolicy' IN ('REQUIRED', 'AUTO'))
        OR EXISTS (SELECT 1 FROM kc_base owned WHERE owned.owner_agent_id = bound.entry ->> 'agentId' AND owned.enabled AND owned.auto_update)
      )
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(bound.entry -> 'sources') ref WHERE NOT EXISTS (
            SELECT 1
            FROM kc_release release
            JOIN kc_base base ON base.id = release.base_id
            JOIN kc_release_item item ON item.release_id = release.id
            JOIN kc_index_revision idx ON idx.id = item.index_revision_id
            JOIN kc_profile profile ON profile.id = idx.profile_id
            JOIN kc_document_revision revision ON revision.id = idx.revision_id
            JOIN kc_document doc ON doc.id = revision.document_id AND doc.base_id = base.id
            JOIN kc_chunk chunk ON chunk.index_revision_id = idx.id
            WHERE release.id = ref ->> 'knowledgeReleaseId' AND release.sealed
              AND base.scope = 'PLATFORM' AND base.tenant_id IS NULL AND base.enabled
              AND idx.id = ref ->> 'indexRevisionId' AND idx.status = 'READY' AND profile.enabled
              AND revision.id = ref ->> 'revisionId' AND doc.id = ref ->> 'documentId' AND doc.enabled
              AND (NOT ${requireCurrentRelease}::boolean OR CASE WHEN base.auto_update THEN
                base.current_release_id = release.id AND doc.deleted_at IS NULL
              ELSE (bound.entry ->> 'previewId') IS NOT NULL OR (
                grants ->> 'route' = 'KNOWLEDGE_CORE' AND grants ->> 'retrievalPolicy' IN ('REQUIRED','AUTO')
                AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(COALESCE(grants -> 'knowledge', '[]'::jsonb)) current_choice
                  WHERE current_choice ->> 'baseId' = base.id AND current_choice ->> 'releaseId' = release.id
                )
              ) END)
              AND chunk.id = ref ->> 'chunkId'
              AND (NOT ${verifyContent}::boolean OR (
                jsonb_typeof(ref -> 'text') = 'string'
                AND left(chunk.text, char_length(ref ->> 'text')) = ref ->> 'text'
              ))
              AND (
                (base.auto_update AND (
                  base.owner_agent_id = bound.entry ->> 'agentId'
                  OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(COALESCE(grants -> 'knowledge', '[]'::jsonb)) selected
                    WHERE grants ->> 'route' = 'KNOWLEDGE_CORE' AND grants ->> 'retrievalPolicy' IN ('REQUIRED','AUTO')
                      AND selected ->> 'baseId' = base.id AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements(COALESCE(selected -> 'indexes', '[]'::jsonb)) selected_file
                      WHERE selected_file ->> 'documentId' = doc.id
                    )
                  )
                )) OR (NOT base.auto_update AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(config -> 'knowledge', '[]'::jsonb)) knowledge
                WHERE knowledge ->> 'releaseId' = release.id AND knowledge ->> 'baseId' = base.id
                  AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(COALESCE(knowledge -> 'indexes', '[]'::jsonb)) pinned
                    WHERE pinned ->> 'indexRevisionId' = idx.id AND pinned ->> 'revisionId' = revision.id
                      AND pinned ->> 'documentId' = doc.id AND pinned ->> 'profileId' = profile.id
                      AND pinned ->> 'configHash' = idx.index_config_hash
                  )
              ))
              )
          )
        )
    )) AS allowed
  `;
  return rows[0]?.allowed === true;
}
