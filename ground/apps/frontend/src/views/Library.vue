<template>
  <main class="library-shell">
    <aside class="library-nav">
      <div class="library-brand">资料库</div>
      <button
        v-for="item in views"
        :key="item.id"
        type="button"
        class="library-nav-item"
        :class="{ active: view === item.id && !parentId }"
        @click="openView(item.id)"
      >
        {{ item.label }}
      </button>
      <RouterLink class="library-back" to="/console/">返回控制台</RouterLink>
    </aside>
    <section class="library-main">
      <LibraryCustodyApproval />
      <header class="library-toolbar">
        <div class="library-path">
          <button type="button" @click="parentId = null">{{ viewLabel }}</button>
          <span v-for="crumb in breadcrumb" :key="crumb.id">
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
          @keyup.enter="reload"
        />
        <el-button @click="reload">搜索</el-button>
        <el-button v-if="keyword" @click="keyword = ''">清除搜索</el-button>
        <el-button :disabled="view === 'trash'" @click="folderOpen = true">新建文件夹</el-button>
        <el-button :disabled="view === 'trash'" @click="linkOpen = true">新建链接</el-button>
        <el-button type="primary" :disabled="view === 'trash'" @click="pickUpload">上传</el-button>
        <input ref="fileInput" class="library-file" type="file" multiple :accept="accept" @change="onFiles" />
      </header>

      <p v-if="transferRatio != null" class="library-progress">上传进度 {{ Math.round(transferRatio * 100) }}%。解析状态在列表里单独显示。</p>
      <p v-if="listError" class="library-error">{{ listError }} 已保留当前列表。</p>
      <p v-if="actionError" class="library-error">{{ actionError }}</p>

      <div v-if="selected.length" class="library-batch">
        已选 {{ selected.length }} 项
        <el-button v-if="view !== 'trash'" size="small" @click="runBatch('recycle')">回收</el-button>
        <el-button v-if="view === 'trash'" size="small" @click="runBatch('restore')">恢复</el-button>
        <el-button v-if="view === 'trash'" size="small" type="danger" @click="runBatch('purge')">彻底删除</el-button>
      </div>

      <el-table v-loading="loading" :data="items" @selection-change="onSelect">
        <el-table-column type="selection" width="42" />
        <el-table-column label="名称" min-width="220">
          <template #default="{ row }">
            <button v-if="row.kind === 'FOLDER'" type="button" class="library-name" @click="parentId = row.id">{{ row.name }}</button>
            <button v-else type="button" class="library-name" @click="openPreview(row)">{{ row.name }}</button>
            <span v-if="row.parentHidden" class="library-muted">上级不可见</span>
          </template>
        </el-table-column>
        <el-table-column label="范围" width="110">
          <template #default="{ row }">{{ row.scope === 'PRIVATE' ? '私人' : '企业共享' }}</template>
        </el-table-column>
        <el-table-column label="解析状态" min-width="180">
          <template #default="{ row }">
            <span v-if="row.currentVersion">{{ statusLabel(row.currentVersion.parseStatus) }}</span>
            <span v-else-if="row.kind === 'LINK'">{{ statusLabel('NOT_APPLICABLE') }}</span>
            <span v-else>—</span>
            <span v-if="row.currentVersion?.parseReason" class="library-muted">{{ row.currentVersion.parseReason }}</span>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="90">
          <template #default="{ row }">{{ row.currentVersion ? formatBytes(row.currentVersion.sizeBytes) : '—' }}</template>
        </el-table-column>
        <el-table-column label="更新" width="160">
          <template #default="{ row }">{{ formatDateTime(row.accessedAt || row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button text @click="openPreview(row)">预览</el-button>
            <el-dropdown v-if="row.canManage" trigger="click">
              <el-button text>更多</el-button>
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
                  <el-dropdown-item v-if="view === 'trash'" @click="purgeOne(row)">彻底删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="emptyText">
            <el-button v-if="!keyword && view !== 'trash'" type="primary" @click="pickUpload">上传</el-button>
            <el-button v-if="keyword" @click="keyword = ''">清除搜索</el-button>
          </el-empty>
        </template>
      </el-table>

    </section>

    <el-dialog v-model="moveOpen" title="移动资料" width="420px">
      <p>移动不改变私人或共享范围。</p>
      <el-select v-model="moveParent" clearable placeholder="根目录">
        <el-option v-for="folder in moveFolders" :key="folder.id" :label="folder.name" :value="folder.id" />
      </el-select>
      <template #footer><el-button @click="moveOpen = false">取消</el-button><el-button type="primary" @click="confirmMove">移动</el-button></template>
    </el-dialog>
    <el-dialog v-model="folderOpen" title="新建文件夹" width="420px">
      <el-input v-model="folderName" placeholder="文件夹名称" />
      <p class="library-muted">新建文件夹默认私人。移动它不会改变里面资料的可见性。</p>
      <template #footer>
        <el-button @click="folderOpen = false">取消</el-button>
        <el-button type="primary" @click="createFolder">创建</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="linkOpen" title="新建链接" width="420px">
      <el-input v-model="linkName" placeholder="名称" />
      <el-input v-model="linkUrl" placeholder="https://" />
      <p class="library-muted">只保存网址，不会抓取网页，也不是匿名公开链。</p>
      <template #footer>
        <el-button @click="linkOpen = false">取消</el-button>
        <el-button type="primary" @click="createLink">保存</el-button>
      </template>
    </el-dialog>
    <el-drawer v-model="previewOpen" :title="preview?.name || '预览'" size="420px">
      <p v-if="preview?.highlightNote">{{ preview.highlightNote }}</p>
      <p v-if="preview?.parseReason">{{ preview.parseReason }}</p>
      <pre v-if="preview?.text" class="library-pre">{{ preview.text }}</pre>
      <p v-else-if="preview?.previewKind === 'link'">{{ preview.linkUrl }}</p>
      <p v-else>这里没有可安全预览的正文，可以下载原文件。</p>
      <el-button v-if="preview?.versionId" @click="download(preview.nodeId, preview.versionId)">下载</el-button>
    </el-drawer>
  </main>
</template>

<script setup lang="ts">
import LibraryCustodyApproval from '../components/LibraryCustodyApproval.vue';
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  LibraryParseStatusLabel,
  type LibraryParseStatus,
} from '@mammoth/shared';
import { formatBytes, formatDateTime } from '../utils/format';
import {
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
  type LibraryView,
} from '../api/library';

const views: { id: LibraryView; label: string }[] = [
  { id: 'recent', label: '最近' },
  { id: 'mine', label: '我的资料' },
  { id: 'shared', label: '企业共享' },
  { id: 'trash', label: '回收站' },
];
const accept = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.md,.markdown,.txt,.csv,.html,.htm,.zip';
const view = ref<LibraryView>('mine');
const parentId = ref<string | null>(null);
const breadcrumb = ref<{ id: string; name: string }[]>([]);
const keyword = ref('');
const items = ref<LibraryItem[]>([]);
const loading = ref(false);
const listError = ref('');
const actionError = ref('');
const selected = ref<LibraryItem[]>([]);
const transferRatio = ref<number | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
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
const viewLabel = computed(() => views.find((item) => item.id === view.value)?.label ?? '资料库');
const emptyText = computed(() => (keyword.value ? '没有匹配的资料' : '这里还没有资料'));
watch([view, parentId, keyword], () => {
  void reload();
}, { immediate: true });

function statusLabel(status: LibraryParseStatus) {
  return LibraryParseStatusLabel[status];
}

function openView(next: LibraryView) {
  parentId.value = null;
  view.value = next;
}

let listSequence = 0;
async function reload() {
  const sequence = ++listSequence;
  loading.value = true;
  try {
    const data = await listLibrary(view.value, view.value === 'recent' || view.value === 'trash' ? null : parentId.value, keyword.value);
    if (sequence !== listSequence) return;
    items.value = data.items;
    breadcrumb.value = data.breadcrumb;
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

function pickUpload() {
  replaceTarget.value = null;
  fileInput.value?.click();
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (!files.length) return;
  if (replaceTarget.value) {
    try {
      await replaceLibraryFile(replaceTarget.value, files[0]!);
      actionError.value = '';
      await reload();
    } catch (error) {
      actionError.value = error instanceof Error ? error.message : '替换失败';
    }
    replaceTarget.value = null;
    return;
  }
  transferRatio.value = 0;
  try {
    const result = await uploadLibraryFiles(files, parentId.value, (ratio) => {
      transferRatio.value = ratio;
    });
    if (result.failed.length) actionError.value = result.failed.map((row) => `${row.name}：${row.message}`).join('；');
    else actionError.value = '';
    await reload();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '上传失败';
  } finally {
    transferRatio.value = null;
  }
}

async function createFolder() {
  try {
    await createLibraryFolder(folderName.value, parentId.value);
    folderOpen.value = false;
    folderName.value = '';
    view.value = 'mine';
    await reload();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '创建失败';
  }
}

async function createLink() {
  try {
    await createLibraryLink(linkName.value, linkUrl.value, parentId.value);
    linkOpen.value = false;
    linkName.value = '';
    linkUrl.value = '';
    await reload();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '保存失败';
  }
}

async function rename(row: LibraryItem) {
  try {
    const result = await ElMessageBox.prompt('新名称', '重命名', { inputValue: row.name });
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
  await act(() => moveLibrary(moveTarget.value!.id, moveParent.value));
  if (!actionError.value) moveOpen.value = false;
}

function startReplace(row: LibraryItem) {
  replaceTarget.value = row.id;
  fileInput.value?.click();
}

async function share(row: LibraryItem) {
  await ElMessageBox.confirm('这会变成企业共享，本企业成员都能看到。此操作不会因为移动文件夹而自动发生。', '确认共享');
  await act(() => shareLibrary(row.id, 'ENTERPRISE', true));
}

async function unshare(row: LibraryItem) {
  await act(() => shareLibrary(row.id, 'PRIVATE', false));
}

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
  await ElMessageBox.confirm('彻底删除后，旧引用会显示来源不可用，不会改指向其它版本。', '彻底删除');
  await act(() => purgeLibrary(row.id));
}

async function runBatch(action: 'recycle' | 'restore' | 'purge') {
  if (action === 'purge') {
    await ElMessageBox.confirm('彻底删除后不能再下载这些版本。', '彻底删除');
  }
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
    actionError.value = '';
    await reload();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '操作失败';
  }
}

async function openPreview(row: LibraryItem) {
  if (row.kind === 'FOLDER') {
    parentId.value = row.id;
    return;
  }
  try {
    preview.value = await previewLibrary(row.id, row.currentVersion?.id);
    previewOpen.value = true;
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '无法预览';
  }
}

function download(id: string, versionId: string) {
  window.open(libraryDownloadUrl(id, versionId), '_blank', 'noopener');
}

</script>

<style scoped>
.library-shell { display: grid; grid-template-columns: 190px 1fr; min-height: 100vh; background: var(--app-page-bg); color: var(--app-heading-color); }
.library-nav { background: #fff; border-right: 1px solid var(--app-border-color); padding: 16px 12px; display: flex; flex-direction: column; gap: 6px; }
.library-brand { color: var(--app-primary-color); font-weight: 600; margin-bottom: 12px; }
.library-nav-item, .library-name, .library-path button, .library-cite { background: none; border: 0; color: inherit; cursor: pointer; text-align: left; }
.library-nav-item { padding: 8px 10px; }
.library-nav-item.active { background: var(--app-primary-light-color); color: var(--app-primary-color); }
.library-back { margin-top: auto; color: var(--app-primary-color); font-size: 13px; }
.library-main { padding: 16px 20px 40px; }
.library-toolbar, .library-batch, .library-ask-head, .library-chips, .library-draft { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.library-toolbar { margin-bottom: 12px; }
.library-search { width: 220px; }
.library-file { display: none; }
.library-progress, .library-error { margin: 8px 0; }
.library-error { color: #b42318; }
.library-muted { color: var(--app-text-color); margin-left: 8px; font-size: 12px; }
.library-name { color: var(--app-primary-color); }
.library-ask, .library-drafts { margin-top: 20px; background: #fff; border: 1px solid var(--app-border-color); padding: 12px; }
.library-pre { white-space: pre-wrap; background: var(--app-page-bg); padding: 8px; }
.library-cite { display: block; color: var(--app-primary-color); margin-top: 6px; }
.library-pick { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; }
</style>
