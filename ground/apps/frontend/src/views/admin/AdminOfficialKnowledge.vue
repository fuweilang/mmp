<template>
  <section class="official-kb-page">
    <el-button v-if="knowledgeView==='legacy' && canAuthor" text @click="knowledgeView='core'">返回知识库文件夹</el-button>
    <KnowledgeFolderManager v-if="canAuthor && knowledgeView==='core'" @legacy="knowledgeView='legacy'" />
    <div v-show="knowledgeView==='legacy'">
    <el-alert title="旧专家知识库：保持现有发布和工具行为。新知识核心是独立的不可变索引与发布版本，不会自动迁移旧资料。" type="info" :closable="false" />
    <div class="page-header">
      <div>
        <h2>猛犸知识库</h2>
        <p>管理官方专家专属资料。</p>
      </div>
      <el-button v-if="canAuthor" type="primary" @click="openUpload">上传资料</el-button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="keywordDraft"
        clearable
        class="toolbar-search"
        placeholder="搜索资料名 / 专家"
        @clear="onSearchNow"
        @keyup.enter="onSearchNow"
      />
      <el-select v-model="agentFilter" clearable placeholder="所属专家" class="toolbar-select" @change="reload">
        <el-option
          v-for="agent in agents"
          :key="agent.id"
          :label="`${agent.name}（${agent.key}）`"
          :value="agent.id"
        />
      </el-select>
      <el-select v-model="statusFilter" clearable placeholder="索引状态" class="toolbar-select" @change="reload">
        <el-option label="已生效" value="READY" />
        <el-option label="处理中" value="PENDING" />
        <el-option label="失败" value="FAILED" />
      </el-select>
      <el-checkbox v-model="includeInactive" class="toolbar-check" @change="reload">含未生效暂存</el-checkbox>
      <el-button type="primary" @click="onSearchNow">搜索</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>

    <div class="kb-table-wrap">
    <el-table v-loading="loading" :data="rows" border class="kb-table" empty-text="暂无官方资料">
      <el-table-column label="资料名称" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <div class="name-cell">
            <strong>{{ row.name }}</strong>
            <span class="muted">{{ row.originalName }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="所属专家" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.agent.name }}
          <div class="muted">{{ row.agent.key }}</div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">{{ row.fileType || '—' }}</template>
      </el-table-column>
      <el-table-column label="大小" width="100">
        <template #default="{ row }">{{ formatBytes(row.sizeBytes) }}</template>
      </el-table-column>
      <el-table-column label="分段" width="80" prop="chunkCount" />
      <el-table-column label="索引状态" min-width="150">
        <template #default="{ row }">
          <div class="status-cell">
            <el-tag size="small" effect="light" :type="statusType(row)">{{ statusLabel(row) }}</el-tag>
            <div v-if="row.indexError" class="error-text" :title="row.indexError">{{ row.indexError }}</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="生效版本" width="100" align="center">
        <template #default="{ row }">
          {{ row.effectiveVersion ? `v${row.effectiveVersion.version}` : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="168" align="center">
        <template #default="{ row }">
          <span class="time-text">{{ formatTime(row.updatedAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right" align="center" class-name="kb-ops-col" label-class-name="kb-ops-col">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="openViewer(row)">查看</el-button>
            <el-button v-if="canAuthor" text type="primary" :disabled="!row.active" @click="openReplace(row)">替换</el-button>
            <el-button text type="primary" @click="onDownload(row)">下载</el-button>
            <el-button v-if="canAuthor" text type="primary" @click="onReindex(row)">刷新索引</el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="暂无官方资料">
          <el-button v-if="canAuthor" type="primary" @click="openUpload">上传资料</el-button>
        </el-empty>
      </template>
    </el-table>
    </div>

    <el-dialog
      v-model="viewerOpen"
      title="资料详情"
      width="760px"
      align-center
      append-to-body
      destroy-on-close
      class="library-modal official-kb-dialog official-kb-viewer"
      :close-on-click-modal="false"
    >
      <div v-loading="viewerLoading" class="viewer-body">
        <template v-if="viewerRow">
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="资料名称">{{ viewerRow.name }}</el-descriptions-item>
            <el-descriptions-item label="文件名">{{ viewerRow.originalName }}</el-descriptions-item>
            <el-descriptions-item label="所属专家">
              {{ viewerRow.agent.name }}（{{ viewerRow.agent.key }}）
            </el-descriptions-item>
            <el-descriptions-item label="状态">{{ statusLabel(viewerRow) }}</el-descriptions-item>
            <el-descriptions-item label="生效版本">
              {{ viewerRow.effectiveVersion ? `v${viewerRow.effectiveVersion.version}` : '—' }}
            </el-descriptions-item>
            <el-descriptions-item v-if="viewerRow.indexError" label="失败原因">
              {{ viewerRow.indexError }}
            </el-descriptions-item>
          </el-descriptions>

          <div class="viewer-section-title">原文预览</div>
          <el-alert
            v-if="contentError"
            type="warning"
            :closable="false"
            :title="contentError"
            class="viewer-alert"
          />
          <pre v-else class="content-pre">{{ contentText || '加载中…' }}</pre>
          <div v-if="contentTruncated" class="muted">正文过长，已截断预览；可下载完整文件。</div>

          <el-collapse class="chunks-collapse">
            <el-collapse-item title="分段明细" name="chunks">
              <el-button size="small" :loading="chunksLoading" @click="loadChunks">加载分段</el-button>
              <el-table v-if="chunks.length" :data="chunks" size="small" border class="chunks-table">
                <el-table-column prop="ordinal" label="#" width="60" />
                <el-table-column prop="length" label="长度" width="80" />
                <el-table-column prop="preview" label="预览" min-width="240" show-overflow-tooltip />
              </el-table>
            </el-collapse-item>
          </el-collapse>
        </template>
      </div>
      <template #footer>
        <el-button @click="viewerOpen = false">关闭</el-button>
        <el-button v-if="viewerRow" type="primary" @click="onDownload(viewerRow)">下载原文</el-button>
      </template>
    </el-dialog>

    <LibraryUploadDialog v-if="canAuthor && uploadOpen" :title="replaceTarget ? '替换官方知识资料' : '上传官方知识资料'" :multiple="!replaceTarget" accept=".md,.markdown,.txt,.pdf,.docx,.pptx" hint="支持 Markdown / TXT / PDF / DOCX / PPTX，单文件 ≤20MB；索引成功后生效，失败保留旧知识。" :load-limits="officialUploadLimits" :prepare="prepareOfficialUpload" :upload-file="uploadOfficialFile" @close="uploadOpen = false; resetUploadForm()" @complete="officialUploaded">
      <template #default="{ busy, count }">
        <el-form label-position="top" :disabled="busy">
          <el-form-item v-if="!replaceTarget" label="所属官方专家" required><el-select v-model="uploadAgentId" filterable placeholder="仅列出可绑定官方知识库的专家" style="width:100%"><el-option v-for="agent in agents" :key="agent.id" :label="`${agent.name}（${agent.key}）`" :value="agent.id" /></el-select></el-form-item>
          <el-form-item v-else label="替换目标"><div>{{ replaceTarget.name }} · {{ replaceTarget.agent.name }}</div></el-form-item>
          <el-form-item label="资料显示名"><el-input v-model="uploadName" :disabled="count > 1" maxlength="120" placeholder="单文件可自定义；多文件使用各自原文件名" /></el-form-item>
        </el-form>
      </template>
    </LibraryUploadDialog>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import KnowledgeFolderManager from '../../components/admin/KnowledgeFolderManager.vue';
import {useAuthStore} from '../../stores/auth';
import {canAuthorExperts} from '../../utils/knowledge-admin';
const auth=useAuthStore();
const canAuthor=computed(()=>canAuthorExperts(auth.session));
const knowledgeView=ref(canAuthor.value?'core':'legacy');
import LibraryUploadDialog from '../../components/LibraryUploadDialog.vue';
import { ElMessage } from 'element-plus';
import {
  adminOfficialKnowledgeApi,
  type OfficialKnowledgeBindableAgent,
  type OfficialKnowledgeRow,
} from '../../api/admin';
import { ApiError } from '../../api/http';

const loading = ref(false);
const rows = ref<OfficialKnowledgeRow[]>([]);
const agents = ref<OfficialKnowledgeBindableAgent[]>([]);
const keywordDraft = ref('');
const keyword = ref('');
const agentFilter = ref('');
const statusFilter = ref('');
const includeInactive = ref(false);

const viewerOpen = ref(false);
const viewerLoading = ref(false);
const viewerRow = ref<OfficialKnowledgeRow | null>(null);
const contentText = ref('');
const contentTruncated = ref(false);
const contentError = ref('');
const chunksLoading = ref(false);
const chunks = ref<Array<{ id: string; ordinal: number; preview: string; length: number }>>([]);

const uploadOpen = ref(false);
const uploadAgentId = ref('');
const uploadName = ref('');
const replaceTarget = ref<OfficialKnowledgeRow | null>(null);

async function reload() {
  loading.value = true;
  try {
    rows.value = await adminOfficialKnowledgeApi.list({
      keyword: keyword.value,
      agentId: agentFilter.value || undefined,
      status: (statusFilter.value as '' | 'PENDING' | 'READY' | 'FAILED') || undefined,
      activeOnly: includeInactive.value ? false : true,
    });
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadAgents() {
  try {
    agents.value = await adminOfficialKnowledgeApi.agents();
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '加载专家列表失败');
  }
}

function onSearchNow() {
  keyword.value = keywordDraft.value.trim();
  void reload();
}

function onReset() {
  keywordDraft.value = '';
  keyword.value = '';
  agentFilter.value = '';
  statusFilter.value = '';
  includeInactive.value = false;
  void reload();
}

function statusLabel(row: OfficialKnowledgeRow) {
  if (!row.active && row.status === 'READY') return '已索引未生效';
  if (!row.active && row.status === 'PENDING') return '处理中（未生效）';
  if (!row.active && row.status === 'FAILED') return '失败（未生效）';
  if (row.status === 'READY') return '已生效';
  if (row.status === 'PENDING') return '处理中';
  return '失败';
}

function statusType(row: OfficialKnowledgeRow) {
  if (row.status === 'READY' && row.active) return 'success';
  if (row.status === 'FAILED') return 'danger';
  if (row.status === 'PENDING') return 'warning';
  return 'info';
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

async function openViewer(row: OfficialKnowledgeRow) {
  viewerOpen.value = true;
  viewerLoading.value = true;
  viewerRow.value = row;
  contentText.value = '';
  contentTruncated.value = false;
  contentError.value = '';
  chunks.value = [];
  try {
    const detail = await adminOfficialKnowledgeApi.detail(row.id);
    viewerRow.value = detail;
    try {
      const content = await adminOfficialKnowledgeApi.content(row.id);
      contentText.value = content.content;
      contentTruncated.value = content.truncated;
    } catch (error) {
      contentError.value = error instanceof ApiError ? error.message : '无法预览原文';
    }
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '加载详情失败');
    viewerOpen.value = false;
  } finally {
    viewerLoading.value = false;
  }
}

async function loadChunks() {
  if (!viewerRow.value) return;
  chunksLoading.value = true;
  try {
    const res = await adminOfficialKnowledgeApi.chunks(viewerRow.value.id);
    chunks.value = res.chunks;
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '加载分段失败');
  } finally {
    chunksLoading.value = false;
  }
}

function openUpload() {
  replaceTarget.value = null;
  uploadOpen.value = true;
}

function openReplace(row: OfficialKnowledgeRow) {
  replaceTarget.value = row;
  uploadName.value = row.name;
  uploadAgentId.value = row.agentId;
  uploadOpen.value = true;
}

function resetUploadForm() {
  uploadAgentId.value = '';
  uploadName.value = '';
  replaceTarget.value = null;
}

const officialUploadLimits = async () => ({ maxFileBytes: 20 * 1024 * 1024, allowedExtensions: ['.md', '.markdown', '.txt', '.pdf', '.docx', '.pptx'] });
let officialUploadContext: { agentId: string; replacementId?: string; name: string; namedFile?: File } | undefined;
function prepareOfficialUpload(files: readonly File[]) {
  if (!replaceTarget.value && !uploadAgentId.value) throw new Error('请选择所属专家');
  officialUploadContext = { agentId: uploadAgentId.value, ...(replaceTarget.value ? { replacementId: replaceTarget.value.id } : {}), name: uploadName.value.trim(), ...(files.length === 1 ? { namedFile: files[0] } : {}) };
}
async function uploadOfficialFile(file: File) {
  const context = officialUploadContext; if (!context) throw new Error('请先选择所属专家');
  const body = new FormData(); body.append('file', file);
  if (context.name && context.namedFile === file) body.append('name', context.name);
  let result: OfficialKnowledgeRow;
  if (context.replacementId) result = await adminOfficialKnowledgeApi.replace(context.replacementId, body);
  else { body.append('agentId', context.agentId); result = await adminOfficialKnowledgeApi.upload(body); }
  if (result.status === 'READY' && result.active) return '已保存，已索引并生效';
  if (result.status === 'FAILED') return `文件已保存，但索引失败：${result.indexError || '请在列表重试索引'}；旧知识（如有）保留，不必重复上传`;
  return '文件已保存，索引尚未完成';
}
async function officialUploaded(successes: number) { if (successes > 0) await reload(); }

async function onReindex(row: OfficialKnowledgeRow) {
  try {
    const result = await adminOfficialKnowledgeApi.reindex(row.id);
    if (result.status === 'READY' && result.active) ElMessage.success('索引已刷新');
    else if (result.status === 'FAILED') ElMessage.error(result.indexError || '刷新失败');
    else ElMessage.warning('已触发刷新');
    await reload();
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '刷新失败');
  }
}

function onDownload(row: OfficialKnowledgeRow) {
  window.open(adminOfficialKnowledgeApi.fileUrl(row.id), '_blank', 'noopener');
}

onMounted(async () => {
  await Promise.all([loadAgents(), reload()]);
});
</script>

<style scoped>
.official-kb-page {
  background: #fff;
  padding: 15px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
  min-height: calc(100vh - 120px);
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}
.page-header h2 {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  color: #333946;
  line-height: 26px;
}
.page-header p {
  margin: 0;
  color: #667085;
  font-size: 13px;
  line-height: 20px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
}
.toolbar-search {
  width: 240px;
  max-width: 100%;
}
.toolbar-select {
  width: 180px;
  max-width: 100%;
}
.toolbar-check {
  margin-right: 4px;
}
.kb-table-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
}
.kb-table-wrap :deep(.el-table) {
  width: 100% !important;
}
.kb-table-wrap :deep(.el-table__inner-wrapper),
.kb-table-wrap :deep(.el-table__header-wrapper),
.kb-table-wrap :deep(.el-table__body-wrapper) {
  min-width: 0;
}
.kb-table-wrap :deep(.el-table__body-wrapper) {
  overflow-x: auto !important;
}
.kb-table :deep(.el-table__header th) {
  background: #f8fafc;
  color: #333946;
  font-weight: 600;
}
.kb-table :deep(.el-table__body tr:hover > td) {
  background: #f8fafc;
}
.kb-table {
  font-size: 13px;
}
.name-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.name-cell strong {
  font-weight: 600;
  color: #333946;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted {
  color: #8b909b;
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}
.error-text {
  max-width: 100%;
  color: var(--el-color-danger);
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time-text {
  color: #667085;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.operation-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 4px;
}
.operation-buttons :deep(.el-button.is-text) {
  margin: 0;
  padding: 4px 6px;
}
.operation-buttons :deep(.el-button + .el-button) {
  margin-left: 0;
}
.kb-table :deep(.kb-ops-col .cell) {
  display: flex;
  justify-content: center;
}
.viewer-body {
  max-height: min(70vh, 640px);
  overflow: auto;
  padding-right: 2px;
}
.viewer-section-title {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #333946;
}
.viewer-alert {
  margin-bottom: 8px;
}
.content-pre {
  margin: 0;
  padding: 12px;
  max-height: 360px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f8fafc;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #333946;
}
.chunks-collapse {
  margin-top: 12px;
}
.chunks-table {
  margin-top: 8px;
}
.official-kb-dialog :deep(.el-dialog__header) {
  margin-right: 0;
}
.official-kb-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
}
.official-kb-dialog :deep(.el-dialog__footer) {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
@media (max-width: 900px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar-search,
  .toolbar-select {
    width: 100%;
  }
}
</style>
