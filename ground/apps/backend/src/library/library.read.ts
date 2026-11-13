import type { LibraryAuthService } from './library.auth';
import type { LibraryContext } from './library.context';
import { LibraryError, libraryNotFound } from './library.errors';
import { fileExtension } from './library.files';
import {
  excerptAround,
  libraryFileTypeKey,
  quotableInChat,
  SEARCH_FILES,
  SEARCH_HITS,
  toLibraryItem,
  versionBrief,
  versionStatus,
  VIEWABLE_IMAGE_EXTENSIONS,
} from './library.items';
import { canManage, canSee, matchingCustody } from './library.policy';
import type { Actor, CustodyRecord, LibraryScope, LibraryView, NodeRecord } from './library.types';

export type LibrarySearchHit = {
  nodeId: string;
  versionId: string;
  versionNo: number;
  name: string;
  locator: string;
  locatorKind: 'paragraph' | 'page' | 'image';
  quote: string;
  matched: 'text' | 'name';
  /** PNG、JPEG、WebP 或 GIF。调用方在模型接受图片时再取原图。 */
  image?: true;
};

/** 读与呈现：目录、列表、检索、版本摘要、面包屑。 */
export class LibraryReadService {
  constructor(
    private readonly ctx: LibraryContext,
    private readonly auth: LibraryAuthService,
  ) {}

  rebind(ctx: LibraryContext, auth: LibraryAuthService): LibraryReadService {
    return new LibraryReadService(ctx, auth);
  }

  /** Files the member can see at every depth. Folders stay in the sidebar tree. */
  async catalog(actor: Actor, q?: string, page = 1, pageSize = 10) {
    this.auth.requireTenantActor(actor);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new LibraryError(400, '分页参数无效', 'BAD_PAGE');
    await this.auth.sweep(actor.tenantId);
    const custodies = await this.auth.custodiesFor(actor);
    const nodes = await this.ctx.store.listNodes(actor.tenantId);
    const query = q?.trim().toLowerCase();
    const rows = [];
    for (const node of nodes) {
      if (node.kind !== 'FILE' || node.state !== 'ACTIVE' || !canSee(actor, node, custodies, this.ctx.now())) continue;
      if (query && !node.name.toLowerCase().includes(query)) continue;
      if (await versionStatus(this.ctx, node) === 'FAILED') continue;
      rows.push(node);
    }
    rows.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    const items = [];
    for (const node of rows.slice((page - 1) * pageSize, page * pageSize)) {
      const location = node.ownerUserId === actor.userId ? 'mine' as const : 'shared' as const;
      const item = await toLibraryItem(this.ctx, actor, node, custodies, null);
      item.location = location;
      item.parentPath = this.catalogPath(node, nodes, actor, custodies, location);
      items.push(item);
    }
    return { items, total: rows.length, page, pageSize };
  }

  async list(actor: Actor, view: LibraryView, parentId?: string | null, q?: string, flat = false, page = 1, pageSize?: number, status = 'all', fileType?: string, owner?: string, agent = false) {
    this.auth.requireTenantActor(actor);
    if (view === 'members' && !(actor.isOrgAdmin && actor.activeMember)) {
      throw new LibraryError(403, '只有企业管理员可以查看成员资料', 'FORBIDDEN');
    }
    const memberOwner = view === 'members' ? owner?.trim() || undefined : undefined;
    await this.auth.sweep(actor.tenantId);
    const custodies = await this.auth.custodiesFor(actor);
    const nodes = await this.ctx.store.listNodes(actor.tenantId);
    let parentScope: LibraryScope | null = null;
    let folderOwner: string | null = null;
    if (parentId) {
      const parent = nodes.find((row) => row.id === parentId) ?? await this.ctx.store.getNode(parentId);
      if (!parent || parent.kind !== 'FOLDER' || parent.state !== 'ACTIVE' || !canSee(actor, parent, custodies, this.ctx.now())) throw libraryNotFound();
      if (memberOwner && parent.ownerUserId !== memberOwner) throw libraryNotFound();
      parentScope = parent.scope;
      folderOwner = parent.ownerUserId;
    }
    const recent = view === 'recent' ? await this.ctx.store.listRecent(actor.userId, actor.tenantId) : [];
    const recentAt = new Map(recent.map((row) => [row.nodeId, row.accessedAt]));
    let rows = nodes.filter((node) => {
      if (view === 'trash') return node.state === 'RECYCLED' && canManage(actor, node, custodies, this.ctx.now());
      if (!canSee(actor, node, custodies, this.ctx.now()) || node.state !== 'ACTIVE') return false;
      if (view === 'mine') return node.ownerUserId === actor.userId;
      if (view === 'shared') return node.scope === 'ENTERPRISE';
      if (view === 'members') return !memberOwner || node.ownerUserId === memberOwner;
      if (view === 'managed') return matchingCustody(actor, node, custodies, this.ctx.now()) !== null;
      return recentAt.has(node.id);
    });
    const query = q?.trim().toLowerCase();
    if (!query && parentId) rows = rows.filter((node) => node.parentId === parentId);
    else if (!query && !flat && (view === 'mine' || view === 'shared' || view === 'members' || view === 'managed')) rows = rows.filter((node) => this.isRootForView(node, nodes, actor, custodies, view, memberOwner));
    if (query) rows = rows.filter((node) => node.name.toLowerCase().includes(query));
    if (agent) {
      const visible: NodeRecord[] = [];
      for (const node of rows) {
        if (node.kind === 'FILE' && await versionStatus(this.ctx, node) === 'FAILED') continue;
        visible.push(node);
      }
      rows = visible;
    }
    if (status === 'uncitable') {
      const matched: NodeRecord[] = [];
      for (const node of rows) {
        if (node.kind === 'FILE' && await versionStatus(this.ctx, node) !== 'READY') matched.push(node);
      }
      rows = matched;
    } else if (status !== 'all') {
      const statuses = status === 'processing' ? ['PENDING', 'PROCESSING'] : [({ ready: 'READY', failed: 'FAILED', download: 'DOWNLOAD_ONLY' } as Record<string, string>)[status]].filter(value => value !== undefined);
      const matched: NodeRecord[] = [];
      for (const node of rows) {
        const version = node.currentVersionId ? await this.ctx.store.getVersion(node.currentVersionId) : null;
        if (node.kind === 'FILE' && version && statuses.includes(version.parseStatus)) matched.push(node);
      }
      rows = matched;
    }
    if (fileType === 'content') rows = rows.filter((node) => node.kind !== 'FOLDER');
    else if (fileType) {
      const matched: NodeRecord[] = [];
      for (const node of rows) {
        const version = node.kind === 'FILE' && node.currentVersionId ? await this.ctx.store.getVersion(node.currentVersionId) : null;
        if (libraryFileTypeKey(node.kind, version?.mimeType) === fileType) matched.push(node);
      }
      rows = matched;
    }
    if (view === 'recent') rows.sort((a, b) => (recentAt.get(b.id) ?? 0) - (recentAt.get(a.id) ?? 0));
    else rows.sort((a, b) => Number(b.kind === 'FOLDER') - Number(a.kind === 'FOLDER') || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    const total = rows.length;
    if (pageSize !== undefined) {
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new LibraryError(400, '分页参数无效', 'BAD_PAGE');
      rows = rows.slice((page - 1) * pageSize, page * pageSize);
    }
    const items = [];
    for (const node of rows) {
      const item = await toLibraryItem(this.ctx, actor, node, custodies, recentAt.get(node.id) ?? null);
      if (flat && (view === 'mine' || view === 'members')) item.parentPath = node.parentId ? await this.breadcrumb(actor, node.parentId, custodies) : [];
      items.push(item);
      if (actor.custodyId) await this.auth.auditCustodyRead(actor, node);
    }
    const breadcrumb = parentId ? await this.breadcrumb(actor, parentId, custodies) : [];
    return { items, breadcrumb, parentScope, total, page, pageSize: pageSize ?? total, ownerUserId: folderOwner };
  }

  /** 按正文或文件名做字面检索。视频和未解析的非图片文件不会出现。可查看的图片按文件名命中，即使没有抽出文字。 */
  async searchQuotes(actor: Actor, rawQuery: string) {
    this.auth.requireMember(actor);
    const query = rawQuery.trim();
    if (query.length < 1 || query.length > 200) throw new LibraryError(400, '检索词需要 1 到 200 个字符', 'BAD_QUERY');
    const needle = query.toLowerCase();
    const nodes = (await this.ctx.store.listNodes(actor.tenantId))
      .filter((node) => quotableInChat(actor, node) && node.currentVersionId)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    const hits: LibrarySearchHit[] = [];
    let examined = 0;
    for (const node of nodes) {
      if (hits.length >= SEARCH_HITS || examined >= SEARCH_FILES) break;
      examined += 1;
      const version = await this.ctx.store.getVersion(node.currentVersionId!);
      if (!version) continue;
      const viewable = (version.parseStatus === 'READY' || version.parseStatus === 'DOWNLOAD_ONLY')
        && VIEWABLE_IMAGE_EXTENSIONS.has(fileExtension(version.originalName));
      if (!viewable && version.parseStatus !== 'READY') continue;
      const chunks = version.parseStatus === 'READY' ? await this.ctx.store.listChunks(version.id) : [];
      const textHit = chunks.find((row) => row.content.toLowerCase().includes(needle));
      const nameHit = node.name.toLowerCase().includes(needle);
      const source = textHit ?? (nameHit ? chunks[0] : undefined);
      if (!source && !(viewable && nameHit)) continue;
      hits.push({
        nodeId: node.id,
        versionId: version.id,
        versionNo: version.versionNo,
        name: node.name,
        locator: source?.locator ?? 'image',
        locatorKind: source?.locatorKind ?? 'image',
        quote: source ? excerptAround(source.content, needle) : '',
        matched: textHit ? 'text' : 'name',
        ...(viewable ? { image: true as const } : {}),
      });
    }
    return { query, hits, truncated: hits.length >= SEARCH_HITS || examined < nodes.length && examined >= SEARCH_FILES };
  }

  async versions(actor: Actor, nodeId: string) {
    const node = await this.auth.requireVisible(actor, nodeId);
    if (node.kind !== 'FILE') return [];
    const rows = await this.ctx.store.listVersions(node.id);
    return rows.map((row) => versionBrief(row));
  }

  private isRootForView(
    node: NodeRecord,
    nodes: NodeRecord[],
    actor: Actor,
    custodies: CustodyRecord[],
    view: LibraryView,
    owner?: string,
  ) {
    if (!node.parentId) return true;
    const parent = nodes.find((row) => row.id === node.parentId);
    if (!parent || parent.state !== 'ACTIVE' || !canSee(actor, parent, custodies, this.ctx.now())) return true;
    const inView = (row: NodeRecord) => row.state === 'ACTIVE' && canSee(actor, row, custodies, this.ctx.now())
      && (view === 'mine' ? row.ownerUserId === actor.userId : view === 'shared' ? row.scope === 'ENTERPRISE' : view === 'members' && owner ? row.ownerUserId === owner : true);
    if (!inView(parent)) return true;
    // Old/corrupt cyclic metadata must not make an entire component disappear.
    // Expose one deterministic root; client expansion and breadcrumb both stop repeats.
    const visited = [node.id];
    let current: NodeRecord | undefined = parent;
    while (current && inView(current)) {
      const at = visited.indexOf(current.id);
      if (at >= 0) return node.id === visited.slice(at).sort()[0];
      visited.push(current.id);
      current = nodes.find(row => row.id === current?.parentId);
    }
    return false;
  }

  /** Ancestors that actually appear in the destination tree. A shared file under a private folder stays at that tree's root. */
  private catalogPath(node: NodeRecord, nodes: NodeRecord[], actor: Actor, custodies: CustodyRecord[], location: 'mine' | 'shared') {
    const visible = (row: NodeRecord) => row.kind === 'FOLDER' && row.state === 'ACTIVE' && canSee(actor, row, custodies, this.ctx.now())
      && (location === 'mine' ? row.ownerUserId === actor.userId : row.scope === 'ENTERPRISE');
    const items: { id: string; name: string }[] = [];
    const seen = new Set([node.id]);
    let current = nodes.find((row) => row.id === node.parentId);
    while (current && !seen.has(current.id) && visible(current) && items.length < 32) {
      seen.add(current.id);
      items.push({ id: current.id, name: current.name });
      current = nodes.find((row) => row.id === current?.parentId);
    }
    return items.reverse();
  }

  private async breadcrumb(actor: Actor, parentId: string, custodies: CustodyRecord[]) {
    const items: { id: string; name: string }[] = [];
    let current: string | null = parentId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const node = await this.ctx.store.getNode(current);
      if (!node || !canSee(actor, node, custodies, this.ctx.now())) break;
      items.push({ id: node.id, name: node.name });
      current = node.parentId;
    }
    return items.reverse();
  }
}
