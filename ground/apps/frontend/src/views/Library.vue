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
      <p v-if="listError" class="library-error">{{ listError }} 已保留当前列表和提问内容。</p>
      <p v-if="actionError" class="library-error">{{ actionError }}</p>

      <div v-if="selected.length" class="library-batch">
        已选 {{ selected.length }} 项
        <el-button v-if="view !== 'trash'" size="small" @click="useSelected">用于 AI 对话</el-button>
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

      <section v-if="drafts.length" class="library-drafts">
        <h3>未入库的本地文件</h3>
        <p>这些文件只在本次页面里，不会自动进入资料库，也不会默认共享。</p>
        <div v-for="draft in drafts" :key="draft.localId" class="library-draft">
          <span>{{ draft.name }}</span>
          <el-button size="small" @click="saveDraft(draft)">保存到资料库</el-button>
        </div>
      </section>

      <section class="library-ask">
        <div class="library-ask-head">
          <strong>向选中资料提问</strong>
          <el-button size="small" @click="pickerOpen = true">从资料库选择</el-button>
          <el-button size="small" @click="stageLocal">添加本地文件</el-button>
          <input ref="localInput" class="library-file" type="file" multiple @change="onLocal" />
        </div>
        <div class="library-chips">
          <el-tag v-for="chip in chips" :key="chip.versionId" closable @close="chips = chips.filter((item) => item.versionId !== chip.versionId)">
            {{ chip.name }} · 版本 {{ chip.versionNo }}
          </el-tag>
          <span v-if="!chips.length" class="library-muted">还没有选中资料。确认选择后会停在这里，不会自动发送。</span>
        </div>
        <el-input v-model="question" type="textarea" :rows="3" placeholder="输入问题后再发送" />
        <el-button type="primary" :disabled="!chips.length || !question.trim() || asking" @click="send">发送</el-button>
        <div v-if="answer" class="library-answer">
          <p v-if="answer.status === 'model_unconfigured'">没有可用的云端模型，本次没有生成回答。</p>
          <p v-else-if="answer.status === 'no_evidence'">没有可用于回答的正文。</p>
          <p v-else>{{ answer.answer }}</p>
          <p v-if="answer.truncationNote">{{ answer.truncationNote }}</p>
          <p v-for="notice in answer.notices" :key="notice">{{ notice }}</p>
          <p v-if="answer.modelRef">模型 {{ answer.modelRef }}{{ answer.modelVerified ? '' : '（未核验）' }}</p>
          <button
            v-for="citation in answer.citations"
            :key="citation.marker"
            type="button"
            class="library-cite"
            @click="openCitation(citation)"
          >
            {{ citation.marker }} {{ citation.name }} 版本 {{ citation.versionNo }} {{ citation.locator }}
          </button>
        </div>
      </section>
    </section>

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
      <el-button v-if="preview?.versionId && preview.parseStatus === 'READY'" @click="usePreview">用于 AI 对话</el-button>
    </el-drawer>
    <el-dialog v-model="sourceOpen" title="引用来源" width="520px">
      <p>{{ source?.name }} · 版本 {{ source?.versionNo }} · {{ source?.locator || '无定位' }}</p>
      <p>{{ source?.highlightNote }}</p>
      <pre v-if="source?.quote" class="library-pre">{{ source.quote }}</pre>
    </el-dialog>
    <el-dialog v-model="pickerOpen" title="从资料库选择" width="720px">
      <el-radio-group v-model="pickerView">
        <el-radio-button value="recent">最近</el-radio-button>
        <el-radio-button value="mine">我的资料</el-radio-button>
        <el-radio-button value="shared">企业共享</el-radio-button>
      </el-radio-group>
      <el-input v-model="pickerQuery" placeholder="搜索名称" clearable />
      <div v-for="row in pickerRows" :key="row.id" class="library-pick">
        <el-checkbox :model-value="pickerIds.includes(versionOf(row))" :disabled="block(row).disabled" @change="togglePick(row)">
          {{ row.name }}
        </el-checkbox>
        <span class="library-muted">{{ block(row).reason || statusLabel(row.currentVersion?.parseStatus || 'NOT_APPLICABLE') }}</span>
      </div>
      <template #footer>
        <el-button @click="pickerOpen = false">取消</el-button>
        <el-button type="primary" @click="confirmPick">确认选择</el-button>
      </template>
    </el-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  LibraryParseStatusLabel,
  confirmLibrarySelection,
  libraryPickBlock,
  stageLocalFiles,
  type LibraryChip,
  type LibraryParseStatus,
  type LocalDraftFile,
} from '@mammoth/shared';
import { formatBytes, formatDateTime } from '../utils/format';
import {
  askLibrary,
  batchLibrary,
  createLibraryFolder,
  createLibraryLink,
  libraryDownloadUrl,
  listLibrary,
  moveLibrary,
  openLibraryCitation,
  previewLibrary,
  purgeLibrary,
  recycleLibrary,
  renameLibrary,
  replaceLibraryFile,
  restoreLibrary,
  retryLibraryParse,
  shareLibrary,
  uploadLibraryFiles,
  type LibraryAnswer,
  type LibraryItem,
  type LibraryPreview,
  type LibrarySource,
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
const localInput = ref<HTMLInputElement | null>(null);
const replaceTarget = ref<string | null>(null);
const drafts = ref<LocalDraftFile[]>([]);
const draftFiles = ref<File[]>([]);
const chips = ref<LibraryChip[]>([]);
const question = ref('');
const asking = ref(false);
const answer = ref<LibraryAnswer | null>(null);
const folderOpen = ref(false);
const folderName = ref('');
const linkOpen = ref(false);
const linkName = ref('');
const linkUrl = ref('');
const previewOpen = ref(false);
const preview = ref<LibraryPreview | null>(null);
const sourceOpen = ref(false);
const source = ref<LibrarySource | null>(null);
const pickerOpen = ref(false);
const pickerView = ref<LibraryView>('mine');
const pickerQuery = ref('');
const pickerItems = ref<LibraryItem[]>([]);
const pickerIds = ref<string[]>([]);

const viewLabel = computed(() => views.find((item) => item.id === view.value)?.label ?? '资料库');
const emptyText = computed(() => (keyword.value ? '没有匹配的资料' : '这里还没有资料'));
const pickerRows = computed(() => {
  const q = pickerQuery.value.trim().toLowerCase();
  return pickerItems.value.filter((row) => !q || row.name.toLowerCase().includes(q));
});

watch([view, parentId, keyword], () => {
  void reload();
}, { immediate: true });
watch([pickerOpen, pickerView], () => {
  if (pickerOpen.value) void loadPicker();
});

function statusLabel(status: LibraryParseStatus) {
  return LibraryParseStatusLabel[status];
}

function openView(next: LibraryView) {
  parentId.value = null;
  view.value = next;
}

async function reload() {
  const previous = items.value;
  const previousQuestion = question.value;
  loading.value = true;
  try {
    const data = await listLibrary(view.value, view.value === 'recent' || view.value === 'trash' ? null : parentId.value, keyword.value);
    items.value = data.items;
    breadcrumb.value = data.breadcrumb;
    listError.value = '';
  } catch (error) {
    items.value = previous;
    question.value = previousQuestion;
    listError.value = error instanceof Error ? error.message : '列表加载失败';
  } finally {
    loading.value = false;
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

function stageLocal() {
  localInput.value?.click();
}

function onLocal(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  draftFiles.value = files;
  drafts.value = stageLocalFiles(files.map((file) => file.name));
}

async function saveDraft(draft: LocalDraftFile) {
  const file = draftFiles.value[Number(draft.localId.replace('local-', '')) - 1];
  if (!file) return;
  transferRatio.value = 0;
  try {
    await uploadLibraryFiles([file], parentId.value, (ratio) => {
      transferRatio.value = ratio;
    });
    drafts.value = drafts.value.filter((item) => item.localId !== draft.localId);
    await reload();
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '保存失败';
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
    const result = await ElMessageBox.prompt('目标文件夹 ID，留空表示根目录。移动不会改变私人或共享。', '移动');
    await act(() => moveLibrary(row.id, result.value.trim() || null));
  } catch {
    // 取消移动不改列表。
  }
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

function versionOf(row: LibraryItem) {
  return row.currentVersion?.id ?? '';
}

function block(row: LibraryItem) {
  return libraryPickBlock({
    id: row.id,
    kind: row.kind,
    name: row.name,
    versionId: row.currentVersion?.id ?? null,
    versionNo: row.currentVersion?.versionNo ?? null,
    parseStatus: row.currentVersion?.parseStatus ?? null,
    parseReason: row.currentVersion?.parseReason ?? null,
  });
}

function chipOf(row: LibraryItem): LibraryChip | null {
  if (!row.currentVersion || block(row).disabled) return null;
  return { nodeId: row.id, versionId: row.currentVersion.id, versionNo: row.currentVersion.versionNo, name: row.name };
}

function useSelected() {
  const picked = selected.value.map(chipOf).filter((chip): chip is LibraryChip => chip != null);
  const next = confirmLibrarySelection(chips.value, picked);
  chips.value = next.chips;
  ElMessage.success('已挂到提问框，尚未发送');
}

function usePreview() {
  if (!preview.value?.versionId || !preview.value.name) return;
  const next = confirmLibrarySelection(chips.value, [{
    nodeId: preview.value.nodeId,
    versionId: preview.value.versionId,
    versionNo: preview.value.versionNo ?? 1,
    name: preview.value.name,
  }]);
  chips.value = next.chips;
  previewOpen.value = false;
}

async function loadPicker() {
  try {
    const data = await listLibrary(pickerView.value, null, pickerQuery.value);
    pickerItems.value = data.items;
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '选择列表加载失败';
  }
}

function togglePick(row: LibraryItem) {
  const id = versionOf(row);
  if (!id || block(row).disabled) return;
  pickerIds.value = pickerIds.value.includes(id) ? pickerIds.value.filter((item) => item !== id) : [...pickerIds.value, id];
}

function confirmPick() {
  const picked = pickerItems.value.map(chipOf).filter((chip): chip is LibraryChip => chip != null && pickerIds.value.includes(chip.versionId));
  chips.value = confirmLibrarySelection(chips.value, picked).chips;
  pickerOpen.value = false;
  pickerIds.value = [];
}

async function send() {
  asking.value = true;
  try {
    answer.value = await askLibrary(chips.value.map((chip) => chip.versionId), question.value.trim());
    actionError.value = '';
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '提问失败';
  } finally {
    asking.value = false;
  }
}

async function openCitation(citation: LibraryAnswer['citations'][number]) {
  try {
    source.value = await openLibraryCitation(citation.nodeId, citation.versionId, citation.locator);
    sourceOpen.value = true;
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : '来源打不开';
  }
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
