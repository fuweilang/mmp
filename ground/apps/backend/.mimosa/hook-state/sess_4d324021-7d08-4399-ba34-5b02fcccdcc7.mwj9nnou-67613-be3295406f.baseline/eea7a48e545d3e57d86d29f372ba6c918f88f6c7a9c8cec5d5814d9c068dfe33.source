import { HttpException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { assertSuperAdmin } from '../auth/super-admin';
import { newRetrievalDiagnostics, type RetrievalDiagnostics, type CandidateDiagnostic } from './retrieval-diagnostics';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeCoreService } from './knowledge-core.service';
import { KnowledgeHttpAdapter } from './provider';
import { KnowledgeCoreError, safeKnowledgeError } from './errors';
import { KnowledgeCandidateStore, type Candidate, type CandidateScope } from './candidate-store';
import { planKnowledgeQueries } from './query-plan';
import { reciprocalRankFusion, buildEvidenceContext, selectEvidenceWithNeighbors, focusNamedHeadings, namedHeadingScore, namedHeadingTerms } from './retrieval';
import type { KnowledgeAccess, KnowledgeRetrievalInput, KnowledgeSourceReference } from './retrieval-access';
import type { RetrievalResult, RetrievalEvidence, EvidenceContext } from './types';
export interface KnowledgeRetrievalResponse extends RetrievalResult {
  context: EvidenceContext;
  queryStrategy: string;
}
@Injectable()
export class KnowledgeRetrievalService {
  constructor(private readonly db: PrismaService, private readonly core: KnowledgeCoreService, private readonly provider: KnowledgeHttpAdapter, private readonly candidates: KnowledgeCandidateStore) { }
  private async scopes(access: KnowledgeAccess): Promise<(CandidateScope & {
    profileId: string;
  })[]> {
    const user = await this.db.user.findUnique({
      where: {
        id: access.actorUserId
      }, select: {
        status: true
      }
    });
    if (!user || user.status !== 'active')
      throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
    if (access.tenantId) {
      const member = await this.db.orgMember.findUnique({
        where: {
          userId_tenantId: {
            userId: access.actorUserId, tenantId: access.tenantId
          }
        }, include: {
          tenant: true
        }
      });
      if (!member || member.tenant.status !== 'active')
        throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
    }
    let selected;
    try {
      selected = await access.authorize();
    }
    catch (error) {
      if (error instanceof HttpException && [401, 403, 404].includes(error.getStatus()))
        throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
      throw error;
    }
    if (selected.length > 20)
      throw new KnowledgeCoreError('INVALID_RELEASE_SELECTION');
    const result: (CandidateScope & {
      profileId: string;
    })[] = [];
    for (const selectedRelease of selected) {
      if (selectedRelease.scope.type === 'TENANT' && selectedRelease.scope.tenantId !== access.tenantId)
        throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
      const inventory = await this.core.getRetrievalInventory(selectedRelease.releaseId, selectedRelease.scope);
      const groups = new Map<string, string[]>();
      for (const i of inventory) {
        if (selectedRelease.documentIds !== undefined && !selectedRelease.documentIds.includes(i.revision.document.id)) continue;
        if (!i.revision.document.enabled || !i.profile.enabled || i.status !== 'READY')
          continue;
        const group = groups.get(i.profileId) ?? [];
        group.push(i.id);
        groups.set(i.profileId, group);
      }
      for (const [profileId, indexIds] of groups)
        result.push({
          releaseId: selectedRelease.releaseId, scope: selectedRelease.scope, profileId, indexIds
        });
    }
    return result;
  }
  private abort(signal?: AbortSignal) {
    if (signal?.aborted)
      throw new KnowledgeCoreError('RETRIEVAL_CANCELLED');
  }
  private async reserve(access: KnowledgeAccess, retrievalId: string) {
    if (!access.conversationId || !access.turnId || access.conversationId.length > 200 || access.turnId.length > 200)
      throw new KnowledgeCoreError('INVALID_RETRIEVAL_TURN');
    const requestId = JSON.stringify([access.conversationId, access.turnId]);
    await this.db.$transaction(async (tx) => {
      const key = JSON.stringify([access.actorUserId, requestId]);
      await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${key},0))`;
      const count = await tx.knowledgeRetrievalTrace.count({
        where: {
          actorUserId: access.actorUserId, requestId
        }
      });
      if (count >= 2)
        throw new KnowledgeCoreError('RETRIEVAL_LOOKUP_BUDGET_EXHAUSTED');
      await tx.knowledgeRetrievalTrace.create({
        data: {
          id: retrievalId, requestId, actorUserId: access.actorUserId, tenantId: access.tenantId,
          scope: access.tenantId ? 'TENANT' : 'PLATFORM', expertId: access.expertId, expertVersionId: access.expertVersionId, previewId: access.previewId, releaseIds: [], status: 'STARTED', evidence: [], degradation: []
        }
      });
    });
  }
  async retrieve(access: KnowledgeAccess, input: KnowledgeRetrievalInput): Promise<KnowledgeRetrievalResponse> {
    return this.execute(access, input);
  }
  /** Separate privileged interface: ordinary runtime retrieval never accepts or returns debug data. */
  async retrieveForAdmin(actorUserId: string, access: KnowledgeAccess, input: KnowledgeRetrievalInput) {
    await assertSuperAdmin(this.db, actorUserId);
    if (access.actorUserId !== actorUserId || access.tenantId !== null)
      throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
    const diagnostics = newRetrievalDiagnostics();
    const result = await this.execute(access, input, diagnostics);
    if (diagnostics.candidates.length || result.evidence.length) {
      // Raw diagnostic rows can outlive their source authorization even when final evidence stays valid.
      // Recheck every exposed identity against current release/document/profile inventory, including discarded rows.
      const current = await this.scopes(access);
      const authorized = (row: { knowledgeReleaseId: string; indexRevisionId: string }) => current.some(scope =>
        scope.releaseId === row.knowledgeReleaseId && scope.indexIds.includes(row.indexRevisionId));
      diagnostics.candidates = diagnostics.candidates.filter(authorized);
      if (result.evidence.some(row => !authorized(row))) {
        result.status = 'FORBIDDEN';
        result.evidence = [];
        result.context = buildEvidenceContext([], 0);
        diagnostics.candidates = [];
        diagnostics.counts.retainedEvidence = 0;
        result.degradation = [...new Set([...result.degradation, 'KNOWLEDGE_FORBIDDEN'])];
        await this.db.knowledgeRetrievalTrace.updateMany({
          where: { id: result.retrievalId },
          data: { status: 'FORBIDDEN', evidence: [], releaseIds: [], degradation: result.degradation },
        });
      }
    }
    await assertSuperAdmin(this.db, actorUserId);
    if (input.signal?.aborted) {
      result.status = 'CANCELLED';
      result.evidence = [];
      result.context = buildEvidenceContext([], 0);
      diagnostics.candidates = [];
      diagnostics.counts.retainedEvidence = 0;
      result.degradation = [...new Set([...result.degradation, 'RETRIEVAL_CANCELLED'])];
      await this.db.knowledgeRetrievalTrace.updateMany({
        where: {
          id: result.retrievalId
        }, data: {
          status: 'CANCELLED', evidence: [], releaseIds: [], degradation: result.degradation
        }
      });
    }
    return {
      ...result, diagnostics
    };
  }
  private async execute(access: KnowledgeAccess, input: KnowledgeRetrievalInput, diagnostics?: RetrievalDiagnostics): Promise<KnowledgeRetrievalResponse> {
    const started = performance.now(), retrievalId = randomUUID();
    const result: KnowledgeRetrievalResponse = {
      retrievalId, status: 'FAILED', queries: [], evidence: [], degradation: [], timings: {}, context: buildEvidenceContext([], 0), queryStrategy: 'ORIGINAL'
    };
    let reserved = false;
    const diagnosticRows = new Map<string, CandidateDiagnostic>();
    const record = (rows: Candidate[], route: 'dense' | 'lexical', profileId: string | undefined, queryIndex: number) => {
      if (!diagnostics)
        return;
      for (const [index, row] of rows.entries()) {
        let diagnostic = diagnosticRows.get(row.chunkId);
        if (!diagnostic) {
          diagnostic = {
            chunkId: row.chunkId, documentId: row.documentId, revisionId: row.revisionId, indexRevisionId: row.indexRevisionId,
            knowledgeReleaseId: row.knowledgeReleaseId, sourceTitle: row.sourceTitle?.slice(0, 200), snippet: row.text.slice(0, 240),
            locator: {
              ...row.locator, headingPath: row.locator.headingPath?.slice(0, 4).map(value => value.slice(0, 100))
            }, routeRanks: [], retained: false, reason: 'ROUTE_LIMIT'
          };
          diagnosticRows.set(row.chunkId, diagnostic);
        }
        if (diagnostic.routeRanks.length < 15)
          diagnostic.routeRanks.push({
            route, profileId, queryIndex, rank: index + 1, score: row.score
          });
      }
    };
    const addTiming = (key: string, from: number) => result.timings[key] = (result.timings[key] ?? 0) + Math.round(performance.now() - from);
    const cancelled = () => { result.status = 'CANCELLED'; result.evidence = []; result.context = buildEvidenceContext([], 0); result.degradation.push('RETRIEVAL_CANCELLED'); };
    try {
      this.abort(input.signal);
      const plan = planKnowledgeQueries(input.query, access.conversationId, input.context);
      result.queries = plan.queries;
      result.queryStrategy = plan.strategy;
      if (plan.strategy !== 'ORIGINAL')
        result.degradation.push('DETERMINISTIC_CONTEXT_NOT_MODEL_REWRITE');
      const budget = input.budgetTokens ?? 8000;
      if (!Number.isSafeInteger(budget) || budget < 0 || budget > 8000)
        throw new KnowledgeCoreError('INVALID_EVIDENCE_BUDGET');
      // Internal candidate SQL checks live material flags itself. Use one request-local
      // corpus identity set for ranking; reauthorize before rerank export and final disclosure.
      // This is never reused by another request or by the public source-open endpoint.
      const initial = await this.retrievalScopes(access);
      this.abort(input.signal);
      await this.reserve(access, retrievalId);
      reserved = true;
      this.abort(input.signal);
      if (!initial.length) {
        result.status = 'NOT_READY';
        return result;
      }
      const profileIds = [...new Set(initial.map(scope => scope.profileId))];
      if (profileIds.length > 4)
        throw new KnowledgeCoreError('PROFILE_FANOUT_LIMIT');
      if (input.embeddingProfileId && profileIds.some(id => id !== input.embeddingProfileId))
        throw new KnowledgeCoreError('PROFILE_INDEX_INCOMPATIBLE');
      if (diagnostics)
        Object.assign(diagnostics.counts, {
          authorizedReleases: new Set(initial.map(scope => scope.releaseId)).size, distinctProfiles: profileIds.length, queryCount: plan.queries.length, embeddingCalls: 0, denseQueries: 0, lexicalQueries: 0, denseRawCandidates: 0, lexicalRawCandidates: 0
        });
      const lexicalRankings: Candidate[][] = [], profileRankings: Candidate[][] = [];
      const denseFailures: string[] = [];
      // One lexical ranking per subquery over every authorized release, never per-release voters.
      const lexicalSearch = async () => {
      for (const [queryIndex, query] of plan.queries.entries()) {
        const current = initial;
        this.abort(input.signal);
        const from = performance.now();
        const rows = (await this.candidates.lexical(current, query)).slice(0, 30);
        this.abort(input.signal);
        addTiming('lexicalMs', from);
        lexicalRankings.push(rows);
        record(rows, 'lexical', undefined, queryIndex);
        if (diagnostics) {
          diagnostics.counts.lexicalQueries++;
          diagnostics.counts.lexicalRawCandidates += rows.length;
        }
      }
      };
      // Compatible profiles reuse one batch of original/context queries across all of their release scopes.
      const denseSearch = async () => {
      for (const profileId of profileIds) {
        try {
          const before = performance.now();
          if (diagnostics)
            diagnostics.counts.embeddingCalls++;
          const embedded = await this.provider.embed(profileId, plan.queries, {
            signal: input.signal, operationId: retrievalId
          });
          this.abort(input.signal);
          addTiming('embeddingMs', before);
          const queryRankings: Candidate[][] = [];
          for (const [queryIndex, vector] of embedded.vectors.entries()) {
            const current = initial.filter(scope => scope.profileId === profileId);
            this.abort(input.signal);
            if (!current.length)
              throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
            const from = performance.now();
            const rows = (await this.candidates.dense(current, vector)).slice(0, 40);
            this.abort(input.signal);
            addTiming('denseMs', from);
            queryRankings.push(rows);
            record(rows, 'dense', profileId, queryIndex);
            if (diagnostics) {
              diagnostics.counts.denseQueries++;
              diagnostics.counts.denseRawCandidates += rows.length;
            }
          }
          profileRankings.push(reciprocalRankFusion(queryRankings).slice(0, 40));
        }
        catch (error) {
          this.abort(input.signal);
          const code = safeKnowledgeError(error).code;
          if (code === 'KNOWLEDGE_FORBIDDEN' || code === 'PROFILE_FANOUT_LIMIT' || input.mode === 'required')
            throw error;
          denseFailures.push(code);
          result.degradation.push(code, 'DENSE_UNAVAILABLE_LEXICAL_ONLY');
        }
      }
      };
      // These routes are independent; settle both before returning even when one fails.
      const routes = await Promise.allSettled([lexicalSearch(), denseSearch()]);
      for (const route of routes) if (route.status === 'rejected') throw route.reason;
      const fusionStarted = performance.now();
      // Ranks are fused across incompatible models, never raw cosine values. Retained routes remain dense40+lexical30 total.
      const dense = reciprocalRankFusion(profileRankings).slice(0, 40);
      const lexical = reciprocalRankFusion(lexicalRankings).slice(0, 30);
      let merged: Candidate[] = reciprocalRankFusion([dense, lexical]).slice(0, 20);
      dense.forEach((row, index) => {
        const item = diagnosticRows.get(row.chunkId);
        if (item)
          item.denseRank = index + 1;
      });
      lexical.forEach((row, index) => {
        const item = diagnosticRows.get(row.chunkId);
        if (item)
          item.lexicalRank = index + 1;
      });
      reciprocalRankFusion([dense, lexical]).forEach((row, index) => {
        const item = diagnosticRows.get(row.chunkId);
        if (item) {
          item.reason = 'FUSION_LIMIT';
          if (index < 20) {
            item.fusionRank = index + 1;
            item.fusionScore = row.rrfScore;
            item.reason = 'FINAL_LIMIT';
          }
        }
      });
      addTiming('fusionMs', fusionStarted);
      if (diagnostics)
        Object.assign(diagnostics.counts, {
          denseGlobalCandidates: dense.length, lexicalGlobalCandidates: lexical.length, mergedCandidates: merged.length, rerankCandidates: 0
        });
      const focused = focusNamedHeadings(merged, input.query);
      if (focused.some((row, index) => row.chunkId !== merged[index].chunkId))
        result.queryStrategy += '+EXACT_HEADING_FOCUS';
      merged = focused;
      if (input.rerankProfileId && merged.length) {
        const from = performance.now();
        try {
          await this.revalidateCandidates(access, merged);
          this.abort(input.signal);
          if (diagnostics)
            diagnostics.counts.rerankCandidates = merged.length;
          const ranked = await this.provider.rerank(input.rerankProfileId, input.query, merged.map(row => row.text), merged.length, {
            signal: input.signal, operationId: retrievalId
          });
          this.abort(input.signal);
          if (diagnostics) diagnostics.counts.rerankCandidates = ranked.inputCount;
          if (ranked.inputCount < merged.length) result.degradation.push('RERANK_GLOBAL_PREFIX_LIMIT');
          const sorted = [...ranked.results].sort((a, b) => b.score - a.score), indexes = sorted.map(row => row.index);
          sorted.forEach((rank, index) => {
            const item = diagnosticRows.get(merged[rank.index].chunkId);
            if (item) {
              item.rerankRank = index + 1;
              item.rerankScore = rank.score;
            }
          });
          merged = [...indexes.map(index => merged[index]), ...merged.filter((_, index) => !indexes.includes(index))];
        }
        catch (error) {
          this.abort(input.signal);
          if (['KNOWLEDGE_FORBIDDEN', 'PROFILE_FANOUT_LIMIT'].includes(safeKnowledgeError(error).code))
            throw error;
          result.degradation.push(safeKnowledgeError(error).code, 'RERANK_FAILED_RRF_FALLBACK');
        }
        addTiming('rerankMs', from);
      }
      else
        result.degradation.push('RERANK_NOT_CONFIGURED');
      const selectionStarted = performance.now();
      const final: Candidate[] = [], seen = new Set<string>(), seenContent = new Set<string>(), perDocument = new Map<string, number>();
      for (const cap of [2, 6])
        for (const row of merged) {
          if (final.length >= 6)
            break;
          if (seen.has(row.chunkId))
            continue;
          if (seenContent.has(row.contentHash ?? row.text)) {
            const item = diagnosticRows.get(row.chunkId);
            if (item)
              item.reason = 'DUPLICATE_CONTENT';
            continue;
          }
          if ((perDocument.get(row.documentId) ?? 0) >= cap) {
            const item = diagnosticRows.get(row.chunkId);
            if (item)
              item.reason = 'DIVERSITY_LIMIT';
            continue;
          }
          final.push(row);
          seen.add(row.chunkId);
          seenContent.add(row.contentHash ?? row.text);
          perDocument.set(row.documentId, (perDocument.get(row.documentId) ?? 0) + 1);
        }
      const fresh = await this.openScopedSources(initial, final);
      this.abort(input.signal);
      final.forEach((row,index)=>Object.assign(row,fresh[index]));
      const neighborScopes=initial;
      const adjacent=(await Promise.all(final.map(async row => {
        const current = neighborScopes.find(scope => scope.releaseId === row.knowledgeReleaseId && scope.indexIds.includes(row.indexRevisionId));
        this.abort(input.signal);
        if (!current)
          throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
        return this.candidates.neighbors(current, row.indexRevisionId, row.ordinal);
      }))).flat();
      this.abort(input.signal);
      let rows = selectEvidenceWithNeighbors(final, adjacent);
      // An explicitly named section is a bounded parent context, not six unrelated matches.
      const named = namedHeadingTerms(input.query).length === 1 ? final.find(row => namedHeadingScore(row, input.query) > 0) : undefined;

      if (named?.locator.headingPath?.length) {
        const current = initial.find(scope => scope.releaseId === named.knowledgeReleaseId && scope.indexIds.includes(named.indexRevisionId));
        this.abort(input.signal);
        if (!current) throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
        const section = await this.candidates.section(current, named.indexRevisionId, named.locator.headingPath);
        this.abort(input.signal);
        if (section.length && section.length <= 6) {
          rows = section.filter((row, index, all) => all.findIndex(other => (other.contentHash ?? other.text) === (row.contentHash ?? row.text)) === index).slice(0, 6);
          result.queryStrategy += '+NAMED_SECTION_CONTEXT';
        } else if (section.length > 6) result.degradation.push('NAMED_SECTION_TOO_LONG_NEIGHBORS');
      }
      await this.revalidateCandidates(access, rows);
      this.abort(input.signal);
      result.context = buildEvidenceContext(rows.map(row => this.evidence(row)), budget);
      result.evidence = result.context.evidence;
      if (result.context.truncated)
        result.degradation.push('EVIDENCE_BUDGET_TRUNCATED');
      result.status = result.evidence.length ? 'READY' : denseFailures.length
        ? denseFailures.some(code => !/UNCONFIGURED|CREDENTIALS|PROFILE_DISABLED|PROVIDER_DISABLED/.test(code)) ? 'FAILED' : 'NOT_CONFIGURED'
        : 'NO_EVIDENCE';
      if (diagnostics) {
        for (const row of final)
          if (!rows.some(selected => selected.chunkId === row.chunkId)) {
            const item = diagnosticRows.get(row.chunkId);
            if (item)
              item.reason = 'ADJACENCY_REPLACED';
          }
        record(rows, 'dense', undefined, -1);
        rows.forEach((row, index) => {
          const item = diagnosticRows.get(row.chunkId);
          if (item) {
            item.finalRank = index + 1;
            item.retained = result.evidence.some(hit => hit.chunkId === row.chunkId);
            item.reason = item.retained ? 'RETAINED' : 'BUDGET';
            item.routeRanks = item.routeRanks.filter(rank => rank.queryIndex >= 0);
          }
        });
        Object.assign(diagnostics.counts, {
          finalCandidates: rows.length, retainedEvidence: result.evidence.length, distinctCandidateCount: diagnosticRows.size
        });
        diagnostics.candidates = [...diagnosticRows.values()].sort((a, b) => (a.finalRank ?? 1000) - (b.finalRank ?? 1000) || (a.fusionRank ?? 1000) - (b.fusionRank ?? 1000)).slice(0, 100);
        diagnostics.truncated = diagnosticRows.size > 100;
      }
      addTiming('selectionMs', selectionStarted);
      this.abort(input.signal);
      return result;
    }
    catch (error) {
      const code = safeKnowledgeError(error).code;
      result.degradation.push(code);
      result.status = input.signal?.aborted || code.includes('CANCELLED') ? 'CANCELLED'
        : code === 'KNOWLEDGE_DISABLED' || code.includes('FORBIDDEN') || code.includes('SCOPE') || code.includes('NOT_FOUND') ? 'FORBIDDEN'
          : code === 'PROFILE_INDEX_INCOMPATIBLE' || code === 'PROFILE_FANOUT_LIMIT' ? 'NOT_READY'
            : /UNCONFIGURED|CREDENTIALS|PROFILE_DISABLED|PROVIDER_DISABLED/.test(code) ? 'NOT_CONFIGURED' : 'FAILED';
      result.evidence = [];
      result.context = buildEvidenceContext([], 0);
      return result;
    }
    finally {
      if (input.signal?.aborted)
        cancelled();
      result.degradation = [...new Set(result.degradation)];
      const persist = () => this.db.knowledgeRetrievalTrace.update({
        where: {
          id: retrievalId
        }, data: {
          status: result.status,
          releaseIds: [...new Set(result.evidence.map(row => row.knowledgeReleaseId))], degradation: result.degradation,
          evidence: result.evidence.map(row => ({
            chunkId: row.chunkId, documentId: row.documentId, revisionId: row.revisionId, indexRevisionId: row.indexRevisionId,
            knowledgeReleaseId: row.knowledgeReleaseId, locator: row.locator, contentHash: row.contentHash
          })) as unknown as Prisma.InputJsonValue
        }
      });
      if (reserved) {
        await persist();
        if (input.signal?.aborted && result.status !== 'CANCELLED') {
          cancelled();
          result.degradation = [...new Set(result.degradation)];
          await persist();
        }
      }
      if (input.signal?.aborted)
        cancelled();
      result.degradation = [...new Set(result.degradation)];
      result.timings.totalMs = Math.round(performance.now() - started);
      if (diagnostics) {
        diagnostics.counts.retainedEvidence = result.evidence.length;
        diagnostics.timings = {
          ...result.timings
        };
        if (result.status === 'FORBIDDEN' || result.status === 'CANCELLED')
          diagnostics.candidates = [];
      }
    }
  }
  private async retrievalScopes(access: KnowledgeAccess) {
    const scopes = await this.scopes(access);
    if (new Set(scopes.map(scope => scope.profileId)).size > 4)
      throw new KnowledgeCoreError('PROFILE_FANOUT_LIMIT');
    return scopes;
  }
  private async revalidateCandidates(access: KnowledgeAccess, rows: Candidate[]) {
    const scopes = await this.retrievalScopes(access);
    if (rows.some(row => !scopes.some(scope => scope.releaseId === row.knowledgeReleaseId && scope.indexIds.includes(row.indexRevisionId))))
      throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
  }
  private evidence(row: RetrievalEvidence): RetrievalEvidence {
    return {
      chunkId: row.chunkId, documentId: row.documentId, revisionId: row.revisionId, indexRevisionId: row.indexRevisionId,
      knowledgeReleaseId: row.knowledgeReleaseId, text: row.text, locator: row.locator, sourceTitle: row.sourceTitle, scope: row.scope,
      contentHash: row.contentHash, tokenCount: row.tokenCount
    };
  }
  async openSource(access: KnowledgeAccess, ref: KnowledgeSourceReference): Promise<RetrievalEvidence & {
    sourceStart: number;
    sourceEnd: number;
  }> {
    return (await this.openSources(access,[ref]))[0];
  }
  /** One fresh authority inventory per batch; exact reads still check every immutable tuple. */
  async openSources(access: KnowledgeAccess, refs: readonly KnowledgeSourceReference[]): Promise<Array<RetrievalEvidence & {sourceStart:number;sourceEnd:number}>> {
    if(!refs.length) return [];
    const scopes=await this.scopes(access);
    return this.openScopedSources(scopes,refs);
  }
  private async openScopedSources(scopes: CandidateScope[], refs: readonly KnowledgeSourceReference[]): Promise<Array<RetrievalEvidence & {sourceStart:number;sourceEnd:number}>> {
    return Promise.all(refs.map(async ref=>{
    const selected = scopes.find(s => s.releaseId === ref.knowledgeReleaseId && s.indexIds.includes(ref.indexRevisionId));
    if (!selected)
      throw new KnowledgeCoreError('KNOWLEDGE_FORBIDDEN');
    const row = (await this.candidates.exact(selected, ref.chunkId))[0];
    if (!row || row.documentId !== ref.documentId || row.revisionId !== ref.revisionId || row.indexRevisionId !== ref.indexRevisionId)
      throw new KnowledgeCoreError('KNOWLEDGE_SOURCE_NOT_FOUND');
    return {
      ...this.evidence(row), sourceStart: row.sourceStart, sourceEnd: row.sourceEnd
    };
    }));
  }
}
