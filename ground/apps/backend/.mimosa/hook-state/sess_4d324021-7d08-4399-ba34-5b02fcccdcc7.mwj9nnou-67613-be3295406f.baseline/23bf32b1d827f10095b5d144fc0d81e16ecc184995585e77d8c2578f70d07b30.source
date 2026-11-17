import { LibraryAuthService } from './library.auth';
import { createLibraryContext, type LibraryContext, type LibraryContextInput } from './library.context';
import { libraryLimitsFromEnv, type LibraryLimits } from './library.limits';
import { LibraryReadService } from './library.read';
import { LibraryMediaService } from './library.media';
import { LibraryMutateService, type CreationOptions, type MoveOptions, type ScopeImpact, type ScopeOptions, type UploadInput } from './library.mutate';
import { LibraryAskService, type ModelComplete } from './library.ask.service';
import { LibraryStatsService } from './library.stats';
import type { LibraryStore } from './library.store';
import type { Actor, LibraryItem, LibraryScope, LibraryView } from './library.types';

export type { ModelComplete } from './library.ask.service';
export type { LibrarySearchHit } from './library.read';
export { libraryFileTypeKey } from './library.items';

/**
 * 资料库唯一对外入口：持有上下文并转发到 6 个职责子模块
 * （鉴权/auth、读/read、写与树/mutate、问答/ask、媒体/media、统计/stats）。
 * 子模块不注册为 Nest provider，也不互相 new：每个都只接收同一个 LibraryContext，
 * 因此事务句柄、限额与时钟在所有路径上保持一致。
 */
export class LibraryService {
  private readonly ctx: LibraryContext;
  private readonly auth: LibraryAuthService;
  private readonly read: LibraryReadService;
  private readonly media: LibraryMediaService;
  private readonly mutate: LibraryMutateService;
  private readonly askService: LibraryAskService;
  private readonly stats: LibraryStatsService;

  constructor(
    store: LibraryStore,
    limits: LibraryLimits = libraryLimitsFromEnv(),
    now: () => number = () => Date.now(),
    writing = false,
  ) {
    this.ctx = createLibraryContext({ store, limits, now, writing });
    this.auth = new LibraryAuthService(this.ctx);
    this.read = new LibraryReadService(this.ctx, this.auth);
    this.media = new LibraryMediaService(this.ctx, this.auth);
    this.stats = new LibraryStatsService(this.ctx, this.auth);
    this.mutate = new LibraryMutateService(this.ctx, this.auth, this.read, this.media, this.stats);
    this.askService = new LibraryAskService(this.ctx, this.auth);
  }

  limitsView() {
    return this.stats.limitsView();
  }

  config(actor: Actor) {
    return this.stats.config(actor);
  }

  ownerCounts(actor: Actor): Promise<Record<string, number>> {
    return this.stats.ownerCounts(actor);
  }

  catalog(actor: Actor, q?: string, page = 1, pageSize = 10) {
    return this.read.catalog(actor, q, page, pageSize);
  }

  list(actor: Actor, view: LibraryView, parentId?: string | null, q?: string, flat = false, page = 1, pageSize?: number, status = 'all', fileType?: string, owner?: string, agent = false) {
    return this.read.list(actor, view, parentId, q, flat, page, pageSize, status, fileType, owner, agent);
  }

  searchQuotes(actor: Actor, rawQuery: string) {
    return this.read.searchQuotes(actor, rawQuery);
  }

  createFolder(actor: Actor, name: string, parentId?: string | null, options: CreationOptions = {}) {
    return this.mutate.createFolder(actor, name, parentId, options);
  }

  createOwnedFolder(actor: Actor, ownerUserId: string, name: string, parentId?: string | null, requestedScope?: LibraryScope): Promise<LibraryItem> {
    return this.mutate.createOwnedFolder(actor, ownerUserId, name, parentId, requestedScope);
  }

  createLink(actor: Actor, name: string, url: string, parentId?: string | null, options: CreationOptions = {}): Promise<LibraryItem> {
    return this.mutate.createLink(actor, name, url, parentId, options);
  }

  upload(actor: Actor, input: UploadInput) {
    return this.mutate.upload(actor, input);
  }

  uploadOwned(actor: Actor, ownerUserId: string, input: UploadInput) {
    return this.mutate.uploadOwned(actor, ownerUserId, input);
  }

  replaceVersion(actor: Actor, nodeId: string, originalName: string, mimeType: string, bytes: Buffer): Promise<LibraryItem> {
    return this.mutate.replaceVersion(actor, nodeId, originalName, mimeType, bytes);
  }

  rename(actor: Actor, nodeId: string, name: string): Promise<LibraryItem> {
    return this.mutate.rename(actor, nodeId, name);
  }

  move(actor: Actor, nodeId: string, parentId: string | null, options: MoveOptions = {}): Promise<LibraryItem> {
    return this.mutate.move(actor, nodeId, parentId, options);
  }

  scopeImpact(actor: Actor, nodeId: string, scope: LibraryScope): Promise<ScopeImpact> {
    return this.mutate.scopeImpact(actor, nodeId, scope);
  }

  setScope(actor: Actor, nodeId: string, scope: LibraryScope, confirmShare?: boolean, options: ScopeOptions = {}): Promise<LibraryItem> {
    return this.mutate.setScope(actor, nodeId, scope, confirmShare, options);
  }

  recycle(actor: Actor, nodeId: string): Promise<{ ok: boolean }> {
    return this.mutate.recycle(actor, nodeId);
  }

  restore(actor: Actor, nodeId: string): Promise<LibraryItem> {
    return this.mutate.restore(actor, nodeId);
  }

  purge(actor: Actor, nodeId: string): Promise<{ ok: boolean; code: 'SOURCE_GONE' }> {
    return this.mutate.purge(actor, nodeId);
  }

  batch(actor: Actor, ids: string[], action: 'recycle' | 'restore' | 'purge') {
    return this.mutate.batch(actor, ids, action);
  }

  retryParse(actor: Actor, nodeId: string) {
    return this.media.retryParse(actor, nodeId);
  }

  preview(actor: Actor, nodeId: string, versionId?: string | null) {
    return this.media.preview(actor, nodeId, versionId);
  }

  download(actor: Actor, nodeId: string, versionId?: string | null, inline = false) {
    return this.media.download(actor, nodeId, versionId, inline);
  }

  versions(actor: Actor, nodeId: string) {
    return this.read.versions(actor, nodeId);
  }

  openCitation(actor: Actor, nodeId: string, versionId: string, locator?: string | null, recordAccess = true) {
    return this.askService.openCitation(actor, nodeId, versionId, locator, recordAccess);
  }

  readRetrievalVersion(actor: Actor, nodeId: string, versionId: string) {
    return this.askService.readRetrievalVersion(actor, nodeId, versionId);
  }

  markUsed(actor: Actor, nodeId: string, versionId: string) {
    return this.askService.markUsed(actor, nodeId, versionId);
  }

  ask(
    actor: Actor,
    versionIds: string[],
    question: string,
    model: string | undefined,
    complete: ModelComplete,
  ) {
    return this.askService.ask(actor, versionIds, question, model, complete);
  }

  adminStats(actor: { userId: string; isPlatformAdmin: boolean }) {
    return this.stats.adminStats(actor);
  }

  grantCustody(actor: Actor, input: {
    tenantId: string;
    granteeUserId: string;
    contentScope: 'ENTERPRISE' | 'PRIVATE_OWNER';
    ownerUserId?: string | null;
    powers: 'READ' | 'CRUD';
    expiresAt: number;
    reason: string;
  }) {
    return this.auth.grantCustody(actor, input);
  }

  revokeCustody(actor: Actor, custodyId: string) {
    return this.auth.revokeCustody(actor, custodyId);
  }

  managedActor(actor: Pick<Actor, 'userId' | 'isPlatformAdmin'>, custodyId: string): Promise<Actor> {
    return this.auth.managedActor(actor, custodyId);
  }

  listCustody(actor: Actor) {
    return this.auth.listCustody(actor);
  }
}

/**
 * The one construction point for the library domain. Callers pass a context
 * (store + limits + clock + transaction flag) instead of remembering the
 * positional constructor; the positional constructor stays for compatibility.
 */
export function createLibraryService(input: LibraryContextInput): LibraryService {
  return new LibraryService(input.store, input.limits, input.now, input.writing);
}
