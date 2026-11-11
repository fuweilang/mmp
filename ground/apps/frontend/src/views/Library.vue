<template>
  <section class="library-page">
    <div class="page-header">
      <div><h2>{{ viewLabel }}</h2><p>保存原文件与版本；企业共享中新建默认全员可见，目录内新增内容继承可见范围。</p></div>
      <LibraryCustodyApproval />
    </div>
    <div class="library-shell">
    <section class="library-main">
      <header class="library-toolbar">
        <div class="library-path">
          <button type="button" @click="parentId = null">{{ viewLabel }}</button>
          <span v-for="crumb in (view === 'mine' ? [] : breadcrumb)" :key="crumb.id">
            /
            <button type="button" @click="parentId = crumb.id">{{ crumb.name }}</button>
          </span>
        </div>
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索名称"
          class="library-search"
          @clear="keyword = ''"
          @keyup.enter="commitKeyword()"
        />
        <el-button @click="commitKeyword()">搜索</el-button>
        <el-button v-if="keyword" @click="keyword = ''">清除搜索</el-button>
        <el-dropdown trigger="click" :disabled="view === 'trash' || loading">
          <el-button :disabled="view === 'trash' || loading">新建 <ChevronDown :size="16" /></el-button>
          <template #dropdown><el-dropdown-menu><el-dropdown-item @click="openCreate('folder')">新建文件夹</el-dropdown-item><el-dropdown-item @click="openCreate('link')">保存链接</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown>
        <el-button type="primary" :disabled="view === 'trash' || loading" @click="pickUpload">上传文件</el-button>
      </header>

      <p class="library-muted">支持文档、PNG/JPEG/GIF/WebP/AVIF、MP4/WebM/MOV；{{ uploadLimit ? `单文件上限 ${formatBytes(uploadLimit.maxFileBytes)}` : '上传前检查当前大小限制' }}。图片视频仅保存，不代表 AI 可读。</p>
      <p v-if="transferRatio != null" class="library-progress">上传进度 {{ Math.round(transferRatio * 100) }}%。解析状态在列表里单独显示。</p>
      <p v-if="listError" class="library-error">{{ listError }} 已保留当前列表。</p>
      <p v-if="actionError" class="library-error">{{ actionError }}</p>

      <div v-if="selected.length" class="library-batch">
        已选 {{ selected.length }} 项
        <el-button v-if="view !== 'trash'" size="small" @click="runBatch('recycle')">回收</el-button>
        <el-button v-if="view === 'trash'" size="small" @click="runBatch('restore')">恢复</el-button>
        <el-button v-if="view === 'trash'" size="small" type="danger" :disabled="!!batchPurgeBlockedReason" :title="batchPurgeBlockedReason || undefined" @click="runBatch('purge')">彻底删除</el-button>
      </div>

      <el-table v-loading="loading" :data="items" border class="library-table" @selection-change="onSelect">
        <el-table-column type="selection" width="42" />
        <el-table-column label="名称" min-width="220">
          <template #default="{ row }">
            <span v-if="row.kind === 'FOLDER' && view === 'mine'" class="library-folder-name">{{ row.name }}</span>
            <button v-else-if="row.kind === 'FOLDER'" type="button" class="library-name" @click="parentId = row.id">{{ row.name }}</button>
            <button v-else type="button" class="library-name" @click="openPreview(row)">{{ row.name }}</button>
            <span v-if="view === 'mine' && row.parentPath?.length" class="library-muted">所属：{{ libraryParentPath(row) }}</span>
            <span v-if="row.parentHidden" class="library-muted">上级不可见</span>
          </template>
        </el-table-column>
        <el-table-column label="文件类型" width="100"><template #default="{ row }">{{ libraryFileType(row) }}</template></el-table-column>
        <el-table-column label="范围" width="110">
          <template #default="{ row }">{{ row.scope === 'PRIVATE' ? '仅自己' : '企业共享' }}</template>
        </el-table-column>
        <el-table-column label="处理状态" min-width="180">
          <template #default="{ row }">
            <span v-if="row.currentVersion">{{ statusLabel(row.currentVersion.parseStatus) }}</span>
            <span v-else-if="row.kind === 'LINK'">{{ statusLabel('NOT_APPLICABLE') }}</span>
            <span v-else>—</span>
            <span v-if="row.currentVersion?.parseReason" class="library-muted">{{ row.currentVersion.parseReason }}</span>
            <span v-if="view === 'trash' && purgeBlockedReason(row)" class="library-muted">{{ purgeBlockedReason(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="90">
          <template #default="{ row }">{{ row.currentVersion ? formatBytes(row.currentVersion.sizeBytes) : '—' }}</template>
        </el-table-column>
        <el-table-column label="更新" width="160">
          <template #default="{ row }">{{ formatDateTime(row.accessedAt || row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right" align="center">
          <template #default="{ row }">
            <el-button v-if="row.kind !== 'FOLDER'" text type="primary" @click="openPreview(row)">预览</el-button>
            <el-dropdown v-if="row.canManage" trigger="click">
              <el-button text type="primary">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="rename(row)">重命名</el-dropdown-item>
                  <el-dropdown-item v-if="view !== 'trash'" @click="move(row)">移动</el-dropdown-item>
                  <el-dropdown-item v-if="row.kind === 'FILE' && view !== 'trash'" @click="startReplace(row)">替换新版本</el-dropdown-item>
                  <el-dropdown-item v-if="row.scope === 'PRIVATE' && view !== 'trash'" @click="share(row)">改为企业共享</el-dropdown-item>
                  <el-dropdown-item v-if="row.scope === 'ENTERPRISE'" @click="unshare(row)">改回私人</el-dropdown-item>
                  <el-dropdown-item v-if="row.currentVersion?.parseStatus === 'FAILED'" @click="retry(row)">重试解析</el-dropdown-item>
                  <el-dropdown-item v-if="view !== 'trash'" @click="recycleOne(row)">回收</el-dropdown-item>
                  <el-dropdown-item v-if="view === 'trash'" @click="restoreOne(row)">恢复</el-dropdown-item>
                  <el-dropdown-item v-if="view === 'trash'" :disabled="!!purgeBlockedReason(row)" :title="purgeBlockedReason(row) || undefined" @click="purgeOne(row)">彻底删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="emptyText">
            <el-button v-if="!keyword && view !== 'trash'" type="primary" @click="pickUpload">上传文件</el-button>
            <el-button v-if="keyword" @click="keyword = ''">清除搜索</el-button>
          </el-empty>
        </template>
      </el-table>

      <el-pagination v-if="total > 20" v-model:current-page="page" :page-size="20" :total="total" layout="prev, pager, next" />
    </section>

    </div>
    <LibraryUploadDialog v-if="uploadOpen" :title="replaceTarget ? '替换资料版本' : '上传资料'" :multiple="!replaceTarget" :accept="accept" :hint="replaceTarget ? '沿用原文件的可见范围。' : targetHint(uploadTarget)" :load-limits="libraryConfig" :upload-file="uploadOne" @close="uploadOpen = false" @complete="onUploadComplete" />
    <el-dialog v-model="moveOpen" title="移动资料" width="420px" align-center append-to-body class="library-modal">
      <p>移入共享目录时需确认共享该资料及全部子项；移出后保留当前可见范围。</p>
      <el-select v-model="moveParent" clearable placeholder="根目录">
        <el-option v-for="folder in moveFolders" :key="folder.id" :label="folder.name" :value="folder.id" />
      </el-select>
      <template #footer><el-button @click="moveOpen = false">取消</el-button><el-button type="primary" @click="confirmMove">移动</el-button></template>
    </el-dialog>
    <el-dialog v-model="folderOpen" title="新建文件夹" width="420px" align-center append-to-body class="library-modal">
      <el-input v-model="folderName" placeholder="文件夹名称" />
      <p class="library-muted">{{ targetHint(createTarget) }}</p>
      <template #footer>
        <el-button @click="folderOpen = false">取消</el-button>
        <el-button type="primary" @click="createFolder">创建</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="linkOpen" title="新建链接" width="420px" align-center append-to-body class="library-modal">
      <el-input v-model="linkName" placeholder="名称" />
      <el-input v-model="linkUrl" placeholder="https://" />
      <p class="library-muted">{{ targetHint(createTarget) }} 只保存网址，不抓取网页。</p>
      <template #footer>
        <el-button @click="linkOpen = false">取消</el-button>
        <el-button type="primary" @click="createLink">保存</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="previewOpen" :title="preview?.name || '预览'" width="720px" align-center append-to-body class="library-modal">
      <p v-if="preview?.highlightNote">{{ preview.highlightNote }}</p>
      <p v-if="preview?.parseReason">{{ preview.parseReason }}</p>
      <p v-if="preview?.truncated" class="library-muted">{{ preview.truncationNote || '预览已截断，可下载原文件查看全文。' }}</p>
      <img v-if="preview?.previewKind === 'image' && preview.versionId" class="library-media" :src="libraryMediaUrl(preview.nodeId, preview.versionId)" :alt="preview.name" />
      <video v-else-if="preview?.previewKind === 'video' && preview.versionId" class="library-media" :src="libraryMediaUrl(preview.nodeId, preview.versionId)" controls preload="metadata" />
      <p v-if="preview?.previewKind === 'image' || preview?.previewKind === 'video'" class="library-muted">如浏览器不支持图片格式或视频编码，请下载原文件查看。</p>
      <pre v-if="preview?.text" class="library-pre">{{ preview.text }}</pre>
      <p v-else-if="preview?.previewKind === 'link'">{{ preview.linkUrl }}</p>
      <p v-else>这里没有可安全预览的正文，可以下载原文件。</p>
      <template #footer><el-button @click="previewOpen = false">关闭</el-button><el-button v-if="preview?.versionId" @click="download(preview.nodeId, preview.versionId)">下载</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next';
import LibraryCustodyApproval from '../components/LibraryCustodyApproval.vue';
import LibraryUploadDialog from '../components/LibraryUploadDialog.vue';
import { useRoute, useRouter } from 'vue-router';
import { consoleLibraryView, consoleLibraryViews } from '../utils/libraryNavigation';
import { libraryFileType, libraryListLocation, libraryParentPath } from '../utils/libraryPresentation';
import '../styles/libraryDialogs.css';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  LibraryParseStatusLabel,
  type LibraryParseStatus,
} from '@mammoth/shared';
import { formatBytes, formatDateTime } from '../utils/format';
import {
  libraryConfig, libraryMediaUrl, libraryScopeImpact,
  batchLibrary,
  createLibraryFolder,
  createLibraryLink,
  libraryDownloadUrl,
  listLibrary,
  moveLibrary,
  libraryFolders,
  previewLibrary,
  purgeLibrary,
  recycleLibrary,
  renameLibrary,
  replaceLibraryFile,
  restoreLibrary,
  retryLibraryParse,
  shareLibrary,
  uploadLibraryFiles,
  type LibraryItem,
  type LibraryPreview,
} from '../api/library';

const uploadLimit = ref<{ maxFileBytes: number; allowedExtensions: string[] }>();
const accept = computed(() => uploadLimit.value?.allowedExtensions.join(',') ?? '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.md,.markdown,.txt,.csv,.html,.htm,.zip,.png,.jpg,.jpeg,.gif,.webp,.avif,.mp4,.webm,.mov');
void libraryConfig().then(value => { uploadLimit.value = value; }).catch(() => undefined);
const route = useRoute();
const router = useRouter();
const view = computed(() => consoleLibraryView(route.path));
const parentId = computed<string | null>({
  get: () => view.value === 'mine' ? null : typeof route.query.folder === 'string' ? route.query.folder : typeof route.query.parentId === 'string' ? route.query.parentId : null,
  set: value => { void router.replace({ query: { ...route.query, folder: value || undefined, parentId: undefined } }); },
});
const breadcrumb = ref<{ id: string; name: string }[]>([]);
const parentScope = ref<'PRIVATE' | 'ENTERPRISE' | null>(null);
type SaveTarget = { parentId: string | null; scope: 'PRIVATE' | 'ENTERPRISE'; name: string };
const createTarget = ref<SaveTarget>({ parentId: null, scope: 'PRIVATE', name: '我的资料' });
const uploadTarget = ref<SaveTarget>({ ...createTarget.value });
function captureTarget(): SaveTarget { return { parentId: parentId.value, scope: parentId.value ? parentScope.value ?? (view.value === 'shared' ? 'ENTERPRISE' : 'PRIVATE') : view.value === 'shared' ? 'ENTERPRISE' : 'PRIVATE', name: breadcrumb.value.at(-1)?.name ?? (view.value === 'shared' ? '企业共享' : '我的资料') }; }
function targetHint(target: SaveTarget) { return `保存到：${target.name}；${target.scope === 'ENTERPRISE' ? '本企业成员可见，新建或上传的内容继承此范围。' : '仅自己可见。'}`; }
function openCreate(kind: 'folder' | 'link') { createTarget.value = captureTarget(); if (kind === 'folder') folderOpen.value = true; else linkOpen.value = true; }
const routeKeyword = computed(() => typeof route.query.q === 'string' ? route.query.q : '');
const keyword = ref(routeKeyword.value);
let keywordTimer: ReturnType<typeof setTimeout> | null = null;
watch(routeKeyword, (value) => { if (keyword.value !== value) keyword.value = value; });
watch(keyword, (value) => {
  if (keywordTimer) clearTimeout(keywordTimer);
  keywordTimer = setTimeout(() => commitKeyword(value), 300);
});
/** 防抖后写回路由；同一关键字不重复 replace。 */
function commitKeyword(value = keyword.value) {
  if (keywordTimer) { clearTimeout(keywordTimer); keywordTimer = null; }
  if (routeKeyword.value === value) return;
  void router.replace({ query: { ...route.query, q: value || undefined } });
}
onBeforeUnmount(() => { if (keywordTimer) clearTimeout(keywordTimer); });
const items = ref<LibraryItem[]>([]);
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const listError = ref('');
const actionError = ref('');
const selected = ref<LibraryItem[]>([]);
const batchPurgeBlockedReason = computed(() => selected.value.map(purgeBlockedReason).find(Boolean) || null);

function purgeBlockedReason(row: LibraryItem): string | null {
  return row.purgeBlockedReason || (row.kind === 'FILE' ? '文件暂不支持彻底删除，可回收或恢复' : null);
}
const transferRatio = ref<number | null>(null);
const uploadOpen = ref(false);
const uploadParent = ref<string | null>(null);
const replaceTarget = ref<string | null>(null);
const moveOpen = ref(false);
const moveTarget = ref<LibraryItem | null>(null);
const moveParent = ref<string | null>(null);
const moveFolders = ref<LibraryItem[]>([]);
const folderOpen = ref(false);
const folderName = ref('');
const linkOpen = ref(false);
const linkName = ref('');
const linkUrl = ref('');
const previewOpen = ref(false);
const preview = ref<LibraryPreview | null>(null);
const viewLabel = computed(() => consoleLibraryViews.find((item) => item.id === view.value)?.label ?? '资料库');
const emptyText = computed(() => (keyword.value ? '没有匹配的资料' : '这里还没有资料'));
let listSequence = 0;
watch([view, parentId, routeKeyword], () => {
  page.value = 1;
  selected.value = [];
  items.value = [];
  breadcrumb.value = [];
  void reload();
}, { immediate: true });

watch(page, () => { selected.value = []; void reload(); });

function statusLabel(status: LibraryParseStatus) {
  if (status === 'READY') return '可供 AI 引用';
  if (status === 'DOWNLOAD_ONLY') return '仅保存';
  if (['PENDING', 'PROCESSING'].includes(status)) return '处理中';
  return LibraryParseStatusLabel[status];
}



async function reload() {
  const sequence = ++listSequence;
  loading.value = true;
  try {
    const location = libraryListLocation(view.value, parentId.value);
    const data = await listLibrary(view.value, location.parentId, keyword.value, page.value, location.flat);
    if (sequence !== listSequence) return;
    const lastPage = Math.max(1, Math.ceil(data.total / 20));
    if (page.value > lastPage) { page.value = lastPage; return; }
    items.value = data.items;
    total.value = data.total;
    breadcrumb.value = data.breadcrumb;
    parentScope.value = data.parentScope ?? null;
    listError.value = '';
  } catch (error) {
    if (sequence !== listSequence) return;
    listError.value = error instanceof Error ? error.message : '列表加载失败';
  } finally {
    if (sequence === listSequence) loading.value = false;
  }
}

function onSelect(rows: LibraryItem[]) {
  selected.value = rows;
}

function pickUpload() { replaceTarget.value = null; uploadTarget.value = captureTarget(); uploadParent.value = uploadTarget.value.parentId; uploadOpen.value = true; }
async function uploadOne(file: File, progress: (ratio: number) => void) {
  if (replaceTarget.value) { await replaceLibraryFile(replaceTarget.value, file); return '新版本已保存；处理状态在列表中显示'; }
  const result = await uploadLibraryFiles([file], uploadTarget.value.parentId, progress, { scope: uploadTarget.value.scope, confirmShare: uploadTarget.value.scope === 'ENTERPRISE' });
  if (result.failed.length || !result.items.length) throw new Error(result.failed.map(row => row.message).join('；') || '未收到保存成功结果');
  return uploadTarget.value.scope === 'ENTERPRISE' ? '已保存，本企业成员可见；处理状态单独显示' : '已保存，仅自己可见；处理状态单独显示';
}
async function onUploadComplete(successes: number) { if (successes > 0) await revealCreated(); }

/** 创建后保留当前目录；最近使用不包含尚未打开的资料，转到我的资料。 */
async function revealCreated() {
  window.dispatchEvent(new Event('mmp:library-changed'));
  if (view.value === 'recent') await router.push({ path: '/console/library/mine' });
  else if (keyword.value) { keyword.value = ''; commitKeyword(''); }
  page.value = 1;
  await reload();
}

async function createFolder() {
  try {
    await createLibraryFolder(folderName.value, createTarget.value.parentId, { scope: createTarget.value.scope, confirmShare: createTarget.value.scope === 'ENTERPRISE' });
    folderOpen.value = false;
    folderName.value = '';
    await revealCreated();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '创建失败';
  }
}

async function createLink() {
  try {
    await createLibraryLink(linkName.value, linkUrl.value, createTarget.value.parentId, { scope: createTarget.value.scope, confirmShare: createTarget.value.scope === 'ENTERPRISE' });
    linkOpen.value = false;
    linkName.value = '';
    linkUrl.value = '';
    await revealCreated();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '保存失败';
  }
}

async function rename(row: LibraryItem) {
  try {
    const result = await ElMessageBox.prompt('新名称', '重命名', { customClass: 'library-message-box', inputValue: row.name });
    await act(() => renameLibrary(row.id, result.value));
  } catch {
    // 取消重命名不改列表。
  }
}

async function move(row: LibraryItem) {
  try {
    moveFolders.value = (await libraryFolders()).filter(item => item.id !== row.id);
    moveTarget.value = row;
    moveParent.value = null;
    moveOpen.value = true;
  } catch (error) { actionError.value = error instanceof Error ? error.message : '读取文件夹失败'; }
}
async function confirmMove() {
  if (!moveTarget.value) return;
  try {
    const options: { confirmShare?: boolean; expectedTreeRevision?: string } = {};
    if (moveFolders.value.find(folder => folder.id === moveParent.value)?.scope === 'ENTERPRISE') {
      const impact = await libraryScopeImpact(moveTarget.value.id, 'ENTERPRISE');
      if (impact.changed && !await confirmAction(`移入后该资料及全部子项会企业共享，共涉及 ${impact.total} 项。`, '确认移动并共享')) return;
      options.confirmShare = true; options.expectedTreeRevision = impact.treeRevision;
    }
    await act(() => moveLibrary(moveTarget.value!.id, moveParent.value, options));
  } catch (error) { actionError.value = error instanceof Error ? error.message : '移动失败'; return; }
  if (!actionError.value) moveOpen.value = false;
}

function startReplace(row: LibraryItem) {
  replaceTarget.value = row.id;
  uploadParent.value = parentId.value; uploadOpen.value = true;
}

async function confirmAction(message: string, title: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, { customClass: 'library-message-box' });
    return true;
  } catch {
    return false;
  }
}

async function changeScope(row: LibraryItem, scope: 'PRIVATE' | 'ENTERPRISE') {
  try {
    const impact = await libraryScopeImpact(row.id, scope);
    const message = scope === 'ENTERPRISE'
      ? `该资料及全部子文件夹和文件会一起共享，本企业成员可见，共涉及 ${impact.total} 项。`
      : `该资料及全部子文件夹和文件会改为各自所有者私有，共涉及 ${impact.total} 项。`;
    if (!await confirmAction(message, scope === 'ENTERPRISE' ? '确认共享' : '确认取消共享')) return;
    await act(() => shareLibrary(row.id, scope, scope === 'ENTERPRISE', { confirmUnshare: scope === 'PRIVATE', expectedTreeRevision: impact.treeRevision }));
  } catch (error) { actionError.value = error instanceof Error ? error.message : '范围变更失败'; }
}
async function share(row: LibraryItem) { await changeScope(row, 'ENTERPRISE'); }
async function unshare(row: LibraryItem) { await changeScope(row, 'PRIVATE'); }

async function retry(row: LibraryItem) {
  await act(() => retryLibraryParse(row.id));
}

async function recycleOne(row: LibraryItem) {
  await act(() => recycleLibrary(row.id));
}

async function restoreOne(row: LibraryItem) {
  await act(() => restoreLibrary(row.id));
}

async function purgeOne(row: LibraryItem) {
  const blockedReason = purgeBlockedReason(row);
  if (blockedReason) { actionError.value = blockedReason; return; }
  if (!await confirmAction('彻底删除后，旧引用会显示来源不可用，不会改指向其它版本。', '彻底删除')) return;
  await act(() => purgeLibrary(row.id));
}

async function runBatch(action: 'recycle' | 'restore' | 'purge') {
  if (action === 'purge' && batchPurgeBlockedReason.value) { actionError.value = batchPurgeBlockedReason.value; return; }
  if (action === 'purge' && !await confirmAction('彻底删除后不能再下载这些版本。', '彻底删除')) return;
  try {
    const result = await batchLibrary(selected.value.map((row) => row.id), action);
    if (result.skipped) ElMessage.warning(`${result.skipped} 项当前不可见，已跳过`);
    if (result.failed.length) actionError.value = result.failed.map((row) => row.message).join('；');
    await reload();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '批量操作失败';
  }
}

async function act(work: () => Promise<unknown>) {
  try {
    await work();
    window.dispatchEvent(new Event('mmp:library-changed'));
    actionError.value = '';
    await reload();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '操作失败';
  }
}

async function openPreview(row: LibraryItem) {
  if (row.kind === 'FOLDER') {
    if (view.value !== 'mine') parentId.value = row.id;
    return;
  }
  try {
    preview.value = null;
    preview.value = await previewLibrary(row.id, row.currentVersion?.id);
    previewOpen.value = true;
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '无法预览';
  }
}

function download(id: string, versionId: string) {
  window.open(libraryDownloadUrl(id, versionId), '_blank', 'noopener');
}

watch(() => route.query.preview, async value => {
  if (typeof value !== 'string' || !value) return;
  preview.value = null;
  try {
    const result = await previewLibrary(value, typeof route.query.version === 'string' ? route.query.version : undefined);
    if (route.query.preview !== value) return;
    preview.value = result; previewOpen.value = true;
  } catch (error) { actionError.value = error instanceof Error ? error.message : '无法预览'; }
}, { immediate: true });
</script>

<style scoped>
.library-page { box-sizing:border-box; min-height:100%; padding:15px; background:#fff; color:var(--el-text-color-primary); }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:16px; }
.page-header h2 { margin:0 0 6px; font-size:20px; color:var(--app-heading-color); }
.page-header p { margin:0; color:var(--el-text-color-secondary); font-size:13px; line-height:1.6; }
.library-shell { min-width:0; }
.library-name,.library-path button { background:none; border:0; color:inherit; cursor:pointer; text-align:left; font:inherit; }
.library-main { min-width:0; }
.library-toolbar,.library-batch { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.library-toolbar { margin-bottom:14px; }
.library-toolbar :deep(.el-button + .el-button),.library-batch :deep(.el-button + .el-button) { margin-left:0; }
.library-path { width:100%; display:flex; gap:6px; align-items:center; min-height:28px; color:var(--el-text-color-secondary); font-size:13px; }
.library-path button { color:var(--el-color-primary); padding:0; }
.library-search { width:220px; }
.library-table { width:100%; }
.library-table :deep(td.el-table__cell) { height:44px; padding:4px 0; }
.library-toolbar :deep(.el-button) { height:32px; border-radius:8px; }
.library-media { width:100%; max-height:55vh; object-fit:contain; border-radius:8px; }
.library-table :deep(th.el-table__cell) { background:var(--el-fill-color-light); font-size:13px; font-weight:600; }
.library-table :deep(.cell),.library-table :deep(.el-button.is-text) { font-size:13px; }
.library-file { display:none; }
.library-progress,.library-error,.library-batch { margin:8px 0 14px; font-size:13px; line-height:1.6; }
.library-error { color:var(--el-color-danger); }
.library-muted { display:block; margin-top:4px; color:var(--el-text-color-secondary); font-size:12px; line-height:1.5; }
.library-name { color:var(--el-color-primary); font-size:13px; padding:0; }
.library-name,.library-folder-name,.library-muted { overflow-wrap:anywhere; }
.library-pre { white-space:pre-wrap; overflow-wrap:anywhere; background:var(--el-fill-color-light); padding:12px; border-radius:8px; font-size:12px; line-height:1.6; }
</style>
