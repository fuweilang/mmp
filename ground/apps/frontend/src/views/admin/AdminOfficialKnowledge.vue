<template>
  <section class="official-kb-page">
    <div class="page-header">
      <div>
        <h2>猛犸知识库</h2>
        <p>管理官方专家专属资料。与企业知识库隔离；有官方资料时检索只走官方库。</p>
      </div>
      <el-button type="primary" @click="openUpload">上传资料</el-button>
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
      <el-checkbox v-model="includeInactive" @change="reload">含未生效暂存</el-checkbox>
      <el-button @click="onSearchNow">搜索</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" border class="kb-table">
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
          <el-tag size="small" :type="statusType(row)">{{ statusLabel(row) }}</el-tag>
          <div v-if="row.indexError" class="error-text">{{ row.indexError }}</div>
        </template>
      </el-table-column>
      <el-table-column label="生效版本" width="110">
        <template #default="{ row }">
          {{ row.effectiveVersion ? `v${row.effectiveVersion.version}` : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right" align="center">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="openViewer(row)">查看</el-button>
            <el-button text type="primary" :disabled="!row.active" @click="openReplace(row)">替换</el-button>
            <el-button text type="primary" @click="onDownload(row)">下载</el-button>
            <el-button text type="primary" @click="onReindex(row)">刷新索引</el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="暂无官方资料">
          <el-button type="primary" @click="openUpload">上传资料</el-button>
        </el-empty>
      </template>
    </el-table>

    <el-dialog
      v-model="viewerOpen"
      title="资料详情"
      width="760px"
      align-center
      append-to-body
      destroy-on-close
      class="library-modal official-kb-dialog official-kb-viewer"
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

          <div class="viewer-section-title">原文预览（安全源码，非 HTML 渲染）</div>
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
            <el-collapse-item title="分段明细（技术排查）" name="chunks">
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

    <LibraryUploadDialog v-if="uploadOpen" :title="replaceTarget ? '替换官方知识资料' : '上传官方知识资料'" :multiple="!replaceTarget" accept=".md,.markdown,.txt,.pdf,.docx,.pptx" hint="仅官方知识资料：Markdown/TXT/PDF/DOCX/PPTX，单文件20MB；先索引成功再生效，失败保留旧知识。不会自动修改企业私人资料的分享范围。" :load-limits="officialUploadLimits" :prepare="prepareOfficialUpload" :upload-file="uploadOfficialFile" @close="uploadOpen = false; resetUploadForm()" @complete="officialUploaded">
      <template #default="{ busy, count }">
        <el-form label-position="top" :disabled="busy">
          <el-form-item v-if="!replaceTarget" label="所属官方专家" required><el-select v-model="uploadAgentId" filterable placeholder="仅列出可绑定官方知识库的专家" style="width:100%"><el-option v-for="agent in agents" :key="agent.id" :label="`${agent.name}（${agent.key}）`" :value="agent.id" /></el-select></el-form-item>
          <el-form-item v-else label="替换目标"><div>{{ replaceTarget.name }} · {{ replaceTarget.agent.name }}</div></el-form-item>
          <el-form-item label="资料显示名"><el-input v-model="uploadName" :disabled="count > 1" maxlength="120" placeholder="单文件可自定义；多文件使用各自原文件名" /></el-form-item>
        </el-form>
      </template>
    </LibraryUploadDialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
  padding: 4px 2px 24px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0 0 6px;
  font-size: 20px;
}
.page-header p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
}
.toolbar-search {
  width: 220px;
}
.toolbar-select {
  width: 200px;
}
.name-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.error-text {
  margin-top: 4px;
  color: var(--el-color-danger);
  font-size: 12px;
}
.operation-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0;
}
.operation-buttons :deep(.el-button + .el-button) {
  margin-left: 0;
}
.viewer-section-title {
  margin: 16px 0 8px;
  font-weight: 600;
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
  background: var(--el-fill-color-light);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
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
</style>
