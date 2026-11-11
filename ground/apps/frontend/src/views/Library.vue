<template>
  <section class="library-page">
    <div class="page-header">
      <div><h2>{{ heading }}</h2><p>{{ pageIntro }}</p></div>
      <el-button v-if="memberDetail" @click="leaveMember">返回成员</el-button>
    </div>
    <div class="library-shell">
    <aside v-if="showTree" class="library-folders" aria-label="文件夹">
      <button type="button" class="library-folder-root" :class="{ 'is-current': !parentId }" @click="selectFolder(null)">{{ treeRootLabel }}</button>
      <el-tree :key="treeKey" :data="pageTree" node-key="id" :current-node-key="parentId || undefined" highlight-current default-expand-all :expand-on-click-node="false" @node-click="onTreeFolder" />
    </aside>
    <section class="library-main">
      <template v-if="memberRoster">
        <header class="library-toolbar">
          <el-input v-model="memberQuery" clearable placeholder="搜索姓名或手机号" aria-label="搜索成员" class="library-search" />
        </header>
        <p v-if="listError" class="library-error">{{ listError }}</p>
        <el-table v-loading="loading" :data="visibleMembers" border class="library-table">
          <el-table-column label="姓名" min-width="160" prop="name" />
          <el-table-column label="手机号" min-width="140">
            <template #default="{ row }">{{ row.phone || '—' }}</template>
          </el-table-column>
          <el-table-column label="资料" width="100" prop="itemCount" />
          <el-table-column label="操作" width="120" align="center">
            <template #default="{ row }">
              <el-button text type="primary" @click="openMember(row.userId)">查看资料</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="memberQuery.trim() ? '没有匹配的成员' : '还没有成员'" />
          </template>
        </el-table>
      </template>
      <el-empty v-else-if="unknownMember" description="这位成员不在本企业">
        <el-button @click="leaveMember">返回成员</el-button>
      </el-empty>
      <template v-else>
      <header class="library-toolbar">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索名称"
          class="library-search"
          @clear="keyword = ''"
          @keyup.enter="commitKeyword()"
        />
        <el-select v-if="view === 'mine' || memberDetail" v-model="fileType" class="library-type" filterable clearable placeholder="文件类型" aria-label="文件类型">
          <template v-if="selectedFileType" #prefix><i class="library-type-dot" :style="{ background: selectedFileType.color }" /></template>
          <el-option v-for="option in libraryFileTypeOptions" :key="option.value" :label="option.label" :value="option.value">
            <span class="library-type-option"><i class="library-type-dot" :style="{ background: option.color }" /><span :style="{ color: option.color }">{{ option.label }}</span></span>
          </el-option>
        </el-select>
        <el-select v-model="parseStatus" class="library-status" filterable clearable placeholder="处理状态" aria-label="处理状态">
          <template v-if="selectedParseStatus" #prefix><i class="library-type-dot" :style="{ background: selectedParseStatus.color }" /></template>
          <el-option v-for="option in libraryParseStatusOptions" :key="option.value" :label="option.label" :value="option.value">
            <span class="library-type-option"><i class="library-type-dot" :style="{ background: option.color }" />{{ option.label }}</span>
          </el-option>
        </el-select>
        <el-button type="primary" @click="commitKeyword()">搜索</el-button>
        <el-button @click="clearSearch">重置</el-button>
        <el-button :disabled="view === 'trash' || view === 'members' || loading" @click="openCreate('folder')">新建文件夹</el-button>
        <el-button :disabled="view === 'trash' || view === 'members' || loading" @click="openCreate('link')">新建链接</el-button>
        <el-button type="primary" :disabled="view === 'trash' || view === 'members' || loading" @click="pickUpload">上传文件</el-button>
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

      <el-table v-loading="loading" :data="items" border class="library-table" @selection-change="onSelect">
        <el-table-column type="selection" width="42" />
        <el-table-column label="名称" min-width="220">
          <template #default="{ row }">
            <button v-if="row.kind === 'FOLDER' && (view === 'mine' || view === 'shared' || memberDetail)" type="button" class="library-name" @click="selectFolder(row.id)">{{ row.name }}</button>
            <span v-else-if="row.kind === 'FOLDER'" class="library-folder-name">{{ row.name }}</span>
            <button v-else type="button" class="library-name" @click="openPreview(row)">{{ row.name }}</button>
            <span v-if="(view === 'mine' || memberDetail) && row.parentPath?.length" class="library-muted">所属：{{ libraryParentPath(row) }}</span>
            <span v-if="row.parentHidden" class="library-muted">上级不可见</span>
          </template>
        </el-table-column>
        <el-table-column label="文件类型" width="112"><template #default="{ row }"><span class="library-type-option" :style="{ color: libraryFileTypeColor(libraryFileType(row)) }"><i class="library-type-dot" :style="{ background: libraryFileTypeColor(libraryFileType(row)) }" />{{ libraryFileType(row) }}</span></template></el-table-column>
        <el-table-column label="范围" width="110">
          <template #default="{ row }">{{ row.scope === 'PRIVATE' ? '仅自己' : '企业共享' }}</template>
        </el-table-column>
        <el-table-column v-if="view === 'trash'" label="所有者" min-width="120">
          <template #default="{ row }">{{ row.ownerName || '—' }}</template>
        </el-table-column>
        <el-table-column label="处理状态" min-width="180">
          <template #default="{ row }">
            <span v-if="parseStatusMark(row)" class="library-type-option"><i class="library-type-dot" :style="{ background: parseStatusMark(row)!.color }" />{{ parseStatusMark(row)!.label }}</span>
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
                  <el-dropdown-item v-if="view === 'trash'" @click="purgeOne(row)">彻底删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="emptyText">
            <el-button v-if="!keyword && view !== 'trash' && view !== 'members'" type="primary" @click="pickUpload">上传文件</el-button>
            <el-button v-if="keyword || fileType || parseStatus" @click="clearSearch">重置</el-button>
          </el-empty>
        </template>
      </el-table>

      <el-pagination v-if="view === 'mine' ? total > 0 : total > 20" v-model:current-page="page" class="library-pagination" :page-size="pageSize" :total="total" layout="total, prev, pager, next" />
      </template>
    </section>

    </div>
    <LibraryUploadDialog v-if="uploadOpen" simple :title="replaceTarget ? '替换资料版本' : '上传资料'" :multiple="!replaceTarget" :accept="accept" :hint="replaceTarget ? '沿用原文件的可见范围。' : targetHint(uploadTarget)" :load-limits="libraryConfig" :upload-file="uploadOne" @close="uploadOpen = false" @complete="onUploadComplete" />
    <el-dialog v-model="moveOpen" title="移动资料" width="420px" align-center append-to-body class="library-modal">
      <p>移入共享目录时需确认共享该资料及全部子项；移出后保留当前可见范围。</p>
      <div class="library-move-tree">
        <button type="button" class="library-folder-root" :class="{ 'is-current': !moveParent && moveTarget?.scope === 'PRIVATE' }" :disabled="moveTarget?.scope !== 'PRIVATE'" @click="moveParent = null">我的资料</button>
        <el-tree :data="movePrivateTree" node-key="id" :current-node-key="moveParent || undefined" highlight-current default-expand-all :expand-on-click-node="false" @node-click="onMoveFolder" />
        <button type="button" class="library-folder-root" :class="{ 'is-current': !moveParent && moveTarget?.scope === 'ENTERPRISE' }" :disabled="moveTarget?.scope !== 'ENTERPRISE'" @click="moveParent = null">企业共享</button>
        <el-tree :data="moveEnterpriseTree" node-key="id" :current-node-key="moveParent || undefined" highlight-current default-expand-all :expand-on-click-node="false" @node-click="onMoveFolder" />
      </div>
      <template #footer><el-button @click="moveOpen = false">取消</el-button><el-button type="primary" @click="confirmMove">移动</el-button></template>
    </el-dialog>
    <el-dialog v-model="folderOpen" title="新建文件夹" width="420px" align-center append-to-body class="library-modal">
      <label class="library-field"><span>名称</span><el-input v-model="folderName" /></label>
      <label class="library-field"><span>保存到</span><el-select :model-value="selectedSaveId" class="library-save-to" @update:model-value="onSaveTarget"><el-option v-for="choice in saveChoices" :key="choice.id" :label="choice.label" :value="choice.id" /></el-select></label>
      <p class="library-muted">{{ createTarget.scope === 'ENTERPRISE' ? '本企业成员可见' : '仅自己可见' }}</p>
      <template #footer>
        <el-button @click="folderOpen = false">取消</el-button>
        <el-button type="primary" @click="createFolder">创建</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="linkOpen" title="新建链接" width="420px" align-center append-to-body class="library-modal">
      <label class="library-field"><span>名称</span><el-input v-model="linkName" /></label>
      <label class="library-field"><span>链接</span><el-input v-model="linkUrl" placeholder="https://" /></label>
      <p class="library-muted">只保存网址，不抓取网页。</p>
      <label class="library-field"><span>保存到</span><el-select :model-value="selectedSaveId" class="library-save-to" @update:model-value="onSaveTarget"><el-option v-for="choice in saveChoices" :key="choice.id" :label="choice.label" :value="choice.id" /></el-select></label>
      <p class="library-muted">{{ createTarget.scope === 'ENTERPRISE' ? '本企业成员可见' : '仅自己可见' }}</p>
      <template #footer>
        <el-button @click="linkOpen = false">取消</el-button>
        <el-button type="primary" @click="createLink">保存</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="previewOpen" :title="preview?.name || '预览'" width="720px" align-center append-to-body class="library-modal">
      <p v-if="preview?.parseStatus === 'FAILED' && preview.parseReason">{{ preview.parseReason }}</p>
      <p v-if="preview?.text && preview.truncated && !previewIsPdf" class="library-muted">{{ preview.truncationNote || '预览已截断，可下载原文件查看全文。' }}</p>
      <ul v-if="preview?.entries?.length" class="library-entries">
        <li v-for="entry in preview.entries" :key="entry.name"><span>{{ entry.name }}</span><span>{{ formatBytes(entry.size) }}</span></li>
      </ul>
      <p v-else-if="preview?.entries" class="library-muted">压缩包里没有可列出的文件。</p>
      <img v-if="preview?.previewKind === 'image' && preview.versionId" class="library-media" :src="libraryMediaUrl(preview.nodeId, preview.versionId)" :alt="preview.name" />
      <video v-else-if="preview?.previewKind === 'video' && preview.versionId" class="library-media" :src="libraryMediaUrl(preview.nodeId, preview.versionId)" controls preload="metadata" />
      <iframe v-else-if="pdfUrl" class="library-pdf" :src="pdfUrl" :title="preview?.name || 'PDF'" />
      <pre v-else-if="preview?.text && !previewIsPdf" class="library-pre">{{ preview.text }}</pre>
      <p v-else-if="preview?.previewKind === 'link'">{{ preview.linkUrl }}</p>
      <p v-else-if="preview && !pdfLoading && !preview.entries">{{ pdfError || '这里没有可安全预览的正文，可以下载原文件。' }}</p>
      <template #footer><el-button @click="previewOpen = false">关闭</el-button><el-button v-if="preview?.versionId" type="primary" @click="download(preview.nodeId, preview.versionId)">下载</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import LibraryUploadDialog from '../components/LibraryUploadDialog.vue';
import { useRoute, useRouter } from 'vue-router';
import { consoleLibraryNav, consoleLibraryView } from '../utils/libraryNavigation';
import { getActivePinia } from 'pinia';
import { useAuthStore } from '../stores/auth';
import { libraryFileType, libraryFileTypeColor, libraryFileTypeOptions, libraryFolderLabel, libraryFolderTree, libraryListLocation, libraryParentPath, libraryParseStatusOption, libraryParseStatusOptions, libraryPreviewIsPdf } from '../utils/libraryPresentation';
import '../styles/libraryDialogs.css';
import { computed, h, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  LibraryParseStatusLabel,
  type LibraryParseStatus,
} from '@mammoth/shared';
import { ApiError } from '../api/http';
import { formatBytes, formatDateTime } from '../utils/format';
import {
  libraryConfig, libraryMediaUrl, libraryScopeImpact,
  batchLibrary,
  createLibraryFolder,
  createLibraryLink,
  libraryDownloadUrl,
  listLibrary,
  listLibraryMembers,
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
  type LibraryMemberRow,
  type LibraryPreview,
} from '../api/library';

const uploadLimit = ref<{ maxFileBytes: number; allowedExtensions: string[] }>();
const accept = computed(() => uploadLimit.value?.allowedExtensions.join(',') ?? '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.md,.markdown,.txt,.csv,.html,.htm,.zip,.png,.jpg,.jpeg,.gif,.webp,.avif,.mp4,.webm,.mov');
void libraryConfig().then(value => { uploadLimit.value = value; }).catch(() => undefined);
const route = useRoute();
const router = useRouter();
const view = computed(() => consoleLibraryView(route.path));
const memberId = computed(() => view.value === 'members' && typeof route.query.member === 'string' ? route.query.member : '');
const memberRoster = computed(() => view.value === 'members' && !memberId.value);
const memberDetail = computed(() => view.value === 'members' && Boolean(memberId.value));
const members = ref<LibraryMemberRow[]>([]);
const rosterReady = ref(false);
const memberQuery = ref('');
const currentMember = computed(() => members.value.find((row) => row.userId === memberId.value));
const unknownMember = computed(() => memberDetail.value && rosterReady.value && !currentMember.value);
const visibleMembers = computed(() => {
  const needle = memberQuery.value.trim().toLowerCase();
  const digits = memberQuery.value.replace(/\D/g, '');
  if (!needle) return members.value;
  return members.value.filter((row) => row.name.toLowerCase().includes(needle) || Boolean(digits && row.phone && row.phone.replace(/\D/g, '').includes(digits)));
});
function openMember(userId: string) {
  void router.replace({ query: { member: userId } });
}
function leaveMember() {
  void router.replace({ query: {} });
}
const parentId = computed<string | null>({
  get: () => view.value === 'recent' || view.value === 'trash' ? null : typeof route.query.folder === 'string' ? route.query.folder : typeof route.query.parentId === 'string' ? route.query.parentId : null,
  set: value => { void router.replace({ query: { ...route.query, folder: value || undefined, parentId: undefined } }); },
});
const breadcrumb = ref<{ id: string; name: string }[]>([]);
const parentScope = ref<'PRIVATE' | 'ENTERPRISE' | null>(null);
type SaveTarget = { parentId: string | null; scope: 'PRIVATE' | 'ENTERPRISE'; name: string };
type SaveChoice = { id: string; parentId: string | null; scope: 'PRIVATE' | 'ENTERPRISE'; label: string };
const createTarget = ref<SaveTarget>({ parentId: null, scope: 'PRIVATE', name: '我的资料' });
const saveChoices = ref<SaveChoice[]>([]);
const selectedSaveId = ref('root:PRIVATE');
const uploadTarget = ref<SaveTarget>({ ...createTarget.value });
function captureTarget(): SaveTarget { return { parentId: parentId.value, scope: parentId.value ? parentScope.value ?? (view.value === 'shared' ? 'ENTERPRISE' : 'PRIVATE') : view.value === 'shared' ? 'ENTERPRISE' : 'PRIVATE', name: breadcrumb.value.at(-1)?.name ?? (view.value === 'shared' ? '企业共享' : '我的资料') }; }
function targetHint(target: SaveTarget) { return `保存到：${target.name}；${target.scope === 'ENTERPRISE' ? '本企业成员可见，新建或上传的内容继承此范围。' : '仅自己可见。'}`; }
function rootChoices(): SaveChoice[] {
  return [
    { id: 'root:PRIVATE', parentId: null, scope: 'PRIVATE', label: '我的资料' },
    { id: 'root:ENTERPRISE', parentId: null, scope: 'ENTERPRISE', label: '企业共享' },
  ];
}
function folderChoice(folder: LibraryItem, folders: readonly LibraryItem[]): SaveChoice {
  return { id: folder.id, parentId: folder.id, scope: folder.scope, label: libraryFolderLabel(folder, folders) };
}
function dedupeChoices(choices: SaveChoice[]) {
  const seen = new Set<string>();
  return choices.filter(choice => seen.has(choice.id) ? false : (seen.add(choice.id), true));
}
function onSaveTarget(id: string) {
  const choice = saveChoices.value.find(item => item.id === id);
  if (!choice) return;
  selectedSaveId.value = choice.id;
  createTarget.value = { parentId: choice.parentId, scope: choice.scope, name: choice.label };
}
async function loadSaveFolders(current: SaveChoice) {
  try {
    const folders = (await libraryFolders()).filter(item => item.canManage !== false);
    saveChoices.value = dedupeChoices([current, ...rootChoices(), ...folders.map(folder => folderChoice(folder, folders))]);
  } catch { /* 保留打开时的当前位置 */ }
}
function openCreate(kind: 'folder' | 'link') {
  const current = captureTarget();
  createTarget.value = current;
  const currentChoice: SaveChoice = current.parentId
    ? { id: current.parentId, parentId: current.parentId, scope: current.scope, label: current.name }
    : rootChoices().find(item => item.scope === current.scope)!;
  saveChoices.value = dedupeChoices([currentChoice, ...rootChoices()]);
  selectedSaveId.value = currentChoice.id;
  if (kind === 'folder') folderOpen.value = true; else linkOpen.value = true;
  void loadSaveFolders(currentChoice);
}
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
function clearSearch() {
  fileType.value = undefined;
  parseStatus.value = undefined;
  keyword.value = '';
  commitKeyword('');
}
onBeforeUnmount(() => { if (keywordTimer) clearTimeout(keywordTimer); pdfSequence += 1; clearPdf(); });
const items = ref<LibraryItem[]>([]);
const page = ref(1);
const total = ref(0);
const fileType = ref<string>();
const parseStatus = ref<'ready' | 'failed' | 'download' | 'processing'>();
const selectedFileType = computed(() => libraryFileTypeOptions.find((option) => option.value === fileType.value));
const selectedParseStatus = computed(() => libraryParseStatusOptions.find((option) => option.value === parseStatus.value));
const pageSize = computed(() => view.value === 'mine' ? 10 : 20);
const loading = ref(false);
const listError = ref('');
const actionError = ref('');
const selected = ref<LibraryItem[]>([]);
const transferRatio = ref<number | null>(null);
const uploadOpen = ref(false);
const uploadParent = ref<string | null>(null);
const replaceTarget = ref<string | null>(null);
const moveOpen = ref(false);
const moveTarget = ref<LibraryItem | null>(null);
const moveParent = ref<string | null>(null);
const moveFolders = ref<LibraryItem[]>([]);
const treeFolders = ref<LibraryItem[]>([]);
const treeKey = ref(0);
const showTree = computed(() => view.value === 'mine' || view.value === 'shared' || (memberDetail.value && !unknownMember.value));
const pageTree = computed(() => libraryFolderTree(treeFolders.value, null));
const moveBlocked = computed(() => moveTarget.value?.kind === 'FOLDER' ? descendantFolderIds(moveTarget.value.id, moveFolders.value) : new Set(moveTarget.value ? [moveTarget.value.id] : []));
const movePrivateTree = computed(() => libraryFolderTree(moveFolders.value, 'PRIVATE', moveBlocked.value));
const moveEnterpriseTree = computed(() => libraryFolderTree(moveFolders.value, 'ENTERPRISE', moveBlocked.value));
const folderOpen = ref(false);
const folderName = ref('');
const linkOpen = ref(false);
const linkName = ref('');
const linkUrl = ref('');
const previewOpen = ref(false);
const preview = ref<LibraryPreview | null>(null);
const pdfUrl = ref('');
const pdfLoading = ref(false);
const pdfError = ref('');
const previewIsPdf = computed(() => preview.value ? libraryPreviewIsPdf(preview.value) : false);
let pdfSequence = 0;
function clearPdf() {
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value);
  pdfUrl.value = '';
}
watch(previewOpen, (open) => { if (!open) { pdfSequence += 1; pdfLoading.value = false; pdfError.value = ''; clearPdf(); } });
const viewLabel = computed(() => consoleLibraryNav('OWNER').find((item) => item.id === view.value)?.label ?? '资料库');
const heading = computed(() => memberDetail.value ? currentMember.value?.name || '成员资料' : viewLabel.value);
const treeRootLabel = computed(() => memberDetail.value ? currentMember.value?.name || '资料' : viewLabel.value);
const pageIntro = computed(() => {
  if (memberRoster.value) return '选择一位成员，查看并管理他上传的资料。文件仍属于原上传者。';
  if (memberDetail.value) return `正在查看 ${currentMember.value?.name || '这位成员'} 的资料。文件仍属于这位成员。这里不新建、不上传。`;
  return '保存原文件与版本；企业共享中新建默认全员可见，目录内新增内容继承可见范围。';
});
const memberLibraryAllowed = computed(() => {
  if (!getActivePinia()) return false;
  const current = useAuthStore().session;
  if (!current) return null;
  return current.currentRole === 'ADMIN' || current.currentRole === 'OWNER';
});
const emptyText = computed(() => (keyword.value || fileType.value || parseStatus.value ? '没有匹配的资料' : '这里还没有资料'));
let listSequence = 0;
watch([view, parentId, routeKeyword, memberId, memberLibraryAllowed], () => {
  if (view.value === 'members' && memberLibraryAllowed.value === false) {
    void router.replace('/console/library/mine');
    return;
  }
  if (view.value !== 'members') {
    members.value = [];
    rosterReady.value = false;
    memberQuery.value = '';
  }
  page.value = 1;
  selected.value = [];
  items.value = [];
  breadcrumb.value = [];
  void reload();
}, { immediate: true });

watch(page, () => { selected.value = []; void reload(); });
watch(fileType, () => {
  if (view.value !== 'mine' && !memberDetail.value) return;
  selected.value = [];
  if (page.value !== 1) page.value = 1;
  else void reload();
});
watch(parseStatus, () => {
  selected.value = [];
  if (page.value !== 1) page.value = 1;
  else void reload();
});

function statusLabel(status: LibraryParseStatus) {
  return libraryParseStatusOption(status)?.label ?? LibraryParseStatusLabel[status];
}
function parseStatusMark(row: LibraryItem) {
  const status = row.currentVersion?.parseStatus;
  return status ? libraryParseStatusOption(status) : undefined;
}



async function loadFolderTree(sequence: number) {
  try {
    const folders = await libraryFolders(view.value === 'shared' ? 'shared' : view.value === 'members' ? 'members' : 'mine', view.value === 'members' ? memberId.value || undefined : undefined);
    if (sequence !== listSequence) return;
    treeFolders.value = folders;
    treeKey.value += 1;
  } catch {
    if (sequence !== listSequence) return;
    treeFolders.value = [];
  }
}
async function reload() {
  const sequence = ++listSequence;
  loading.value = true;
  try {
    if (view.value === 'members' && !memberId.value && parentId.value) {
      const located = await listLibrary('members', parentId.value, '', 1, false, 1);
      if (sequence !== listSequence) return;
      if (located.ownerUserId) {
        await router.replace({ query: { ...route.query, member: located.ownerUserId } });
        return;
      }
      listError.value = '找不到这个文件夹对应的成员';
      return;
    }
    if (memberRoster.value) {
      const roster = await listLibraryMembers();
      if (sequence !== listSequence) return;
      members.value = roster.members;
      rosterReady.value = true;
      items.value = [];
      total.value = 0;
      listError.value = '';
      return;
    }
    if (memberDetail.value && !rosterReady.value) {
      const roster = await listLibraryMembers();
      if (sequence !== listSequence) return;
      members.value = roster.members;
      rosterReady.value = true;
    }
    if (memberDetail.value && !members.value.some((row) => row.userId === memberId.value)) {
      items.value = [];
      total.value = 0;
      treeFolders.value = [];
      listError.value = '';
      return;
    }
    const searching = Boolean(keyword.value.trim());
    const location = libraryListLocation(view.value, parentId.value, searching);
    const listedType = (view.value === 'mine' || memberDetail.value) && fileType.value ? fileType.value : showTree.value && !searching ? 'content' : undefined;
    const listedStatus = parseStatus.value;
    const data = await listLibrary(view.value, location.parentId, keyword.value, page.value, location.flat, pageSize.value, listedType, listedStatus, memberDetail.value ? memberId.value : undefined);
    if (sequence !== listSequence) return;
    if (showTree.value) void loadFolderTree(sequence);
    const lastPage = Math.max(1, Math.ceil(data.total / pageSize.value));
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

function onTreeFolder(node: { id: string }) { selectFolder(node.id); }
function onMoveFolder(node: { id: string }) { moveParent.value = node.id; }
function selectFolder(id: string | null) {
  if (keyword.value) {
    keyword.value = '';
    commitKeyword('');
  }
  parentId.value = id;
}
function descendantFolderIds(rootId: string, folders: readonly LibraryItem[]) {
  const blocked = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && blocked.has(folder.parentId) && !blocked.has(folder.id)) {
        blocked.add(folder.id);
        grew = true;
      }
    }
  }
  return blocked;
}
async function move(row: LibraryItem) {
  try {
    moveFolders.value = await libraryFolders(view.value === 'members' ? 'members' : undefined, view.value === 'members' ? memberId.value || undefined : undefined);
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

async function confirmAction(message: string, title: string, confirmButtonText = '确定'): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, { customClass: 'library-message-box', confirmButtonText, cancelButtonText: '取消' });
    return true;
  } catch {
    return false;
  }
}

function listedInsideSharedFolder(row: LibraryItem) {
  return Boolean(parentId.value && parentScope.value === 'ENTERPRISE' && (!row.parentId || row.parentId === parentId.value));
}

function sharedParentNotice(row: LibraryItem) {
  const folderName = (parentId.value && parentScope.value === 'ENTERPRISE' ? breadcrumb.value.at(-1)?.name : undefined) || row.parentName;
  const place = folderName ? `共享文件夹「${folderName}」` : '共享文件夹';
  const whole = folderName ? `请对「${folderName}」点「改回私人」` : '请到该文件夹上点「改回私人」';
  return `「${row.name}」在${place}里，不能单独改回私人。请先用「移动」把它移出该文件夹，再改回私人。若要整个文件夹取消共享，${whole}。`;
}

async function explainSharedParent(row: LibraryItem) {
  actionError.value = '';
  try {
    await ElMessageBox.alert(sharedParentNotice(row), '不能单独改回私人', { customClass: 'library-message-box', confirmButtonText: '知道了' });
  } catch {
    // 关闭说明不改资料范围。
  }
}

function isSharedParentError(error: unknown) {
  return error instanceof ApiError && error.code === 'SHARED_PARENT';
}

async function changeScope(row: LibraryItem, scope: 'PRIVATE' | 'ENTERPRISE') {
  try {
    if (scope === 'PRIVATE' && listedInsideSharedFolder(row)) {
      await explainSharedParent(row);
      return;
    }
    const impact = await libraryScopeImpact(row.id, scope);
    const message = scope === 'ENTERPRISE'
      ? `该资料及全部子文件夹和文件会一起共享，本企业成员可见，共涉及 ${impact.total} 项。`
      : `该资料及全部子文件夹和文件会改为各自所有者私有，共涉及 ${impact.total} 项。`;
    if (!await confirmAction(message, scope === 'ENTERPRISE' ? '确认共享' : '确认取消共享')) return;
    try {
      await shareLibrary(row.id, scope, scope === 'ENTERPRISE', { confirmUnshare: scope === 'PRIVATE', expectedTreeRevision: impact.treeRevision });
    } catch (error) {
      if (scope === 'PRIVATE' && isSharedParentError(error)) {
        await explainSharedParent(row);
        return;
      }
      throw error;
    }
    window.dispatchEvent(new Event('mmp:library-changed'));
    actionError.value = '';
    await reload();
  } catch (error) { actionError.value = error instanceof Error ? error.message : '范围变更失败'; }
}
async function share(row: LibraryItem) { await changeScope(row, 'ENTERPRISE'); }
async function unshare(row: LibraryItem) { await changeScope(row, 'PRIVATE'); }

async function retry(row: LibraryItem) {
  await act(() => retryLibraryParse(row.id));
}

function noticeRecycled() {
  ElMessage({
    type: 'success',
    duration: 6000,
    showClose: true,
    message: h('span', [
      '已放入回收站。',
      h('button', {
        type: 'button',
        class: 'el-button el-button--primary is-link',
        onClick: () => { void router.push('/console/library/trash'); },
      }, '打开回收站'),
    ]),
  });
}

async function recycleOne(row: LibraryItem) {
  if (!await confirmRecycle()) return;
  await act(() => recycleLibrary(row.id));
  if (!actionError.value) noticeRecycled();
}

async function restoreOne(row: LibraryItem) {
  await act(() => restoreLibrary(row.id));
}

async function purgeOne(row: LibraryItem) {
  if (!await confirmAction('彻底删除后，旧引用会显示来源不可用，不会改指向其它版本。', '彻底删除')) return;
  await act(() => purgeLibrary(row.id));
}

function confirmRecycle() {
  return confirmAction('移入回收站后可以恢复。文件夹会连同里面的资料一起回收。', '确认回收', '确认');
}

async function runBatch(action: 'recycle' | 'restore' | 'purge') {
  if (action === 'recycle' && !await confirmRecycle()) return;
  if (action === 'purge' && !await confirmAction('彻底删除后不能再下载这些版本。', '彻底删除')) return;
  try {
    const result = await batchLibrary(selected.value.map((row) => row.id), action);
    if (result.skipped) ElMessage.warning(`${result.skipped} 项当前不可见，已跳过`);
    if (result.failed.length) actionError.value = result.failed.map((row) => row.message).join('；');
    if (action === 'recycle' && result.ok?.length) noticeRecycled();
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

async function showPreview(value: LibraryPreview) {
  const seq = ++pdfSequence;
  clearPdf();
  pdfError.value = '';
  preview.value = value;
  previewOpen.value = true;
  if (!libraryPreviewIsPdf(value) || !value.versionId) return;
  pdfLoading.value = true;
  try {
    const response = await fetch(libraryDownloadUrl(value.nodeId, value.versionId), { credentials: 'include' });
    if (!response.ok) throw new Error('无法打开 PDF 原文件');
    const bytes = await response.arrayBuffer();
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('无法打开 PDF 原文件');
    if (seq !== pdfSequence) return;
    pdfUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  } catch (error) {
    if (seq === pdfSequence) pdfError.value = error instanceof Error ? error.message : '无法打开 PDF 原文件';
  } finally {
    if (seq === pdfSequence) pdfLoading.value = false;
  }
}
async function openPreview(row: LibraryItem) {
  if (row.kind === 'FOLDER') {
    if (view.value === 'mine' || view.value === 'shared') parentId.value = row.id;
    return;
  }
  try {
    await showPreview(await previewLibrary(row.id, row.currentVersion?.id));
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
    await showPreview(result);
  } catch (error) { actionError.value = error instanceof Error ? error.message : '无法预览'; }
}, { immediate: true });
</script>

<style scoped>
.library-page { box-sizing:border-box; flex:1; min-height:0; background:#fff; color:var(--el-text-color-primary); display:flex; flex-direction:column; }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:16px; flex:none; }
.page-header h2 { margin:0 0 6px; font-size:20px; color:var(--app-heading-color); }
.page-header p { margin:0; color:var(--el-text-color-secondary); font-size:13px; line-height:1.6; }
.library-shell { min-width:0; flex:1; min-height:0; display:flex; align-items:stretch; gap:16px; }
.library-folders { width:240px; flex:none; min-height:0; overflow:auto; box-sizing:border-box; padding:12px; background:#fff; border:1px solid var(--app-border-color); border-radius:12px; }
.library-folder-root { display:block; width:100%; margin:0 0 4px; padding:8px 10px; border:0; border-radius:8px; background:transparent; color:var(--app-heading-color); text-align:left; font:inherit; cursor:pointer; }
.library-folder-root:hover { background:#f3f5fb; }
.library-folder-root.is-current { background:var(--app-primary-light-color); color:var(--app-primary-color); font-weight:600; }
.library-folder-root:disabled { color:var(--el-text-color-disabled); cursor:default; background:transparent; }
.library-folders :deep(.el-tree) { background:transparent; color:var(--app-heading-color); }
.library-folders :deep(.el-tree-node__content), .library-move-tree :deep(.el-tree-node__content) { height:36px; border-radius:8px; cursor:pointer; }
.library-folders :deep(.el-tree-node__content:hover) { background:#f3f5fb; }
.library-folders :deep(.el-tree-node.is-current > .el-tree-node__content) { background:var(--app-primary-light-color); color:var(--app-primary-color); font-weight:600; }
.library-move-tree { max-height:50vh; overflow:auto; }
.library-name { background:none; border:0; color:inherit; cursor:pointer; text-align:left; font:inherit; }
.library-main { flex:1; min-width:0; min-height:0; overflow:auto; box-sizing:border-box; padding:16px; background:#fff; border:1px solid var(--app-border-color); border-radius:12px; }
.library-toolbar,.library-batch { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.library-toolbar { margin-bottom:14px; }
.library-toolbar :deep(.el-button + .el-button),.library-batch :deep(.el-button + .el-button) { margin-left:0; }

.library-search { width:220px; }
.library-type { width:160px; }
.library-status { width:180px; }
.library-type-option { display:inline-flex; align-items:center; gap:8px; }
.library-type-dot { width:8px; height:8px; border-radius:50%; flex:none; }
.library-pagination { margin-top:12px; justify-content:flex-end; }
.library-field { display:flex; flex-direction:column; gap:6px; margin:0 0 12px; }
.library-field > span { color:var(--el-text-color-secondary); font-size:13px; }
.library-save-to { width:100%; }
.library-table { width:100%; }
.library-table :deep(td.el-table__cell) { height:44px; padding:4px 0; }
.library-toolbar :deep(.el-button) { height:32px; border-radius:8px; }
.library-media { width:100%; max-height:55vh; object-fit:contain; border-radius:8px; }
.library-pdf { width:100%; height:68vh; border:0; background:#fff; }
.library-table :deep(th.el-table__cell) { background:var(--el-fill-color-light); font-size:13px; font-weight:600; }
.library-table :deep(.cell),.library-table :deep(.el-button.is-text) { font-size:13px; }
.library-file { display:none; }
.library-progress,.library-error,.library-batch { margin:8px 0 14px; font-size:13px; line-height:1.6; }
.library-error { color:var(--el-color-danger); }
.library-muted { display:block; margin-top:4px; color:var(--el-text-color-secondary); font-size:12px; line-height:1.5; }
.library-name { color:var(--el-color-primary); font-size:13px; padding:0; }
.library-name,.library-folder-name,.library-muted { overflow-wrap:anywhere; }
.library-pre { white-space:pre-wrap; overflow-wrap:anywhere; background:var(--el-fill-color-light); padding:12px; border-radius:8px; font-size:12px; line-height:1.6; }
.library-entries { list-style:none; margin:0 0 12px; padding:0; border:1px solid var(--el-border-color-lighter); border-radius:8px; }
.library-entries li { display:flex; justify-content:space-between; gap:12px; padding:8px 12px; font-size:13px; }
.library-entries li + li { border-top:1px solid var(--el-border-color-lighter); }
.library-entries li span:first-child { min-width:0; overflow-wrap:anywhere; }
.library-entries li span:last-child { flex:none; color:var(--el-text-color-secondary); }
</style>
