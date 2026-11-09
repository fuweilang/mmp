<template>
  <section class="official-skills-page">
    <div class="page-header">
      <div>
        <h2>技能管理</h2>
        <p>维护技能的名称、一句话介绍和启用状态。停用只是不再提供新的使用，不删除已有任务。</p>
      </div>
      <el-button type="primary" @click="openCreate">新建技能</el-button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="keywordDraft"
        clearable
        class="toolbar-search"
        placeholder="搜索名称 / 一句话介绍 / 标识"
        @clear="onSearchNow"
        @keyup.enter="onSearchNow"
        @input="scheduleSearch"
      />
      <el-select v-model="enabledFilter" clearable placeholder="状态" class="toolbar-select" @change="onSearchNow">
        <el-option label="已启用" value="true" />
        <el-option label="已停用" value="false" />
      </el-select>
      <el-select v-model="categoryFilter" clearable placeholder="分类" class="toolbar-select" @change="resetPage">
        <template #label="{ value }">
          <span class="cat-mark">
            <i class="cat-dot" :style="{ background: categoryColor(value) }" />
            <span>{{ categoryName(value) }}</span>
          </span>
        </template>
        <el-option v-for="item in availableCategoryOptions" :key="item.value" :label="item.label" :value="item.value">
          <span class="cat-mark">
            <i class="cat-dot" :style="{ background: categoryColor(item.value) }" />
            <span>{{ item.label }}</span>
          </span>
        </el-option>
      </el-select>
      <el-button type="primary" :loading="loading" @click="onSearchNow">搜索</el-button>
      <el-button @click="onReset">重置</el-button>
    </div>

    <el-alert v-if="pageError" :title="pageError" type="error" show-icon :closable="false" class="page-alert">
      <el-button text type="primary" @click="reload">重试</el-button>
    </el-alert>

    <el-table v-loading="loading" :data="pagedRows" row-key="id" border class="skills-table" header-cell-class-name="skills-table-header">
      <el-table-column label="名称" min-width="220">
        <template #default="{ row }">
          <div class="name-cell">
            <span class="skill-thumb" aria-hidden="true">
              <img
                v-if="row.avatarUrl && thumbFailed[row.id] !== row.avatarUrl"
                :src="row.avatarUrl"
                alt=""
                @error="thumbFailed[row.id] = row.avatarUrl || ''"
              />
              <component :is="categoryIcon(row)" v-else :size="16" />
            </span>
            <span class="name-copy">
              <strong class="cell-ellipsis">{{ row.name }}</strong>
              <span class="muted cell-ellipsis">{{ row.key }}</span>
            </span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="一句话介绍" min-width="220" show-overflow-tooltip prop="summary" />
      <el-table-column label="分类" min-width="110" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="!rowCategories(row).length" class="muted">未设置</span>
          <span v-else class="cat-list">
            <span v-for="value in rowCategories(row)" :key="value" class="cat-mark">
              <i class="cat-dot" :style="{ background: categoryColor(value) }" />
              <span>{{ categoryName(value) }}</span>
            </span>
          </span>
        </template>
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
            <el-button text type="primary" @click="openDiscovery(row)">技能介绍</el-button>
            <el-button text type="primary" @click="toggleEnable(row)">
              {{ row.enabled ? '停用' : '启用' }}
            </el-button>
            <el-button text type="danger" :loading="deletingId === row.id" :disabled="Boolean(deletingId)" @click="onDelete(row)">删除</el-button>
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
        <el-form-item label="图片">
          <CatalogIconEditor v-model="pendingIcon" v-model:removed="removeIcon" profile="expert" :current-url="formIconUrl" :disabled="saving || zipValidating || detailLoading" @validating="iconValidating=$event" />
        </el-form-item>
        <el-form-item label="名称" required :error="fieldErrors.name">
          <el-input v-model="form.name" maxlength="40" placeholder="用户看到的名称，可以是中文" @input="fieldErrors.name = ''" />
        </el-form-item>
        <el-form-item label="一句话介绍" :required="saveIntent === 'enable' || editingEnabled" :error="fieldErrors.summary">
          <el-input
            v-model="form.summary"
            type="textarea"
            :rows="2"
            maxlength="140"
            show-word-limit
            placeholder="用一句话说明这个技能做什么"
            @input="fieldErrors.summary = ''"
          />
        </el-form-item>
        <el-form-item label="分类">
          <el-select
            v-model="form.categories"
            multiple
            clearable
            collapse-tags
            collapse-tags-tooltip
            :multiple-limit="3"
            placeholder="未设置，最多 3 个"
            style="width: 100%"
          >
            <el-option v-for="item in categoryOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>

        <el-form-item v-if="showStoredPackage" label="技能包">
          <div class="zip-file-row">
            <span class="zip-file-name">{{ form.key }}</span>
            <button type="button" class="zip-clear" :disabled="saving || zipValidating || detailLoading" aria-label="移除技能包" @click="removeStoredPackage">×</button>
          </div>
        </el-form-item>

        <el-form-item v-if="showSourceChoice" label="创建方式">
          <el-radio-group v-model="createMode">
            <el-radio value="zip">上传技能包</el-radio>
            <el-radio value="form">在线填写</el-radio>
          </el-radio-group>
        </el-form-item>

        <template v-if="showZipPicker">
          <el-form-item label="技能包 ZIP" :required="saveIntent === 'enable' && !editingId" :error="fieldErrors.zip">
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
              <div v-if="zipFile" class="zip-file-row">
                <span class="zip-file-name">{{ zipFile.name }}</span>
                <button type="button" class="zip-clear" :disabled="saving || zipValidating" aria-label="移除技能包" @click="clearZip">×</button>
              </div>
            </div>
          </el-form-item>
          <el-descriptions v-if="zipPreview" :column="1" border size="small" class="zip-preview">
            <el-descriptions-item label="标识">{{ zipPreview.key }}</el-descriptions-item>
            <el-descriptions-item label="预览名称">{{ zipPreview.name }}</el-descriptions-item>
            <el-descriptions-item label="预览介绍">{{ zipPreview.summary || '—' }}</el-descriptions-item>
            <el-descriptions-item label="资源数">{{ zipPreview.resourceCount }}</el-descriptions-item>
          </el-descriptions>
        </template>

        <template v-if="showInstruction">
          <el-form-item label="技能指令" :required="saveIntent === 'enable' || editingEnabled" :error="fieldErrors.instruction">
            <el-input
              v-model="form.instruction"
              type="textarea"
              :rows="8"
              maxlength="100000"
              placeholder="步骤、要求和输出。名称和介绍不能代替这段执行内容"
              @input="fieldErrors.instruction = ''"
            />
          </el-form-item>
        </template>

      </el-form>

      <template #footer>
        <el-button :disabled="saving || zipValidating" @click="editorOpen = false">取消</el-button>
        <el-button v-if="!editingEnabled" :loading="saving && saveIntent === 'save'" :disabled="zipValidating || detailLoading || iconValidating" @click="onSave(false)">保存</el-button>
        <el-button v-if="!editingEnabled" type="primary" :loading="saving && saveIntent === 'enable'" :disabled="zipValidating || detailLoading || iconValidating" @click="onSave(true)">保存并启用</el-button>
        <el-button v-else type="primary" :loading="saving" :disabled="zipValidating || detailLoading || iconValidating" @click="onSave(false)">保存修改</el-button>
      </template>
    </el-dialog>
    <CatalogDiscoveryEditor v-if="discoveryId" kind="skill" :resource-id="discoveryId" :skill-enabled="discoveryEnabled" @close="discoveryId=''" @saved="reload" />
  </section>
</template>

<script setup lang="ts">
import CatalogDiscoveryEditor from '../../components/CatalogDiscoveryEditor.vue';
const discoveryId=ref('');
const discoveryEnabled=ref(false);
import CatalogIconEditor from '../../components/CatalogIconEditor.vue';
import { computed, h, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type UploadFile, type UploadInstance } from 'element-plus';
import {
  BarChart3,
  BadgeCheck,
  Briefcase,
  FileText,
  FolderOpen,
  GraduationCap,
  Handshake,
  Heart,
  Landmark,
  MessagesSquare,
  PenLine,
  Scale,
  Search,
  ShoppingBag,
  Sparkles,
  Users,
} from 'lucide-vue-next';
import {
  adminOfficialSkillApi,
  type OfficialSkillCategory,
  type OfficialSkillRow,
  type OfficialSkillZipPreview,
} from '../../api/admin';
import { clampPage, keepStoredExecution, skillDeleteConfirm, skillDeleteRequest, skillFormIssues, skillFormToast } from '../../utils/skill-form';

const rows = ref<OfficialSkillRow[]>([]);
const categoryFilter = ref<OfficialSkillCategory | ''>('');
function rowCategories(row: OfficialSkillRow): OfficialSkillCategory[] {
  if (row.categories?.length) return row.categories;
  return row.category ? [row.category] : [];
}
const filteredRows = computed(() => categoryFilter.value ? rows.value.filter(row => rowCategories(row).includes(categoryFilter.value as OfficialSkillCategory)) : rows.value);
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
  currentPage.value = clampPage(currentPage.value, pageSize.value, filteredRows.value.length);
}, { flush: 'sync' });

const editorOpen = ref(false);
const editingId = ref('');
const editingEnabled = ref(false);
const contentSource = ref<'zip' | 'form' | 'none'>('none');
const formUpdatedAt = ref('');
const saveIntent = ref<'save' | 'enable'>('save');
const saving = ref(false);
const deletingId = ref('');
const thumbFailed = reactive<Record<string, string>>({});
const fieldErrors = reactive({ name: '', summary: '', instruction: '', zip: '' });
const pendingIcon=ref<File|null>(null);
const removeIcon=ref(false);
const iconValidating=ref(false);
const formIconUrl=ref<string|null>(null);
const contentBaseline=ref<{name:string;summary:string;categories:string;instruction:string}|null>(null);
function editorContent(){return {name:form.name.trim(),summary:form.summary.trim(),categories:form.categories.join(','),instruction:form.instruction};}
const detailLoading = ref(false);
let editorSequence = 0;
const createMode = ref<'zip' | 'form'>('zip');
const storedPackageKept = ref(false);
const showStoredPackage = computed(() => Boolean(editingId.value) && contentSource.value === 'zip' && storedPackageKept.value);
const showSourceChoice = computed(() => !showStoredPackage.value);
const showZipPicker = computed(() => showSourceChoice.value && createMode.value === 'zip');
const showInstruction = computed(() => showSourceChoice.value && createMode.value === 'form');
const zipFile = ref<File | null>(null);
const zipPreview = ref<OfficialSkillZipPreview | null>(null);
const zipError = ref('');
const zipValidating = ref(false);
const zipUploadRef = ref<UploadInstance>();

const form = reactive({
  key: '',
  name: '',
  summary: '',
  categories: [] as OfficialSkillCategory[],
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
const availableCategoryOptions = computed(() => categoryOptions.filter(item => rows.value.some(row => rowCategories(row).includes(item.value))));

const categoryIcons: Record<OfficialSkillCategory, unknown> = {
  common: Sparkles,
  content: PenLine,
  analytics: BarChart3,
  office: FileText,
  education: GraduationCap,
  expertise: BadgeCheck,
  business: Briefcase,
  ecommerce: ShoppingBag,
  sales: Handshake,
  hr: Users,
  legal: Scale,
  finance: Landmark,
  consulting: MessagesSquare,
  research: Search,
  files: FolderOpen,
  search: Search,
  writing: PenLine,
  lifestyle: Heart,
};

function categoryIcon(row: OfficialSkillRow) {
  const key = rowCategories(row)[0];
  return (key && categoryIcons[key]) || Sparkles;
}

const categoryColors: Record<OfficialSkillCategory, string> = {
  common: '#5b6ee1',
  content: '#e25b4a',
  analytics: '#1f9d8a',
  office: '#3b82c4',
  education: '#7a5af8',
  expertise: '#d97706',
  business: '#0f766e',
  ecommerce: '#db2777',
  sales: '#ea580c',
  hr: '#0891b2',
  legal: '#4f46e5',
  finance: '#15803d',
  consulting: '#9333ea',
  research: '#0369a1',
  files: '#64748b',
  search: '#0284c7',
  writing: '#be185d',
  lifestyle: '#c026d3',
};

function categoryColor(value: string) {
  return categoryColors[value as OfficialSkillCategory] ?? '#94a3b8';
}

function categoryName(value: string) {
  return categoryOptions.find((item) => item.value === value)?.label ?? value;
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
  editingEnabled.value = false;
  contentSource.value = 'none';
  formUpdatedAt.value = '';
  saveIntent.value = 'save';
  createMode.value = 'zip';
  storedPackageKept.value = false;
  zipFile.value = null;
  zipPreview.value = null;
  zipError.value = '';
  fieldErrors.name = '';
  fieldErrors.summary = '';
  fieldErrors.instruction = '';
  fieldErrors.zip = '';
  form.key = '';
  form.name = '';
  form.summary = '';
  form.categories = [];
  form.instruction = '';
  zipUploadRef.value?.clearFiles();
}

function openDiscovery(row: OfficialSkillRow) {
  discoveryEnabled.value = row.enabled;
  discoveryId.value = row.id;
}

function openCreate() {
  resetEditor();
  editorOpen.value = true;
}

async function openEdit(row: OfficialSkillRow) {
  resetEditor();
  editingId.value = row.id;
  editingEnabled.value = row.enabled;
  contentSource.value = row.contentSource ?? (row.packageRevision > 0 ? 'form' : 'none');
  formUpdatedAt.value = row.updatedAt;
  storedPackageKept.value = contentSource.value === 'zip';
  formIconUrl.value=row.avatarUrl??null;
  createMode.value = contentSource.value === 'zip' ? 'zip' : 'form';
  form.key = row.key;
  form.name = row.name;
  form.summary = row.summary;
  form.categories = rowCategories(row);
  editorOpen.value = true;
  const sequence = editorSequence;
  detailLoading.value = true;
  try {
    const detail = await adminOfficialSkillApi.detail(row.id);
    if (sequence !== editorSequence || !editorOpen.value) return;
    form.instruction = detail.instruction ?? '';
    form.categories = rowCategories(detail);
    formIconUrl.value=detail.avatarUrl??null;
    editingEnabled.value = detail.enabled;
    contentSource.value = detail.contentSource ?? contentSource.value;
    formUpdatedAt.value = detail.updatedAt;
    storedPackageKept.value = contentSource.value === 'zip';
    createMode.value = contentSource.value === 'zip' ? 'zip' : 'form';
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
    if (preview.keyConflict && !editingId.value && !preview.keyDerived) {
      zipError.value = `技能标识「${preview.key}」已存在，未创建新技能`;
      fieldErrors.zip = zipError.value;
      return;
    }
    if (editingId.value && !preview.keyDerived && preview.key !== form.key) {
      zipError.value = '技能包标识与当前技能不一致，原技能未替换';
      fieldErrors.zip = zipError.value;
      return;
    }
    zipPreview.value = preview;
    fieldErrors.zip = '';
    if (!form.name.trim()) form.name = preview.name;
    if (!form.summary.trim()) form.summary = preview.summary;
    if (!form.categories.length) {
      const next = preview.categories?.length ? preview.categories : (preview.category ? [preview.category] : []);
      if (next.length) form.categories = next;
    }
  } catch (error) {
    if (sequence === editorSequence && editorOpen.value) {
      zipError.value = error instanceof Error ? error.message : '技能包无法识别，请换一个包再试';
      fieldErrors.zip = zipError.value;
    }
  } finally {
    if (sequence === editorSequence) zipValidating.value = false;
  }
}

function applyIssues(enable: boolean) {
  fieldErrors.name = '';
  fieldErrors.summary = '';
  fieldErrors.instruction = '';
  fieldErrors.zip = '';
  const packageKept = Boolean(editingId.value) && contentSource.value === 'zip' && storedPackageKept.value;
  const replacingZip = createMode.value === 'zip' && !packageKept;
  const issues = skillFormIssues({
    name: form.name,
    summary: form.summary,
    instruction: form.instruction,
    mode: createMode.value,
    replacingZip,
    editing: Boolean(editingId.value),
    enabled: editingEnabled.value,
    enable,
    hasPackage: packageKept || (Boolean(editingId.value) && contentSource.value === 'form'),
    zipSelected: Boolean(zipFile.value),
    zipReady: Boolean(zipPreview.value),
    zipError: zipError.value,
    contentSource: contentSource.value,
  });
  if (editingId.value && contentSource.value === 'zip' && !storedPackageKept.value) {
    if (createMode.value === 'zip' && !zipPreview.value) issues.zip = issues.zip || '请上传并通过校验的技能包';
    if (createMode.value === 'form' && !form.instruction.trim()) issues.instruction = issues.instruction || '请填写技能指令';
  }
  Object.assign(fieldErrors, issues);
  const toast = skillFormToast(issues);
  if (toast) ElMessage.warning(toast);
  return !toast;
}

function clearZip() {
  zipFile.value = null;
  zipPreview.value = null;
  zipError.value = '';
  fieldErrors.zip = '';
  zipUploadRef.value?.clearFiles();
}

function removeStoredPackage() {
  storedPackageKept.value = false;
  createMode.value = 'zip';
  clearZip();
}

async function onSave(enable: boolean) {
  if (saving.value || zipValidating.value || detailLoading.value || iconValidating.value) return;
  saveIntent.value = enable ? 'enable' : 'save';
  if (!applyIssues(enable)) return;
  saving.value = true;
  try {
    const wasNew=!editingId.value;
    let next:OfficialSkillRow|undefined;
    const kept = keepStoredExecution({
      enable,
      summary: form.summary.trim(),
      instruction: form.instruction,
      previousSummary: contentBaseline.value?.summary ?? '',
      previousInstruction: contentBaseline.value?.instruction ?? '',
      hasPackage: contentSource.value !== 'none',
    });
    const usingZip = Boolean(zipFile.value && zipPreview.value) && createMode.value === 'zip' && (wasNew || !storedPackageKept.value);
    if(wasNew && usingZip){
      const body=new FormData();
      body.append('file', zipFile.value as File);
      body.append('name', form.name.trim());
      if (kept.summary !== undefined) body.append('summary', kept.summary);
      body.append('categories', JSON.stringify(form.categories));
      next=await adminOfficialSkillApi.createFromZip(body);
    }else if(wasNew){
      next=await adminOfficialSkillApi.createFromForm({
        name: form.name.trim(),
        ...(kept.summary !== undefined ? { summary: kept.summary } : {}),
        categories: form.categories,
        ...(createMode.value === 'form' && kept.instruction?.trim() ? { instruction: kept.instruction } : {}),
      });
    }else if(usingZip){
      const body=new FormData();
      body.append('file', zipFile.value as File);
      body.append('name', form.name.trim());
      if (kept.summary !== undefined) body.append('summary', kept.summary);
      body.append('categories', JSON.stringify(form.categories));
      if(formUpdatedAt.value) body.append('expectedUpdatedAt', formUpdatedAt.value);
      next=await adminOfficialSkillApi.replaceZip(editingId.value, body);
    }else{
      const value=editorContent(),previous=contentBaseline.value;
      const replaceWithForm = contentSource.value === 'zip' && !storedPackageKept.value && createMode.value === 'form';
      const patch={
        ...(value.name!==previous?.name?{name:value.name}:{}),
        ...(kept.summary!==undefined && value.summary!==previous?.summary?{summary:value.summary}:{}),
        ...(value.categories!==previous?.categories?{categories:form.categories}:{}),
        ...((replaceWithForm || (contentSource.value!=='zip' && kept.instruction!==undefined && value.instruction!==previous?.instruction))?{instruction:kept.instruction}:{}),
        ...(formUpdatedAt.value?{expectedUpdatedAt:formUpdatedAt.value}:{}),
      };
      const changed = Object.keys(patch).some((key) => key !== 'expectedUpdatedAt');
      if(changed) next=await adminOfficialSkillApi.update(editingId.value, patch);
    }
    if(next){
      editingId.value=next.id;
      form.key=next.key;
      form.instruction=next.instruction??form.instruction;
      formUpdatedAt.value=next.updatedAt;
      editingEnabled.value=next.enabled;
      contentSource.value=next.contentSource??contentSource.value;
      contentBaseline.value=editorContent();
      storedPackageKept.value=contentSource.value==='zip';
      createMode.value=contentSource.value==='zip'?'zip':'form';
    }
    if(editingId.value && pendingIcon.value){
      const body=new FormData();
      body.append('file', pendingIcon.value);
      if(formUpdatedAt.value) body.append('expectedUpdatedAt', formUpdatedAt.value);
      next=await adminOfficialSkillApi.uploadIcon(editingId.value, body);
    }else if(editingId.value && removeIcon.value){
      next=await adminOfficialSkillApi.removeIcon(editingId.value, formUpdatedAt.value);
    }
    if(next){
      formIconUrl.value=next.avatarUrl??null;
      formUpdatedAt.value=next.updatedAt;
      editingEnabled.value=next.enabled;
    }
    pendingIcon.value=null;removeIcon.value=false;
    if(enable){
      try {
        next=await adminOfficialSkillApi.enable(editingId.value);
        editingEnabled.value=next.enabled;
        formUpdatedAt.value=next.updatedAt;
        ElMessage.success('已保存并启用');
        editorOpen.value=false;
      } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '启用失败，内容已保留且仍为停用');
        await reload();
        return;
      }
    } else {
      ElMessage.success(editingEnabled.value ? '已保存修改' : '已保存');
      editorOpen.value=false;
    }
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
  if (deletingId.value) return;
  const copy = skillDeleteConfirm({ name: row.name });
  const skillName = row.name.trim() || '未命名技能';
  let confirmed = false;
  try {
    await ElMessageBox.confirm(
      h('span', null, [
        '确定删除技能「',
        h('span', { style: { color: 'var(--el-color-primary, #409eff)' } }, skillName),
        '」？删除后不可再选用，已有对话和任务记录不受影响。',
      ]),
      copy.title,
      {
        type: 'warning',
        customClass: 'official-skill-message-box',
        confirmButtonText: copy.confirm,
        cancelButtonText: copy.cancel,
        confirmButtonClass: 'el-button--danger',
        closeOnClickModal: false,
      },
    );
    confirmed = true;
  } catch {
    confirmed = false;
  }
  if (skillDeleteRequest({ confirmed, inFlight: Boolean(deletingId.value) }) !== 'call') return;
  deletingId.value = row.id;
  try {
    await adminOfficialSkillApi.remove(row.id);
    if (editingId.value === row.id) editorOpen.value = false;
    if (discoveryId.value === row.id) discoveryId.value = '';
    ElMessage.success('已删除');
    await reload();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  } finally {
    deletingId.value = '';
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
.name-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.name-copy { min-width: 0; }
.skill-thumb {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 6px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
}
.skill-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; background: var(--el-fill-color-light); }
.cat-list { display: flex; flex-wrap: wrap; gap: 4px 10px; }
.cat-mark { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.cat-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 8px; }
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
.zip-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  min-width: 0;
}
.zip-file-name { margin-top: 0; line-height: 1.6; overflow-wrap: anywhere; min-width: 0; flex: 1; }
.zip-clear {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.zip-clear:disabled { cursor: not-allowed; opacity: 0.5; }
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
  width: 480px;
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
