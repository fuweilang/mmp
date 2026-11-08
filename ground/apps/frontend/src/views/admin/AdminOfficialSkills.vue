<template>
  <section class="official-skills-page">
    <div class="page-header">
      <div>
        <h2>技能管理</h2>
        <p>维护官方技能的名称、用途与启用状态。上传技能包后即可在专家广场使用。</p>
      </div>
      <el-button type="primary" @click="openCreate">新建技能</el-button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="keywordDraft"
        clearable
        class="toolbar-search"
        placeholder="搜索名称 / 用途 / 标识"
        @clear="onSearchNow"
        @keyup.enter="onSearchNow"
        @input="scheduleSearch"
      />
      <el-select v-model="enabledFilter" clearable placeholder="状态" class="toolbar-select" @change="onSearchNow">
        <el-option label="已启用" value="true" />
        <el-option label="已停用" value="false" />
      </el-select>
      <el-select v-model="categoryFilter" clearable placeholder="分类" class="toolbar-select" @change="resetPage">
        <el-option v-for="item in availableCategoryOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-button type="primary" :loading="loading" @click="onSearchNow">搜索</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>

    <el-alert v-if="pageError" :title="pageError" type="error" show-icon :closable="false" class="page-alert">
      <el-button text type="primary" @click="reload">重试</el-button>
    </el-alert>

    <el-table v-loading="loading" :data="pagedRows" row-key="id" border class="skills-table" header-cell-class-name="skills-table-header">
      <el-table-column label="名称" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <strong class="cell-ellipsis">{{ row.name }}</strong>
          <div class="muted cell-ellipsis">{{ row.key }}</div>
        </template>
      </el-table-column>
      <el-table-column label="用途" min-width="220" show-overflow-tooltip prop="summary" />
      <el-table-column label="分类" min-width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ categoryLabel(row.category) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.enabled ? 'success' : 'info'">
            {{ row.enabled ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="310" fixed="right" align="center">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button text type="primary" @click="discoveryId = row.id">广场详情</el-button>
            <el-button text type="primary" @click="toggleEnable(row)">
              {{ row.enabled ? '停用' : '启用' }}
            </el-button>
            <el-button text type="danger" @click="onDelete(row)">删除</el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="pageError ? '技能加载失败' : hasActiveFilters ? '没有符合条件的技能' : '还没有技能'">
          <el-button v-if="pageError" @click="reload">重试</el-button>
          <el-button v-else-if="hasActiveFilters" @click="onReset">清除筛选</el-button>
          <el-button v-else type="primary" @click="openCreate">新建技能</el-button>
        </el-empty>
      </template>
    </el-table>

    <div class="skills-pagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[10, 20, 50, 100]"
        :total="filteredRows.length"
        @size-change="resetPage"
      />
    </div>

    <el-dialog
      v-model="editorOpen"
      :title="editingId ? '编辑技能' : '新建技能'"
      width="640px"
      align-center
      append-to-body
      modal-class="official-skill-overlay"
      :close-on-click-modal="false"
      :close-on-press-escape="!saving && !zipValidating && !iconValidating"
      :show-close="!saving && !zipValidating && !iconValidating"
      destroy-on-close
      class="official-skill-dialog"
      @closed="resetEditor"
    >
      <el-form v-loading="detailLoading" :model="form" label-position="top" :disabled="saving || zipValidating || detailLoading">
        <el-form-item v-if="!editingId && createMode === 'form'" label="标识" required>
          <el-input v-model="form.key" maxlength="64" placeholder="小写字母开头，如 meeting-notes" />
        </el-form-item>
        <el-form-item label="图标（可选）"><CatalogIconEditor v-model="pendingIcon" v-model:removed="removeIcon" :current-url="formIconUrl" :disabled="saving || zipValidating || detailLoading" @validating="iconValidating=$event" /><div class="hint">图标独立于ZIP保存，更换图标不改变技能包版本。</div></el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="40" placeholder="前台卡片显示的名称" />
        </el-form-item>
        <el-form-item label="用途" required>
          <el-input
            v-model="form.summary"
            type="textarea"
            :rows="2"
            maxlength="140"
            show-word-limit
            placeholder="一句白话用途"
          />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category" clearable placeholder="未设置" style="width: 100%">
            <el-option v-for="item in categoryOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>

        <template v-if="!editingId">
          <el-form-item label="创建方式">
            <el-radio-group v-model="createMode">
              <el-radio-button value="zip">上传 ZIP</el-radio-button>
              <el-radio-button value="form">表单填写</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </template>

        <template v-if="createMode === 'zip' || (editingId && replaceZip)">
          <el-form-item :label="editingId ? '替换技能包' : '技能包 ZIP'" :required="!editingId">
            <div class="zip-upload">
              <el-upload
                ref="zipUploadRef"
                accept=".zip,application/zip"
                :auto-upload="false"
                :show-file-list="false"
                :disabled="saving || zipValidating"
                :on-change="onZipPicked"
              >
                <el-button :loading="zipValidating" :disabled="saving || zipValidating">
                  {{ zipValidating ? '正在校验…' : zipFile ? '重新选择 ZIP' : '选择 ZIP 技能包' }}
                </el-button>
              </el-upload>
              <div v-if="zipFile" class="zip-file-name">{{ zipFile.name }}</div>
              <div class="hint">选包 → 校验 → 预览后可改名称用途 → 保存</div>
            </div>
          </el-form-item>
          <el-alert
            v-if="zipError"
            type="error"
            :closable="false"
            show-icon
            title="技能包无法识别，请换一个包再试"
            :description="zipError"
            class="zip-alert"
          />
          <el-descriptions v-if="zipPreview" :column="1" border size="small" class="zip-preview">
            <el-descriptions-item label="标识">{{ zipPreview.key }}</el-descriptions-item>
            <el-descriptions-item label="预览名称">{{ zipPreview.name }}</el-descriptions-item>
            <el-descriptions-item label="预览用途">{{ zipPreview.summary || '—' }}</el-descriptions-item>
            <el-descriptions-item label="资源数">{{ zipPreview.resourceCount }}</el-descriptions-item>
          </el-descriptions>
        </template>

        <template v-if="createMode === 'form' || (editingId && !replaceZip)">
          <el-form-item v-if="createMode === 'form' || editingId" label="技能说明" :required="createMode === 'form'">
            <el-input
              v-model="form.instruction"
              type="textarea"
              :rows="8"
              maxlength="100000"
              placeholder="技能指令正文（对应 SKILL.md）"
            />
          </el-form-item>
        </template>

        <el-form-item v-if="editingId" label="更换技能包">
          <el-switch v-model="replaceZip" />
          <span class="hint inline">关闭则保留现包，仅更新名称/用途/说明</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button :disabled="saving || zipValidating" @click="editorOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="zipValidating || detailLoading || iconValidating" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
    <CatalogDiscoveryEditor v-if="discoveryId" kind="skill" :resource-id="discoveryId" @close="discoveryId=''" @saved="reload" />
  </section>
</template>

<script setup lang="ts">
import CatalogDiscoveryEditor from '../../components/CatalogDiscoveryEditor.vue';
const discoveryId=ref('');
import CatalogIconEditor from '../../components/CatalogIconEditor.vue';
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type UploadFile, type UploadInstance } from 'element-plus';
import {
  adminOfficialSkillApi,
  type OfficialSkillCategory,
  type OfficialSkillRow,
  type OfficialSkillZipPreview,
} from '../../api/admin';

const rows = ref<OfficialSkillRow[]>([]);
const categoryFilter = ref<OfficialSkillCategory | ''>('');
const filteredRows = computed(() => categoryFilter.value ? rows.value.filter(row => row.category === categoryFilter.value) : rows.value);
const loading = ref(false);
const pageError = ref('');
const keywordDraft = ref('');
const keyword = ref('');
const enabledFilter = ref<'true' | 'false' | ''>('');
let searchTimer = 0;
let requestSequence = 0;
const currentPage = ref(1);
const pageSize = ref(10);
const hasActiveFilters = computed(() => Boolean(keyword.value || enabledFilter.value || categoryFilter.value));
const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});
function resetPage() {
  currentPage.value = 1;
}
// Reload after delete/disable may shrink the last page; never leave an empty out-of-range page.
watch([() => filteredRows.value.length, pageSize], () => {
  const lastPage = Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value));
  currentPage.value = Math.min(Math.max(1, currentPage.value), lastPage);
}, { flush: 'sync' });

const editorOpen = ref(false);
const editingId = ref('');
const saving = ref(false);
const pendingIcon=ref<File|null>(null);
const removeIcon=ref(false);
const iconValidating=ref(false);
const formIconUrl=ref<string|null>(null);
const contentBaseline=ref<{name:string;summary:string;category:string;instruction:string}|null>(null);
function editorContent(){return {name:form.name.trim(),summary:form.summary.trim(),category:form.category,instruction:form.instruction};}
const detailLoading = ref(false);
let editorSequence = 0;
const createMode = ref<'zip' | 'form'>('zip');
const replaceZip = ref(false);
const zipFile = ref<File | null>(null);
const zipPreview = ref<OfficialSkillZipPreview | null>(null);
const zipError = ref('');
const zipValidating = ref(false);
const zipUploadRef = ref<UploadInstance>();

const form = reactive({
  key: '',
  name: '',
  summary: '',
  category: '' as '' | OfficialSkillCategory,
  instruction: '',
});

const categoryOptions: Array<{ value: OfficialSkillCategory; label: string }> = [
  { value: 'common', label: '效率工具' },
  { value: 'content', label: '内容创作' },
  { value: 'analytics', label: '数据分析' },
  { value: 'office', label: '办公协作' },
  { value: 'education', label: '知识学习' },
  { value: 'expertise', label: '开发设计' },
  { value: 'business', label: '运营增长' },
  { value: 'ecommerce', label: '电商经营' },
  { value: 'sales', label: '客户销售' },
  { value: 'hr', label: '人力行政' },
  { value: 'legal', label: '财税法务' },
  { value: 'finance', label: '金融投研' },
  { value: 'consulting', label: '企业咨询' },
  { value: 'research', label: '行业研究' },
  { value: 'files', label: '文件处理' },
  { value: 'search', label: '网页检索' },
  { value: 'writing', label: '翻译写作' },
  { value: 'lifestyle', label: '个人生活' },
];
const availableCategoryOptions = computed(() => categoryOptions.filter(item => rows.value.some(row => row.category === item.value)));

function categoryLabel(category: OfficialSkillCategory | null | undefined) {
  if (!category) return '未设置';
  return categoryOptions.find((item) => item.value === category)?.label ?? category;
}

function formatTime(value: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function reload() {
  const sequence = ++requestSequence;
  loading.value = true;
  pageError.value = '';
  try {
    const result = await adminOfficialSkillApi.list({
      keyword: keyword.value,
      enabled: enabledFilter.value,
    });
    if (sequence !== requestSequence) return;
    rows.value = result;
  } catch (error) {
    if (sequence !== requestSequence) return;
    pageError.value = error instanceof Error ? error.message : '暂时无法加载，请稍后重试';
    rows.value = [];
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

function onSearchNow() {
  window.clearTimeout(searchTimer);
  resetPage();
  keyword.value = keywordDraft.value.trim();
  reload();
}

function onReset() {
  window.clearTimeout(searchTimer);
  resetPage();
  keywordDraft.value = '';
  keyword.value = '';
  enabledFilter.value = '';
  categoryFilter.value = '';
  reload();
}

function scheduleSearch() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => onSearchNow(), 300);
}

function resetEditor() {
  editorSequence += 1;
  pendingIcon.value=null;removeIcon.value=false;iconValidating.value=false;formIconUrl.value=null;contentBaseline.value=null;
  detailLoading.value = false;
  zipValidating.value = false;
  editingId.value = '';
  createMode.value = 'zip';
  replaceZip.value = false;
  zipFile.value = null;
  zipPreview.value = null;
  zipError.value = '';
  form.key = '';
  form.name = '';
  form.summary = '';
  form.category = '';
  form.instruction = '';
  zipUploadRef.value?.clearFiles();
}

function openCreate() {
  resetEditor();
  editorOpen.value = true;
}

async function openEdit(row: OfficialSkillRow) {
  resetEditor();
  editingId.value = row.id;
  formIconUrl.value=row.avatarUrl??null;
  createMode.value = 'form';
  form.key = row.key;
  form.name = row.name;
  form.summary = row.summary;
  form.category = (row.category ?? '') as typeof form.category;
  editorOpen.value = true;
  const sequence = editorSequence;
  detailLoading.value = true;
  try {
    const detail = await adminOfficialSkillApi.detail(row.id);
    if (sequence !== editorSequence || !editorOpen.value) return;
    form.instruction = detail.instruction ?? '';
    formIconUrl.value=detail.avatarUrl??null;
    contentBaseline.value=editorContent();
  } catch (error) {
    if (sequence !== editorSequence || !editorOpen.value) return;
    ElMessage.error(error instanceof Error ? error.message : '加载详情失败');
    editorOpen.value = false;
  } finally {
    if (sequence === editorSequence) detailLoading.value = false;
  }
}

async function onZipPicked(upload: UploadFile) {
  if (zipValidating.value || saving.value) return;
  const file = upload.raw ?? null;
  zipUploadRef.value?.clearFiles();
  const sequence = editorSequence;
  zipFile.value = file;
  zipPreview.value = null;
  zipError.value = '';
  if (!file) return;
  zipValidating.value = true;
  try {
    const body = new FormData();
    body.append('file', file);
    const preview = await adminOfficialSkillApi.validateZip(body);
    if (sequence !== editorSequence || !editorOpen.value) return;
    if (preview.keyConflict && !editingId.value) {
      zipError.value = '技能标识已存在，同标识请走编辑入口替换内容';
      return;
    }
    if (editingId.value && preview.key !== form.key) {
      zipError.value = '技能包标识与当前技能不一致';
      return;
    }
    zipPreview.value = preview;
    if (!form.name.trim()) form.name = preview.name;
    if (!form.summary.trim()) form.summary = preview.summary;
    if (!form.category && preview.category) form.category = preview.category;
  } catch (error) {
    if (sequence === editorSequence && editorOpen.value) zipError.value = error instanceof Error ? error.message : '技能包无法识别，请换一个包再试';
  } finally {
    if (sequence === editorSequence) zipValidating.value = false;
  }
}

async function onSave() {
  if (saving.value || zipValidating.value || detailLoading.value || iconValidating.value) return;
  if (!form.name.trim()) {
    ElMessage.warning('请填写名称');
    return;
  }
  if (!form.summary.trim()) {
    ElMessage.warning('请填写用途');
    return;
  }
  saving.value = true;
  try {
    const wasNew=!editingId.value;
    let next:OfficialSkillRow|undefined;
    if(wasNew){
      if(createMode.value==='zip'){
        if(!zipFile.value||!zipPreview.value){ElMessage.warning('请先选择并通过校验的技能包');return;}
        const body=new FormData();body.append('file',zipFile.value);body.append('name',form.name.trim());body.append('summary',form.summary.trim());if(form.category)body.append('category',form.category);
        next=await adminOfficialSkillApi.createFromZip(body);
      }else{
        if(!form.key.trim()||!form.instruction.trim()){ElMessage.warning('请填写标识和技能说明');return;}
        next=await adminOfficialSkillApi.createFromForm({key:form.key.trim(),name:form.name.trim(),summary:form.summary.trim(),...(form.category?{category:form.category}:{}),instruction:form.instruction});
      }
    }else if(replaceZip.value){
      if(!zipFile.value||!zipPreview.value){ElMessage.warning('请先选择并通过校验的技能包');return;}
      const body=new FormData();body.append('file',zipFile.value);body.append('name',form.name.trim());body.append('summary',form.summary.trim());if(form.category)body.append('category',form.category);
      next=await adminOfficialSkillApi.replaceZip(editingId.value,body);
    }else{
      const value=editorContent(),previous=contentBaseline.value;
      const patch={...(value.name!==previous?.name?{name:value.name}:{}),...(value.summary!==previous?.summary?{summary:value.summary}:{}),...(value.category!==previous?.category?{category:form.category||'' as const}:{}),...(value.instruction!==previous?.instruction?{instruction:value.instruction}:{})};
      if(Object.keys(patch).length)next=await adminOfficialSkillApi.update(editingId.value,patch);
    }
    // Remember the content save before image I/O, so a retry never reimports a ZIP/rebuilds a revision.
    if(next){editingId.value=next.id;form.key=next.key;form.instruction=next.instruction??form.instruction;contentBaseline.value=editorContent();replaceZip.value=false;createMode.value='form';}
    if(pendingIcon.value){const body=new FormData();body.append('file',pendingIcon.value);next=await adminOfficialSkillApi.uploadIcon(editingId.value,body);}
    else if(removeIcon.value){next=await adminOfficialSkillApi.removeIcon(editingId.value);}
    if(next)formIconUrl.value=next.avatarUrl??null;
    pendingIcon.value=null;removeIcon.value=false;
    ElMessage.success(wasNew?'已保存（默认停用，启用后出现在前台）':'已保存');
    editorOpen.value = false;
    await reload();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function toggleEnable(row: OfficialSkillRow) {
  try {
    if (row.enabled) {
      if (row.linkedAgentCount > 0) {
        await ElMessageBox.confirm(
          '已有专家关联此技能，停用后前台不再展示；已有对话不受影响',
          '确认停用',
          { type: 'warning', customClass: 'official-skill-message-box', confirmButtonText: '停用', cancelButtonText: '取消' },
        );
      }
      await adminOfficialSkillApi.disable(row.id);
      ElMessage.success('已停用');
    } else {
      await adminOfficialSkillApi.enable(row.id);
      ElMessage.success('已启用');
    }
    await reload();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error instanceof Error ? error.message : '操作失败');
  }
}

async function onDelete(row: OfficialSkillRow) {
  try {
    if (row.linkedAgentCount > 0 || row.enabled) {
      await ElMessageBox.alert(
        row.linkedAgentCount > 0
          ? '该技能仍被专家关联，只能停用，不能删除。'
          : '已启用技能请先停用；被引用内容仅可停用。',
        '无法删除',
        { type: 'warning', customClass: 'official-skill-message-box', confirmButtonText: '知道了' },
      );
      return;
    }
    await ElMessageBox.confirm('确认删除该未引用草稿技能？此操作不可恢复。', '确认删除', {
      type: 'warning',
      customClass: 'official-skill-message-box',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
    await adminOfficialSkillApi.remove(row.id);
    ElMessage.success('已删除');
    await reload();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

onMounted(() => { void reload(); });
onUnmounted(() => {
  window.clearTimeout(searchTimer);
  requestSequence += 1;
  editorSequence += 1;
});
</script>

<style scoped>
.official-skills-page {
  box-sizing: border-box;
  min-width: 0;
  padding: 15px;
  background: var(--el-bg-color, #fff);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.page-header > div { min-width: 0; }
.page-header > .el-button { flex-shrink: 0; }
.page-header h2 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.page-header p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 20px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.toolbar-search { width: min(320px, 100%); }
.toolbar-select { width: 140px; }
.toolbar :deep(.el-button + .el-button) { margin-left: 0; }
.page-alert { margin-bottom: 0; }
.skills-table { width: 100%; }
:deep(.skills-table-header) {
  background: var(--el-fill-color-light) !important;
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-weight: 600;
}
.muted, .hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.cell-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.operation-buttons {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
}
.operation-buttons :deep(.el-button) { margin: 0; min-height: 28px; padding: 4px 6px; }
.skills-pagination { display: flex; justify-content: flex-end; }
.skills-pagination :deep(.el-pagination) { flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.hint { margin-top: 6px; line-height: 1.6; overflow-wrap: anywhere; }
.hint.inline { margin-left: 10px; }
.zip-upload { width: 100%; min-width: 0; }
.zip-file-name { margin-top: 8px; line-height: 1.6; overflow-wrap: anywhere; }
.zip-alert, .zip-preview { margin-bottom: 12px; }
@media (max-width: 640px) {
  .page-header { flex-wrap: wrap; }
  .toolbar-search { width: 100%; }
  .toolbar-select { flex: 1; min-width: 120px; }
}
</style>

<style>
/* Teleported overlays: deliberately scoped by skill-page-only classes. */
.official-skill-overlay .el-overlay-dialog {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 100%;
  padding: 24px;
  overflow: hidden;
}
.official-skill-dialog.el-dialog {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  margin: 0 !important;
  padding: 0;
  max-width: 100%;
  max-height: calc(100vh - 48px);
  max-height: calc(100dvh - 48px);
  overflow: hidden;
}
.official-skill-dialog .el-dialog__header,
.official-skill-dialog .el-dialog__footer {
  flex-shrink: 0;
  margin: 0;
  padding: 16px 20px;
}
.official-skill-dialog .el-dialog__header { border-bottom: 1px solid var(--el-border-color-lighter); padding-right: 52px; }
.official-skill-dialog .el-dialog__title { font-size: 16px; font-weight: 600; }
.official-skill-dialog .el-dialog__footer { border-top: 1px solid var(--el-border-color-lighter); }
.official-skill-dialog .el-dialog__body {
  min-height: 0;
  min-width: 0;
  padding: 20px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  overflow-wrap: anywhere;
}
.official-skill-dialog .el-form-item { margin-bottom: 18px; }
.official-skill-dialog .el-form-item__content { min-width: 0; }
.official-skill-dialog .el-descriptions__table { table-layout: fixed; }
.official-skill-dialog .el-descriptions__cell,
.official-skill-dialog .el-alert__content { overflow-wrap: anywhere; word-break: break-word; min-width: 0; }
.official-skill-dialog .el-textarea__inner { resize: vertical; max-height: 240px; }
.official-skill-message-box.el-message-box {
  display: inline-flex;
  flex-direction: column;
  box-sizing: border-box;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
  max-height: calc(100dvh - 48px);
}
.official-skill-message-box .el-message-box__header,
.official-skill-message-box .el-message-box__btns { flex-shrink: 0; }
.official-skill-message-box .el-message-box__content { min-height: 0; overflow-y: auto; overflow-wrap: anywhere; }
@media (max-width: 640px) {
  .official-skill-overlay .el-overlay-dialog { padding: 16px; }
  .official-skill-dialog.el-dialog,
  .official-skill-message-box.el-message-box {
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    max-height: calc(100dvh - 32px);
  }
  .official-skill-dialog .el-dialog__header,
  .official-skill-dialog .el-dialog__footer { padding: 14px 16px; }
  .official-skill-dialog .el-dialog__header { padding-right: 48px; }
  .official-skill-dialog .el-dialog__body { padding: 16px; }
}
</style>
