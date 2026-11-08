<template>
  <section class="knowledge-page">
    <div class="knowledge-toolbar">
      <div class="knowledge-search-wrap">
        <el-input
          v-model="keywordDraft"
          class="knowledge-search"
          clearable
          placeholder="搜索文件名"
          :prefix-icon="Search"
          @clear="onSearchNow"
          @input="onSearchInput"
          @keyup.enter="onSearchNow"
        />
        <el-select v-model="folderFilter" class="folder-filter" clearable placeholder="全部目录" @change="resetPage">
          <el-option label="未分类" value="none" />
          <el-option v-for="folder in folders" :key="folder.id" :label="folder.name" :value="folder.id" />
        </el-select>
        <el-select v-model="statusFilter" class="status-filter" clearable placeholder="全部状态" @change="resetPage">
          <el-option label="待生效" value="PENDING" />
          <el-option label="已生效" value="READY" />
          <el-option label="失败" value="FAILED" />
        </el-select>
      </div>
      <el-button class="toolbar-button" @click="onSearchNow">搜索</el-button>
      <el-button class="toolbar-button" @click="onReset">重置</el-button>
      <div class="knowledge-actions">
        <el-button v-if="isScopeAdmin" :disabled="!hasTenant" @click="openScopes">专家范围</el-button>
        <el-button :disabled="!hasTenant" @click="folderOpen = true">新建目录</el-button>
        <el-button type="primary" :disabled="!hasTenant" @click="openUpload">上传材料</el-button>
      </div>
    </div>

    <el-table
      v-loading="loading"
      :data="pagedRows"
      border
      class="knowledge-table"
      header-cell-class-name="knowledge-table-header"
    >
      <el-table-column label="文件" prop="name" min-width="180" show-overflow-tooltip />
      <el-table-column label="目录" width="120" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.folderName || '未分类' }}
        </template>
      </el-table-column>
      <el-table-column label="大小" width="100">
        <template #default="{ row }">
          {{ formatBytes(row.sizeBytes) }}
        </template>
      </el-table-column>
      <el-table-column label="状态" min-width="170">
        <template #default="{ row }">
          <el-tag size="small" :type="statusType(row.status)">
            {{ statusLabel(row.status) }}
          </el-tag>
          <div v-if="row.indexError">{{ row.indexError }}</div>
        </template>
      </el-table-column>
      <el-table-column label="可见范围" width="110">
        <template #default="{ row }">
          {{ visibilityLabel(row.visibility) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right" align="center">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="onStatus(row)">
              {{ row.status === 'READY' ? '停用' : row.status === 'FAILED' ? '重试解析' : '生效' }}
            </el-button>
            <el-button text type="primary" @click="openAccess(row)">授权</el-button>
            <el-button text type="primary" @click="onDownload(row)">下载</el-button>
            <el-button text type="danger" @click="onRemove(row)">删除</el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="emptyText">
          <el-button
            v-if="hasTenant && !keyword && !folderFilter && !statusFilter"
            type="primary"
            @click="openUpload"
          >
            上传材料
          </el-button>
        </el-empty>
      </template>
    </el-table>

    <div class="knowledge-pagination">
      <el-pagination
        :current-page="currentPage"
        :page-size="pageSize"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[10, 20, 50]"
        :total="displayedRows.length"
        @current-change="onPageChange"
        @size-change="onPageSizeChange"
      />
    </div>

    <el-dialog v-model="folderOpen" title="新建目录" width="420px">
      <el-form ref="folderFormRef" :model="folderForm" :rules="folderRules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="folderForm.name" maxlength="40" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="folderOpen = false">取消</el-button>
        <el-button type="primary" :loading="folderSaving" @click="onCreateFolder">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="uploadOpen" title="上传材料" width="520px" @close="resetUpload">
      <el-form ref="uploadFormRef" :model="upload" :rules="uploadRules" label-width="88px">
        <el-form-item label="文件" prop="hasFile">
          <el-upload
            drag
            :auto-upload="false"
            :limit="1"
            :file-list="uploadList"
            accept=".pdf,.txt,.md,.docx,.pptx"
            :on-change="onFileChange"
            :on-remove="onFileRemove"
          >
            <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
            <template #tip>
              <div class="el-upload__tip">支持 Word（.docx）、PPT（.pptx）、文本型 PDF、TXT 和 Markdown</div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item label="目录">
          <el-select v-model="upload.folderId" clearable placeholder="未分类" style="width: 100%">
            <el-option v-for="folder in folders" :key="folder.id" :label="folder.name" :value="folder.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="可见范围">
          <el-select v-model="upload.visibility" style="width: 100%">
            <el-option label="全员" value="ALL" />
            <el-option label="指定成员" value="SELECTED" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="upload.visibility === 'SELECTED'" label="成员" prop="userIds">
          <el-select v-model="upload.userIds" multiple filterable style="width: 100%" placeholder="选择可见成员">
            <el-option v-for="m in members" :key="m.user.id" :label="memberLabel(m)" :value="m.user.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadOpen = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="onUpload">上传</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="accessOpen" title="授权" width="480px">
      <el-form label-width="88px">
        <el-form-item label="可见范围">
          <el-select v-model="access.visibility" style="width: 100%">
            <el-option label="全员" value="ALL" />
            <el-option label="指定成员" value="SELECTED" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="access.visibility === 'SELECTED'" label="成员">
          <el-select v-model="access.userIds" multiple filterable style="width: 100%">
            <el-option v-for="m in members" :key="m.user.id" :label="memberLabel(m)" :value="m.user.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="accessOpen = false">取消</el-button>
        <el-button type="primary" :loading="accessSaving" @click="onSaveAccess">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="scopeOpen" title="资料专家范围" width="600px">
      <div v-loading="scopeLoading" class="agent-scopes">
        <p class="agent-scope-hint">未选择目录时，专家不会检索任何企业资料。检索结果还会继续受成员文档权限限制。</p>
        <div v-for="agent in scopeRows" :key="agent.id" class="agent-scope-row">
          <div class="agent-scope-heading">
            <strong>{{ agent.name }}</strong>
            <span>固定版本 v{{ agent.version }}</span>
          </div>
          <p>{{ agent.summary }}</p>
          <el-select
            v-model="agent.kbFolderIds"
            multiple
            filterable
            style="width: 100%"
            placeholder="选择允许检索的目录"
          >
            <el-option v-for="folder in folders" :key="folder.id" :label="folder.name" :value="folder.id" />
          </el-select>
          <div class="agent-scope-actions">
            <el-button
              type="primary"
              :loading="scopeSavingId === agent.id"
              @click="onSaveScope(agent)"
            >保存范围</el-button>
          </div>
        </div>
        <el-empty v-if="!scopeLoading && scopeRows.length === 0" description="当前企业还没有已开通的资料型专家" />
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type UploadFile, type UploadUserFile } from 'element-plus';
import { Search } from 'lucide-vue-next';
import { AccessScopeLabel, KbStatusLabel, type AccessScope, type KbStatus } from '@mammoth/shared';
import {
  knowledgeApi,
  kbDownloadUrl,
  officialAgentApi,
  type KbDocumentRow,
  type KbFolderRow,
  type OfficialAgentScopeRow,
} from '../api/console';
import { tenantApi, type SimpleMember } from '../api/tenants';
import { useAuthStore } from '../stores/auth';
import { formatBytes } from '../utils/format';

const auth = useAuthStore();
const hasTenant = computed(() => Boolean(auth.session?.currentTenant));
const isScopeAdmin = computed(() => Boolean(
  auth.session?.user.isPlatformAdmin || ['ADMIN', 'OWNER'].includes(auth.session?.currentRole ?? ''),
));
const scopeOpen = ref(false);
const scopeLoading = ref(false);
const scopeSavingId = ref('');
const scopeRows = ref<OfficialAgentScopeRow[]>([]);
const folders = ref<KbFolderRow[]>([]);
const rows = ref<KbDocumentRow[]>([]);
const members = ref<SimpleMember[]>([]);
const loading = ref(false);
const folderFilter = ref('');
const statusFilter = ref('');
const keywordDraft = ref('');
const keyword = ref('');
const currentPage = ref(1);
const pageSize = ref(10);
const folderOpen = ref(false);
const folderSaving = ref(false);
const folderFormRef = ref<FormInstance>();
const folderForm = reactive({ name: '' });
const uploadOpen = ref(false);
const uploading = ref(false);
const uploadFormRef = ref<FormInstance>();
const uploadFile = ref<File | null>(null);
const uploadList = ref<UploadUserFile[]>([]);
const upload = reactive({
  folderId: '' as string,
  visibility: 'ALL' as AccessScope,
  userIds: [] as string[],
  hasFile: false,
});
const accessOpen = ref(false);
const accessSaving = ref(false);
const accessId = ref('');
const access = reactive({
  visibility: 'ALL' as AccessScope,
  userIds: [] as string[],
});
let searchTimer = 0;

const folderRules: FormRules = {
  name: [{ required: true, message: '请输入目录名', trigger: 'blur' }],
};

const uploadRules: FormRules = {
  hasFile: [
    {
      validator: (_rule, value: boolean, callback) => {
        if (!value) callback(new Error('请选择文件'));
        else callback();
      },
      trigger: 'change',
    },
  ],
  userIds: [
    {
      validator: (_rule, value: string[], callback) => {
        if (upload.visibility === 'SELECTED' && value.length === 0) {
          callback(new Error('指定成员时至少选择一人'));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ],
};

const displayedRows = computed(() => {
  const q = keyword.value.toLowerCase();
  return rows.value.filter((row) => {
    if (folderFilter.value === 'none' && row.folderId) return false;
    if (folderFilter.value && folderFilter.value !== 'none' && row.folderId !== folderFilter.value) return false;
    if (statusFilter.value && row.status !== statusFilter.value) return false;
    if (q && !row.name.toLowerCase().includes(q) && !row.originalName.toLowerCase().includes(q)) return false;
    return true;
  });
});

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return displayedRows.value.slice(start, start + pageSize.value);
});

const emptyText = computed(() => {
  if (!hasTenant.value) return '请先选择企业';
  if (keyword.value || folderFilter.value || statusFilter.value) return '当前筛选下没有材料';
  return '还没有材料';
});

function memberLabel(row: SimpleMember) {
  return `${row.user.name}（${row.user.phone}）`;
}

function statusType(status: KbStatus) {
  if (status === 'READY') return 'success';
  if (status === 'FAILED') return 'danger';
  return 'info';
}

function statusLabel(status: KbStatus) {
  return KbStatusLabel[status];
}

function visibilityLabel(visibility: AccessScope) {
  return AccessScopeLabel[visibility];
}

function resetPage() {
  currentPage.value = 1;
}

function onSearchInput() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(onSearchNow, 300);
}

function onSearchNow() {
  window.clearTimeout(searchTimer);
  keyword.value = keywordDraft.value.trim();
  resetPage();
}

function onReset() {
  window.clearTimeout(searchTimer);
  keywordDraft.value = '';
  keyword.value = '';
  folderFilter.value = '';
  statusFilter.value = '';
  resetPage();
}

function onPageChange(page: number) {
  currentPage.value = page;
}

function onPageSizeChange(size: number) {
  pageSize.value = size;
  resetPage();
}

function resetUpload() {
  uploadFile.value = null;
  uploadList.value = [];
  upload.hasFile = false;
  upload.folderId = folderFilter.value === 'none' ? '' : folderFilter.value;
  upload.visibility = 'ALL';
  upload.userIds = [];
  uploadFormRef.value?.clearValidate();
}

function openUpload() {
  resetUpload();
  uploadOpen.value = true;
}

function onFileChange(file: UploadFile, files: UploadUserFile[]) {
  uploadList.value = files.slice(-1);
  uploadFile.value = file.raw ?? null;
  upload.hasFile = Boolean(uploadFile.value);
}

function onFileRemove() {
  uploadList.value = [];
  uploadFile.value = null;
  upload.hasFile = false;
}

function openAccess(row: KbDocumentRow) {
  accessId.value = row.id;
  access.visibility = row.visibility;
  access.userIds = [...row.userIds];
  accessOpen.value = true;
}

async function loadFoldersAndMembers() {
  if (!auth.session?.currentTenant) {
    folders.value = [];
    members.value = [];
    return;
  }
  const [folderRows, memberRows] = await Promise.all([knowledgeApi.folders(), tenantApi.simpleMembers()]);
  folders.value = folderRows;
  members.value = memberRows;
}

async function loadDocuments() {
  if (!auth.session?.currentTenant) {
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    rows.value = await knowledgeApi.documents();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败');
  } finally {
    loading.value = false;
  }
}

async function load() {
  try {
    await loadFoldersAndMembers();
    await loadDocuments();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败');
  }
}

async function onCreateFolder() {
  const valid = await folderFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  folderSaving.value = true;
  try {
    await knowledgeApi.createFolder(folderForm.name.trim());
    ElMessage.success('已创建');
    folderOpen.value = false;
    folderForm.name = '';
    await loadFoldersAndMembers();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '失败');
  } finally {
    folderSaving.value = false;
  }
}

async function onUpload() {
  const valid = await uploadFormRef.value?.validate().catch(() => false);
  if (!valid || !uploadFile.value) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', uploadFile.value);
    if (upload.folderId) form.append('folderId', upload.folderId);
    form.append('visibility', upload.visibility);
    form.append('userIds', JSON.stringify(upload.visibility === 'SELECTED' ? upload.userIds : []));
    const next = await knowledgeApi.upload(form);
    if (next.status === 'READY') ElMessage.success('已上传，可检索');
    else ElMessage.warning(next.indexError || '文件已上传，尚未完成解析');
    uploadOpen.value = false;
    await loadDocuments();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '上传失败');
  } finally {
    uploading.value = false;
  }
}

async function onStatus(row: KbDocumentRow) {
  const status: KbStatus = row.status === 'READY' ? 'PENDING' : 'READY';
  try {
    const next = await knowledgeApi.patch(row.id, { status });
    rows.value = rows.value.map((item) => (item.id === row.id ? next : item));
    if (next.status === 'FAILED') ElMessage.warning(next.indexError || '解析失败');
    else ElMessage.success(next.status === 'READY' ? '已生效' : '已停用');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '更新失败');
  }
}

async function onSaveAccess() {
  if (access.visibility === 'SELECTED' && access.userIds.length === 0) {
    ElMessage.warning('指定成员时至少选择一人');
    return;
  }
  accessSaving.value = true;
  try {
    const next = await knowledgeApi.patch(accessId.value, {
      visibility: access.visibility,
      userIds: access.visibility === 'SELECTED' ? access.userIds : [],
    });
    rows.value = rows.value.map((item) => (item.id === accessId.value ? next : item));
    ElMessage.success('已保存');
    accessOpen.value = false;
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '失败');
  } finally {
    accessSaving.value = false;
  }
}

async function openScopes() {
  scopeOpen.value = true;
  scopeLoading.value = true;
  try {
    const [agents] = await Promise.all([officialAgentApi.scopes(), loadFoldersAndMembers()]);
    scopeRows.value = agents.map((agent) => ({ ...agent, kbFolderIds: [...agent.kbFolderIds] }));
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载专家范围失败');
  } finally {
    scopeLoading.value = false;
  }
}

async function onSaveScope(agent: OfficialAgentScopeRow) {
  scopeSavingId.value = agent.id;
  try {
    const next = await officialAgentApi.updateScope(agent.id, agent.kbFolderIds);
    scopeRows.value = scopeRows.value.map((row) => row.id === agent.id
      ? { ...next, kbFolderIds: [...next.kbFolderIds] }
      : row);
    ElMessage.success(agent.kbFolderIds.length === 0 ? '已保存，该专家不会检索企业资料' : '专家检索范围已保存');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存专家范围失败');
  } finally {
    scopeSavingId.value = '';
  }
}

function onDownload(row: KbDocumentRow) {
  window.open(kbDownloadUrl(row.id), '_blank', 'noopener');
}

async function onRemove(row: KbDocumentRow) {
  try {
    await ElMessageBox.confirm(`删除后不可恢复。确定删除「${row.name}」？`, '删除材料', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  try {
    await knowledgeApi.remove(row.id);
    ElMessage.success('已删除');
    await loadDocuments();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败');
  }
}

onMounted(load);
watch(() => auth.session?.currentTenant?.id, load);
onBeforeUnmount(() => {
  window.clearTimeout(searchTimer);
});
</script>

<style scoped>
.knowledge-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.knowledge-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  overflow-x: auto;
}

.knowledge-search-wrap {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  gap: 10px;
  min-width: 0;
}

.knowledge-search {
  width: 220px;
}

.folder-filter {
  width: 180px;
}

.status-filter {
  width: 135px;
}

.toolbar-button {
  flex: 0 0 auto;
  margin-left: 0;
}

.toolbar-button + .toolbar-button {
  margin-left: 0;
}

.knowledge-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  margin-left: auto;
}

.knowledge-table {
  margin-top: 20px;
  width: 100%;
}

.operation-buttons {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  justify-content: center;
  white-space: nowrap;
}

.operation-buttons :deep(.el-button + .el-button) {
  margin-left: 0;
}

.operation-buttons :deep(.el-button) {
  margin: 0;
  min-height: 28px;
  padding: 4px 6px;
}

.knowledge-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

:deep(.knowledge-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

:deep(.el-table__body td),
:deep(.el-table__body .cell),
:deep(.el-table__body .el-button.is-text) {
  font-size: 13px;
}

.agent-scope-hint {
  color: #667085;
  line-height: 1.6;
  margin: 0 0 18px;
}

.agent-scope-row {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 14px;
  padding: 16px;
}

.agent-scope-heading {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.agent-scope-heading span,
.agent-scope-row p {
  color: #667085;
  font-size: 13px;
}

.agent-scope-row p {
  line-height: 1.5;
  margin: 8px 0 14px;
}

.agent-scope-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
