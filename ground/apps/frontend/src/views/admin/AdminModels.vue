<template>
  <Teleport to="body">
    <div v-if="probingIds.length || bulkRunning" class="probe-toast" role="status">
      <span class="probe-spinner" aria-hidden="true" />
      <span>{{ probeToastText }}</span>
    </div>
  </Teleport>
  <section class="models-page">
    <div class="page-head">
      <div>
        <h1>模型管理</h1>
      </div>
      <div class="page-head-actions">
        <el-input
          v-model="keyword"
          class="page-search"
          clearable
          placeholder="搜索 Model ID / 显示名 / 厂商"
        />
        <el-select-v2
          v-model="selectedProvider"
          class="page-filter"
          popper-class="models-filter-popper"
          aria-label="厂商筛选"
          clearable
          :filterable="false"
          :options="providerSelectOptions"
          placeholder="全部厂商"
        >
          <template #default="{ item }"><span class="mark"><i class="mark-dot" :style="{ backgroundColor: item.color }" /><span>{{ item.label }}</span></span></template>
          <template #label="{ label, value }"><span class="mark"><i class="mark-dot" :style="{ backgroundColor: providerColor(value) }" /><span>{{ label }}</span></span></template>
        </el-select-v2>
        <el-select-v2
          v-show="showPurposeFilter"
          v-model="selectedPurpose"
          class="page-filter"
          popper-class="models-filter-popper"
          aria-label="用途筛选"
          clearable
          placeholder="全部用途"
          :filterable="false"
          :options="purposeOptions"
        />
        <el-select-v2
          v-model="selectedStatus"
          class="page-filter"
          popper-class="models-filter-popper"
          aria-label="运行状态"
          clearable
          :filterable="false"
          :options="statusSelectOptions"
          placeholder="全部状态"
        >
          <template #default="{ item }"><span class="mark"><i class="mark-dot" :style="{ backgroundColor: item.color }" /><span :style="{ color: item.color }">{{ item.label }}</span></span></template>
          <template #label="{ label, value }"><span class="mark"><i class="mark-dot" :style="{ backgroundColor: statusColor(value) }" /><span :style="{ color: statusColor(value) }">{{ label }}</span></span></template>
        </el-select-v2>
        <el-select-v2
          v-model="selectedEnabled"
          class="page-filter"
          popper-class="models-filter-popper"
          aria-label="启用筛选"
          clearable
          :filterable="false"
          :options="enabledSelectOptions"
          placeholder="启用与禁用"
        >
          <template #default="{ item }"><span class="mark"><i class="mark-dot" :style="{ backgroundColor: item.color }" /><span :style="{ color: item.color }">{{ item.label }}</span></span></template>
          <template #label="{ label, value }"><span class="mark"><i class="mark-dot" :style="{ backgroundColor: enabledColor(value) }" /><span :style="{ color: enabledColor(value) }">{{ label }}</span></span></template>
        </el-select-v2>
        <el-button @click="resetFilters">重置</el-button>
        <el-button type="danger" :disabled="!selectedRows.length || deletingSelected" :loading="deletingSelected" @click="onDeleteSelected">{{ selectedRows.length ? `删除所选 (${selectedRows.length})` : '删除所选' }}</el-button>
        <el-button type="primary" :disabled="(!selectedRows.length && bulkSource !== 'selected') || (bulkRunning && bulkSource !== 'selected')" @click="testSelected">{{ bulkRunning && bulkSource === 'selected' ? '停止测试' : (selectedRows.length ? `测试所选 (${selectedRows.length})` : '测试所选') }}</el-button>
        <el-button type="primary" :disabled="bulkRunning && bulkSource !== 'enabled'" @click="testEnabled">{{ bulkRunning && bulkSource === 'enabled' ? '停止测试' : '测试已启用' }}</el-button>
        <el-button type="primary" @click="openCreate">新建模型</el-button>
      </div>
    </div>

    <el-alert
      v-if="error"
      class="page-alert"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    />

    <el-empty
      v-if="!loading && !error && flatRows.length === 0"
      description="暂无模型，请点击「新建模型」"
    >
      <el-button type="primary" @click="openCreate">新建模型</el-button>
    </el-empty>

    <div v-else class="panel">
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="pagedRows"
        border
        class="model-table"
        row-key="key"
        header-cell-class-name="model-table-header"
        empty-text="无匹配结果"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" reserve-selection />
        <el-table-column label="Model ID" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.model.modelId }}</template>
        </el-table-column>
        <el-table-column label="显示名" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.model.displayName }}</template>
        </el-table-column>
        <el-table-column label="用途" width="105" align="center"><template #default="{row}"><el-tag :type="isImage(row.model)?'warning':'info'">{{isImage(row.model)?'生成图片':'对话'}}</el-tag></template></el-table-column>
        <el-table-column label="厂商" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="prov-name" :style="{ color: providerColor(row.provider.id) }">{{ row.provider.displayName }}</span>
          </template>
        </el-table-column>
        <el-table-column v-if="selectedPurpose!=='image'" label="默认" width="120" align="center">
          <template #default="{ row }"><span v-if="isImage(row.model)">—</span><el-tag v-else-if="row.model.isPreferred" type="success">默认模型</el-tag><el-button v-else link type="primary" :disabled="!row.model.enabled" :loading="busyModelId === row.model.id" @click="onRoutingChange(row.model,{isPreferred:true})">设为默认</el-button></template>
        </el-table-column>
        <el-table-column v-if="selectedPurpose!=='image'" label="优先级（小优先）" width="165"><template #default="{ row }"><span v-if="isImage(row.model)">—</span><el-input-number v-else :model-value="row.model.sortOrder" :min="0" :max="10000" :precision="0" :disabled="busyModelId === row.model.id" @change="(value: number | undefined) => value !== undefined && onRoutingChange(row.model,{sortOrder:value})" /></template></el-table-column>
        <el-table-column label="运行状态" min-width="195"><template #default="{ row }">
          <span v-if="isImage(row.model)">—</span>
          <span v-else class="mark"><i class="mark-dot" :style="{ backgroundColor: statusColor(row.model.health?.status) }" /><span :style="{ color: statusColor(row.model.health?.status) }">{{ healthLabel(row.model.health?.status) }}</span></span>
          <div v-if="!isImage(row.model)" class="prov-sub">{{ row.model.health?.reason }}</div>
          <div v-if="!isImage(row.model) && row.model.health?.checkedAt" class="prov-sub">{{ new Date(row.model.health.checkedAt).toLocaleString('zh-CN') }} · {{ row.model.health.latencyMs ?? '—' }}ms</div>
        </template></el-table-column>
        <el-table-column v-if="selectedPurpose!=='image'" label="工具调用" width="90" align="center"><template #default="{ row }"><el-switch v-if="!isImage(row.model)" :model-value="row.model.supportsTools" :disabled="busyModelId === row.model.id" @change="(value: boolean) => onRoutingChange(row.model,{supportsTools:value})" /></template></el-table-column>
        <el-table-column v-if="selectedPurpose!=='image'" label="图片输入" width="90" align="center"><template #default="{ row }"><el-switch v-if="!isImage(row.model)" :model-value="row.model.supportsVision" :disabled="busyModelId === row.model.id" @change="(value: boolean) => onRoutingChange(row.model,{supportsVision:value})" /></template></el-table-column>
        <el-table-column label="启用" width="148" align="center">
          <template #default="{ row }">
            <span class="enable-cell">
              <span class="mark"><i class="mark-dot" :style="{ backgroundColor: row.model.enabled ? enabledColor('enabled') : enabledColor('disabled') }" /><span :style="{ color: row.model.enabled ? enabledColor('enabled') : enabledColor('disabled') }">{{ row.model.enabled ? '已启用' : '已禁用' }}</span></span>
              <el-switch
                :model-value="row.model.enabled"
                :loading="busyModelId === row.model.id"
                @change="(v: boolean) => onToggleModel(row.model, v)"
              />
            </span>
          </template>
        </el-table-column>
        <el-table-column v-if="selectedPurpose!=='image'" label="普通对话思考" width="150" align="center">
          <template #header>
            <el-tooltip content="默认关闭。开启后普通对话和工具调用都会启用深度思考，通常响应更慢。关闭后都不强制思考。实际效果取决于模型支持。" placement="top" :show-after="200">
              <span class="thinking-header" tabindex="0">普通对话思考 ⓘ</span>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <el-switch
              v-if="!isImage(row.model)" :model-value="row.model.thinkingEnabled"
              :loading="busyModelId === row.model.id"
              @change="(v: boolean) => onToggleThinking(row.model, v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right" align="center">
          <template #default="{ row }">
            <div class="op-row">
              <el-button v-if="isImage(row.model)" text type="primary" :disabled="!row.model.enabled || !row.provider.enabled" @click="openImagePreview(row)">预览生成</el-button>
              <el-button
                v-else text
                type="primary"
                @click="onProbeSaved(row.model)"
              >
                {{ probingIds.includes(row.model.id) ? '中断' : '测试' }}
              </el-button>
              <el-button text type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button
                text
                type="danger"
                :loading="busyModelId === row.model.id"
                @click="onDeleteModel(row.model)"
              >
                删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-if="filteredRows.length > 0"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        class="model-pagination"
        background
        :page-sizes="[10, 20, 50, 100]"
        :total="filteredRows.length"
        layout="total, sizes, prev, pager, next"
      />
    </div>

    <!-- 新建 / 编辑 同一弹窗 -->
    <el-dialog
      v-model="dialog.visible"
      class="models-dialog"
      :title="dialog.mode === 'create' ? '新建模型' : '编辑模型'"
      width="640px"
      align-center
      :close-on-click-modal="false"
      append-to-body
      destroy-on-close
    >
      <el-form label-width="96px" @submit.prevent>
        <div class="form-section-title">厂商</div>
        <el-form-item label="厂商名" required>
          <el-input v-model="dialog.form.displayName" placeholder="如 DeepSeek、极客智坊" />
          <div v-if="vendorNameConflict" class="hint name-conflict">厂商名「{{ vendorNameConflict }}」已存在</div>
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="dialog.form.baseUrl" placeholder="https://api.deepseek.com" />
          <div v-if="geekAiDialog" class="hint">国内入口。保存时只接收对话模型，并按这把密钥的人民币价格计费。美元标价、画图和视频模型不会出现在网页和桌面客户端。</div>
        </el-form-item>
        <el-form-item label="API Key" :required="dialog.mode === 'create'">
          <el-input
            v-model="dialog.form.apiKey"
            type="password"
            show-password
            :placeholder="dialog.mode === 'edit' && dialog.hasApiKey ? '留空则保持原 Key' : 'sk-…'"
          />
          <div v-if="dialog.mode === 'edit' && dialog.hasApiKey" class="hint">
            当前掩码：{{ dialog.apiKeyMasked }}。这把 Key 属于厂商，保存后该厂商下的模型都会使用它。
          </div>
        </el-form-item>

        <div v-if="dialog.mode === 'edit' && dialog.editingModelId" class="form-section-title">模型</div>
        <div v-if="dialog.mode === 'edit' && dialog.editingModelId" class="hint">Model ID：{{ dialog.editingModelId }}</div>

        <div v-if="dialog.mode === 'create'" class="form-section-title row-between">
          <span>模型</span>
          <div class="section-actions">
            <el-button
              :loading="dialog.fetching"
              :disabled="dialog.saving || dialog.testingSelected"
              @click="onFetchRemoteModels"
            >
              获取最新模型
            </el-button>
            <el-button
              :loading="dialog.testingSelected"
              :disabled="dialog.saving || dialog.fetching || selectedModelIds.length === 0"
              @click="onTestSelected"
            >
              测试所选
            </el-button>
          </div>
        </div>

        <el-alert
          v-if="dialog.mode === 'create' && dialog.fetchError"
          class="fetch-alert"
          :title="dialog.fetchError"
          type="error"
          show-icon
          :closable="false"
        />

        <div v-if="dialog.mode === 'create' && listedModels.length" class="remote-list">
          <el-checkbox
            v-if="visibleRemoteModels.length"
            class="remote-select-all"
            :model-value="allVisibleSelected"
            :indeterminate="visibleSelectionIndeterminate"
            @change="(checked: boolean | string | number) => toggleVisibleSelection(Boolean(checked))"
          >全选</el-checkbox>
          <el-checkbox-group v-model="dialog.selectedIds">
            <div
              v-for="m in listedModels"
              :key="m.id"
              class="remote-item"
            >
              <el-checkbox :value="m.id">
                <span class="remote-id">{{ m.id }}</span>
                <span v-if="m.name && m.name !== m.id" class="remote-owned">{{ m.name }}</span>
                <span v-else-if="m.ownedBy" class="remote-owned">{{ m.ownedBy }}</span>
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </div>
        <div v-if="dialog.mode === 'create' && geekAiDialog && hiddenRemoteCount" class="hint">已隐藏 {{ hiddenRemoteCount }} 个非对话模型</div>

        <el-form-item v-if="dialog.mode === 'create'" label="手填 Model ID" class="manual-item">
          <el-input
            v-model="dialog.manualDraft"
            placeholder="输入 Model ID 后回车添加"
            @keydown.enter.prevent="addManualModel"
          />
          <div class="hint">拉取失败或列表里没有时，回车补进上面的勾选列表</div>
        </el-form-item>

      </el-form>

      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="dialog.saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="imageEdit.visible" title="编辑生图模型" width="420px" align-center :close-on-click-modal="false">
      <el-form label-position="top"><el-form-item label="模型名称"><el-input v-model="imageEdit.name" maxlength="128" /></el-form-item></el-form>
      <template #footer><el-button @click="imageEdit.visible=false">取消</el-button><el-button type="primary" :loading="imageEdit.saving" :disabled="!imageEdit.name.trim()" @click="saveImageName">保存修改</el-button></template>
    </el-dialog>
    <AvatarGenerationDialog v-model="imagePreviewOpen" :initial-model="imagePreviewModel" preview-only />
  </section>
</template>

<script setup lang="ts">
import AvatarGenerationDialog from '../../components/AvatarGenerationDialog.vue';
import { confirmDelete } from '../../utils/confirm-delete';

import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  adminLlmProviderApi,
  type AdminLlmModelRow,
  type AdminLlmProviderRow,
} from '@/api/admin';
import { ApiError } from '@/api/http';
type FlatRow = {
  key: string;
  provider: AdminLlmProviderRow;
  model: AdminLlmModelRow;
};

const loading = ref(false);
const tableRef = ref<{ clearSelection: () => void } | null>(null);
const selectedRows = ref<FlatRow[]>([]);
const deletingSelected = ref(false);
function onSelectionChange(rows: FlatRow[]) { selectedRows.value = rows; }
const error = ref('');
const keyword = ref('');
const selectedProvider = ref('');
const showPurposeFilter = false;
const selectedPurpose = ref('');
const selectedStatus = ref('');
const selectedEnabled = ref('');
const purposeOptions = [
  { value: '', label: '全部用途' },
  { value: 'chat', label: '对话' },
  { value: 'image', label: '生成图片' },
];
const isImage = (model: AdminLlmModelRow) => model.purpose === 'image';
const imageEdit = reactive({ visible: false, id: '', name: '', saving: false });
const imagePreviewOpen = ref(false);
const imagePreviewModel = ref<{ providerId: string; model: string }>();
function openImagePreview(row: FlatRow) {
  imagePreviewModel.value = { providerId: row.provider.id, model: row.model.modelId };
  imagePreviewOpen.value = true;
}
async function saveImageName() {
  if (!imageEdit.name.trim()) return;
  imageEdit.saving = true;
  try {
    await adminLlmProviderApi.updateModel(imageEdit.id, { displayName: imageEdit.name.trim() });
    imageEdit.visible = false;
    await reload(true);
    ElMessage.success('已保存');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    imageEdit.saving = false;
  }
}
const providers = ref<AdminLlmProviderRow[]>([]);
const busyModelId = ref<string | null>(null);
const probes = new Map<string, AbortController>();
const probingIds = ref<string[]>([]);
const bulkRunning = ref(false);
const bulkSource = ref<'enabled' | 'selected' | ''>('');
let bulkStop: AbortController | null = null;

function autoUsable(row: FlatRow) {
  const status = row.model.health?.status;
  return row.model.enabled && row.provider.enabled !== false && row.provider.hasApiKey !== false && !isImage(row.model) && (status === 'healthy' || status === 'degraded');
}
function compareRows(a: FlatRow, b: FlatRow) {
  return Number(!autoUsable(a)) - Number(!autoUsable(b))
    || Number(Boolean(b.model.isPreferred)) - Number(Boolean(a.model.isPreferred))
    || a.model.sortOrder - b.model.sortOrder
    || (a.provider.sortOrder || 0) - (b.provider.sortOrder || 0)
    || a.model.modelId.localeCompare(b.model.modelId);
}
const flatRows = computed<FlatRow[]>(() => {
  const out: FlatRow[] = [];
  for (const p of providers.value) {
    for (const m of p.models) out.push({ key: m.id, provider: p, model: m });
  }
  return out.sort(compareRows);
});

function providerColor(id?: string) {
  if (!id) return '#909399';
  const index = providers.value.findIndex((provider) => provider.id === id);
  const hue = ((index >= 0 ? index : 0) * 47) % 360;
  return `hsl(${hue} 62% 42%)`;
}
const providerSelectOptions = computed(() => [
  { value: '', label: '全部厂商', color: '#909399' },
  ...providers.value.filter((provider) => provider.models.length > 0).map((provider) => ({ value: provider.id, label: provider.displayName || provider.name, color: providerColor(provider.id) })),
]);
const statusColors: Record<string, string> = {
  '': '#909399',
  unchecked: '#5b8def',
  healthy: '#2f9e44',
  degraded: '#e6a23c',
  limited: '#7b61ff',
  unavailable: '#e85d4c',
};
const enabledColors: Record<string, string> = {
  '': '#909399',
  enabled: '#2f9e44',
  disabled: '#e85d4c',
};
function statusColor(value?: string) { return statusColors[value || 'unchecked'] || statusColors.unchecked; }
function enabledColor(value?: string) { return enabledColors[value || ''] || enabledColors['']; }
const statusSelectOptions = [
  { value: '', label: '全部状态', color: statusColors[''] },
  { value: 'unchecked', label: '待检查', color: statusColors.unchecked },
  { value: 'healthy', label: '正常', color: statusColors.healthy },
  { value: 'degraded', label: '波动观察中', color: statusColors.degraded },
  { value: 'limited', label: '限流冷却', color: statusColors.limited },
  { value: 'unavailable', label: '故障隔离', color: statusColors.unavailable },
];
const enabledSelectOptions = [
  { value: '', label: '启用与禁用', color: enabledColors[''] },
  { value: 'enabled', label: '已启用', color: enabledColors.enabled },
  { value: 'disabled', label: '已禁用', color: enabledColors.disabled },
];

const probeToastText = computed(() => {
  const names = probingIds.value
    .map((id) => {
      const row = flatRows.value.find((item) => item.model.id === id);
      return row?.model.displayName || row?.model.modelId || '';
    })
    .filter(Boolean);
  if (names.length === 1) return `正在测试 ${names[0]}`;
  if (names.length > 1) return `正在测试 ${names.length} 个模型`;
  return '正在测试…';
});

const filteredRows = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return flatRows.value.filter((r) => {
    if(selectedPurpose.value && (r.model.purpose || 'chat')!==selectedPurpose.value)return false;
    if (selectedProvider.value && r.provider.id !== selectedProvider.value) return false;
    if (selectedStatus.value && healthStatus(r) !== selectedStatus.value) return false;
    if (selectedEnabled.value === 'enabled' && !r.model.enabled) return false;
    if (selectedEnabled.value === 'disabled' && r.model.enabled) return false;
    const hay = `${r.model.modelId} ${r.model.displayName} ${r.provider.name} ${r.provider.displayName}`.toLowerCase();
    return hay.includes(q);
  });
});

const pageSize = ref(20);
const page = ref(1);
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});
function resetFilters() {
  keyword.value = '';
  selectedProvider.value = '';
  selectedPurpose.value = '';
  selectedStatus.value = '';
  selectedEnabled.value = '';
}
watch([keyword, selectedProvider, selectedPurpose, selectedStatus, selectedEnabled, pageSize], () => {
  page.value = 1;
  tableRef.value?.clearSelection();
});
watch(filteredRows, (rows) => {
  const last = Math.max(1, Math.ceil(rows.length / pageSize.value));
  if (page.value > last) page.value = last;
});

const dialog = reactive({
  visible: false,
  mode: 'create' as 'create' | 'edit',
  saving: false,
  fetching: false,
  testingSelected: false,
  providerId: '' as string,
  editingModelId: '' as string,
  hasApiKey: false,
  apiKeyMasked: null as string | null,
  existingModelIds: [] as string[],
  fetchError: '' as string,
  remoteModels: [] as Array<{ id: string; ownedBy?: string; name?: string; type?: string; context?: number }>,
  selectedIds: [] as string[],
  manualIds: [] as string[],
  manualDraft: '',
  form: {
    name: '',
    displayName: '',
    baseUrl: '',
    apiKey: '',
  },
});

const selectedModelIds = computed(() =>
  Array.from(new Set(dialog.selectedIds.map((x) => String(x).trim()).filter(Boolean))),
);

function resetDialogModels() {
  dialog.fetchError = '';
  dialog.remoteModels = [];
  dialog.selectedIds = [];
  dialog.manualIds = [];
  dialog.manualDraft = '';
  dialog.existingModelIds = [];
}

async function reload(quiet = false) {
  if (!quiet) loading.value = true;
  error.value = '';
  try {
    providers.value = await adminLlmProviderApi.list();
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败';
  } finally {
    if (!quiet) loading.value = false;
  }
}

function providerShortName(displayName: string) {
  const base = displayName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').replace(/^[^a-z0-9]+/, '').replace(/-+/g, '-').replace(/-+$/, '').slice(0, 64) || 'vendor';
  const taken = new Set(providers.value.map((provider) => provider.name.toLowerCase()));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 50)}-${Date.now().toString(36)}`;
}

function isGeekAiBase(baseUrl: string | null | undefined) {
  try {
    const url = new URL(baseUrl || '');
    return url.protocol === 'https:' && url.hostname === 'geekai.co' && (url.pathname === '/api/v1' || url.pathname === '/api/v1/');
  } catch {
    return false;
  }
}
const geekAiDialog = computed(() => isGeekAiBase(dialog.form.baseUrl));
const visibleRemoteModels = computed(() =>
  geekAiDialog.value ? dialog.remoteModels.filter((m) => !m.type || m.type === 'chat') : dialog.remoteModels,
);
const hiddenRemoteCount = computed(() => dialog.remoteModels.length - visibleRemoteModels.value.length);
const listedModels = computed(() => {
  const remote = visibleRemoteModels.value;
  const remoteIds = new Set(remote.map((model) => model.id));
  const extras = new Set<string>();
  for (const id of [...dialog.manualIds, ...dialog.existingModelIds, ...dialog.selectedIds]) {
    const trimmed = String(id).trim();
    if (trimmed && !remoteIds.has(trimmed)) extras.add(trimmed);
  }
  return [...remote, ...[...extras].sort((a, b) => a.localeCompare(b)).map((id) => ({ id }))];
});
const selectedVisibleCount = computed(() => visibleRemoteModels.value.filter((model) => dialog.selectedIds.includes(model.id)).length);
const allVisibleSelected = computed(() => visibleRemoteModels.value.length > 0 && selectedVisibleCount.value === visibleRemoteModels.value.length);
const visibleSelectionIndeterminate = computed(() => selectedVisibleCount.value > 0 && selectedVisibleCount.value < visibleRemoteModels.value.length);
function toggleVisibleSelection(checked: boolean) {
  const visible = new Set(visibleRemoteModels.value.map((model) => model.id));
  if (checked) {
    const next = new Set(dialog.selectedIds);
    for (const id of visible) next.add(id);
    dialog.selectedIds = [...next];
    return;
  }
  dialog.selectedIds = dialog.selectedIds.filter((id) => !visible.has(id));
}
function addManualModel() {
  const id = dialog.manualDraft.trim();
  dialog.manualDraft = '';
  if (!id) return;
  if (!visibleRemoteModels.value.some((model) => model.id === id) && !dialog.manualIds.includes(id)) dialog.manualIds.push(id);
  if (!dialog.selectedIds.includes(id)) dialog.selectedIds.push(id);
}

const vendorNameConflict = computed(() => {
  const name = dialog.form.displayName.trim().toLowerCase();
  if (!name) return '';
  const found = providers.value.find((provider) => provider.id !== dialog.providerId && provider.displayName.trim().toLowerCase() === name);
  return found?.displayName || '';
});

function openCreate() {
  dialog.mode = 'create';
  dialog.providerId = '';
  dialog.editingModelId = '';
  dialog.hasApiKey = false;
  dialog.apiKeyMasked = null;
  dialog.form = { name: '', displayName: '', baseUrl: '', apiKey: '' };
  resetDialogModels();
  dialog.visible = true;
}

function openEditProvider(provider: AdminLlmProviderRow, preferModelId?: string) {
  dialog.mode = 'edit';
  dialog.providerId = provider.id;
  dialog.editingModelId = preferModelId || '';
  dialog.hasApiKey = provider.hasApiKey;
  dialog.apiKeyMasked = provider.apiKeyMasked;
  dialog.form = {
    name: provider.name,
    displayName: provider.displayName,
    baseUrl: provider.baseUrl || '',
    apiKey: '',
  };
  resetDialogModels();
  dialog.existingModelIds = provider.models.map((m) => m.modelId);
  const prefer = preferModelId && provider.models.some((m) => m.modelId === preferModelId)
    ? preferModelId
    : provider.models[0]?.modelId;
  dialog.selectedIds = prefer ? [prefer] : [];
  dialog.visible = true;
}

function openEdit(row: FlatRow) {
  if(isImage(row.model)){Object.assign(imageEdit,{visible:true,id:row.model.id,name:row.model.displayName});return;}
  openEditProvider(row.provider, row.model.modelId);
}

async function onFetchRemoteModels() {
  dialog.fetching = true;
  dialog.fetchError = '';
  try {
    const body: Parameters<typeof adminLlmProviderApi.listRemoteModels>[0] = {
      baseUrl: dialog.form.baseUrl.trim() || undefined,
      apiKey: dialog.form.apiKey.trim() || undefined,
    };
    if (dialog.mode === 'edit' && dialog.providerId) body.providerId = dialog.providerId;
    const res = await adminLlmProviderApi.listRemoteModels(body);
    if (!res.ok) {
      dialog.fetchError = res.message || '拉取失败，请手填 Model ID';
      dialog.remoteModels = [];
      return;
    }
    dialog.remoteModels = res.models || [];
    if (!dialog.remoteModels.length) {
      dialog.fetchError = '上游未返回模型，请手填 Model ID';
    } else {
      ElMessage.success(res.message || `已获取 ${dialog.remoteModels.length} 个`);
    }
  } catch (e) {
    dialog.fetchError = e instanceof ApiError ? e.message : '拉取失败，请手填 Model ID';
    dialog.remoteModels = [];
  } finally {
    dialog.fetching = false;
  }
}

async function onTestSelected() {
  const ids = selectedModelIds.value;
  if (!ids.length) {
    ElMessage.warning('请先勾选或手填模型');
    return;
  }
  dialog.testingSelected = true;
  try {
    let okCount = 0;
    for (const modelId of ids) {
      try {
        const body: Parameters<typeof adminLlmProviderApi.probe>[0] = {
          baseUrl: dialog.form.baseUrl.trim() || undefined,
          apiKey: dialog.form.apiKey.trim() || undefined,
          modelId,
        };
        if (dialog.mode === 'edit' && dialog.providerId) body.providerId = dialog.providerId;
        const res = await adminLlmProviderApi.probe(body);
        if (res.ok) okCount += 1;
      } catch {
        /* counted as fail */
      }
    }
    if (okCount === ids.length) ElMessage.success(`全部连通（${okCount}/${ids.length}）`);
    else ElMessage.warning(`连通 ${okCount}/${ids.length}，失败不关闭窗口`);
  } finally {
    dialog.testingSelected = false;
  }
}

async function onSave() {
  dialog.saving = true;
  try {
    const displayName = dialog.form.displayName.trim();
    const baseUrl = dialog.form.baseUrl.trim();
    const apiKey = dialog.form.apiKey.trim();
    const modelIds = selectedModelIds.value;

    if (!displayName) {
      ElMessage.warning('请填写厂商名');
      return;
    }
    if (vendorNameConflict.value) {
      ElMessage.warning(`厂商名「${vendorNameConflict.value}」已存在`);
      return;
    }
    if (!baseUrl) {
      ElMessage.warning('请填写 Base URL');
      return;
    }

    if (dialog.mode === 'create') {
      const name = providerShortName(displayName);
      if (!apiKey) {
        ElMessage.warning('请填写 API Key');
        return;
      }
      if (!modelIds.length) {
        ElMessage.warning('请至少选择或手填一个 Model ID');
        return;
      }
      await adminLlmProviderApi.create({
        name,
        displayName,
        kind: 'openai_compatible',
        baseUrl,
        apiKey,
        enabled: true,
        models: modelIds.map((modelId, i) => ({
          modelId,
          displayName: dialog.remoteModels.find((m) => m.id === modelId)?.name || modelId,
          enabled: true,
          isPreferred: false,
          thinkingEnabled: false,
          sortOrder: i,
        })),
      });
      ElMessage.success(`已创建厂商与 ${modelIds.length} 个模型`);
    } else {
      const updateBody: Parameters<typeof adminLlmProviderApi.update>[1] = {
        displayName,
        baseUrl,
      };
      if (apiKey) updateBody.apiKey = apiKey;
      await adminLlmProviderApi.update(dialog.providerId, updateBody);

      const existing = new Set(dialog.existingModelIds);
      const toAdd = modelIds.filter((id) => !existing.has(id));
      for (const modelId of toAdd) {
        await adminLlmProviderApi.addModel(dialog.providerId, {
          modelId,
          displayName: dialog.remoteModels.find((m) => m.id === modelId)?.name || modelId,
          enabled: true,
          isPreferred: false,
        });
      }
      if (toAdd.length) ElMessage.success(`已保存厂商，并新增 ${toAdd.length} 个模型`);
      else ElMessage.success('已保存厂商');
    }

    dialog.visible = false;
    await reload();
  } catch (e) {
    const msg = e instanceof ApiError ? e.message : '保存失败';
    ElMessage.error(msg);
  } finally {
    dialog.saving = false;
  }
}

function trackProbe(id: string, ac: AbortController | null) {
  if (ac) probes.set(id, ac);
  else probes.delete(id);
  probingIds.value = [...probes.keys()];
}

async function runProbe(model: AdminLlmModelRow, stop?: AbortSignal) {
  if (stop?.aborted) return { kind: 'stopped' as const, message: '' };
  const ac = new AbortController();
  const onStop = () => {
    ac.abort();
    void adminLlmProviderApi.cancelProbe(model.id).catch(() => {});
  };
  stop?.addEventListener('abort', onStop, { once: true });
  trackProbe(model.id, ac);
  try {
    const res = await adminLlmProviderApi.probe({ modelRowId: model.id }, ac.signal);
    if (ac.signal.aborted || res.message === '已中断') return { kind: 'stopped' as const, message: '' };
    return { kind: res.ok ? 'ok' as const : 'bad' as const, message: res.message || '' };
  } catch (e) {
    if (ac.signal.aborted) return { kind: 'stopped' as const, message: '' };
    throw e;
  } finally {
    stop?.removeEventListener('abort', onStop);
    if (probes.get(model.id) === ac) trackProbe(model.id, null);
  }
}

async function onProbeSaved(m: AdminLlmModelRow) {
  const current = probes.get(m.id);
  if (current) {
    current.abort();
    void adminLlmProviderApi.cancelProbe(m.id).catch(() => {});
    return;
  }
  try {
    const result = await runProbe(m);
    if (result.kind === 'stopped') return;
    if (result.kind === 'bad') {
      try {
        await adminLlmProviderApi.updateModel(m.id, { enabled: false });
        m.enabled = false;
      } catch {
        /* 探测失败时后端也会关掉这个模型。 */
      }
    }
    await reload(true);
    if (result.kind === 'ok') ElMessage.success(result.message || '连通正常');
    else ElMessage.error(`${result.message || '连通失败'}，已自动禁用`);
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '测试失败');
  }
}

async function runBulk(models: AdminLlmModelRow[], disableOnFailure: boolean) {
  bulkRunning.value = true;
  const stop = new AbortController();
  bulkStop = stop;
  let cursor = 0;
  let ok = 0;
  let bad = 0;
  let disabled = 0;
  const worker = async () => {
    while (!stop.signal.aborted) {
      const model = models[cursor++];
      if (!model) return;
      try {
        const result = await runProbe(model, stop.signal);
        if (result.kind === 'ok') ok += 1;
        else if (result.kind === 'bad') {
          bad += 1;
          if (!disableOnFailure) continue;
          try {
            await adminLlmProviderApi.updateModel(model.id, { enabled: false });
            model.enabled = false;
            disabled += 1;
          } catch {
            /* 探测已失败；禁用失败留给汇总说明。 */
          }
        }
      } catch {
        bad += 1;
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(3, models.length) }, () => worker()));
    await reload(true);
    if (stop.signal.aborted) ElMessage.info('已停止');
    else ElMessage.success(`已测完：${ok} 通，${bad} 不通${disabled ? `，已禁用 ${disabled}` : ''}`);
  } finally {
    bulkRunning.value = false;
    if (bulkStop === stop) bulkStop = null;
  }
}

async function testSelected() {
  if (bulkRunning.value) {
    if (bulkSource.value === 'selected') bulkStop?.abort();
    return;
  }
  const picked = selectedRows.value.map((row) => row.model);
  const models = picked.filter((model) => !isImage(model));
  if (!models.length) {
    ElMessage.info(picked.length ? '所选没有可测试的对话模型' : '请先勾选模型');
    return;
  }
  const skipped = picked.length - models.length;
  try {
    await ElMessageBox.confirm(
      `将测试选中的 ${models.length} 个对话模型。启用和禁用都会测，测不通的会自动禁用。${skipped ? `已跳过 ${skipped} 个生图模型。` : ''}可能产生少量费用。同时最多 3 个。`,
      '测试所选',
      { confirmButtonText: '开始', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  bulkSource.value = 'selected';
  try { await runBulk(models, true); }
  finally { bulkSource.value = ''; }
}

async function testEnabled() {
  if (bulkRunning.value) {
    if (bulkSource.value === 'enabled') bulkStop?.abort();
    return;
  }
  const models = flatRows.value.filter((row) => row.model.enabled && !isImage(row.model)).map((row) => row.model);
  if (!models.length) {
    ElMessage.info('没有已启用的模型');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `将测试 ${models.length} 个已启用模型。每个模型会向上游发送一次短对话，可能产生少量费用。测不通的会自动禁用。同时最多 3 个。`,
      '测试已启用',
      { confirmButtonText: '开始', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  bulkSource.value = 'enabled';
  try { await runBulk(models, true); }
  finally { bulkSource.value = ''; }
}

async function onToggleModel(m: AdminLlmModelRow, enabled: boolean) {
  busyModelId.value = m.id;
  try {
    await adminLlmProviderApi.updateModel(m.id, { enabled });
    m.enabled = enabled;
    ElMessage.success(enabled ? '已启用' : '已禁用');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '更新失败');
  } finally {
    busyModelId.value = null;
  }
}

async function onToggleThinking(m: AdminLlmModelRow, thinkingEnabled: boolean) {
  busyModelId.value = m.id;
  try {
    await adminLlmProviderApi.updateModel(m.id, { thinkingEnabled });
    m.thinkingEnabled = thinkingEnabled;
    ElMessage.success(thinkingEnabled ? '已开启普通对话思考' : '已关闭普通对话思考');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '更新失败');
  } finally {
    busyModelId.value = null;
  }
}

async function onDeleteSelected() {
  const rows = selectedRows.value;
  if (!rows.length || deletingSelected.value) return;
  const selectedIds = new Set(rows.map((row) => row.model.id));
  const emptied = providers.value.filter((provider) => provider.models.length > 0 && provider.models.every((model) => selectedIds.has(model.id)));
  try {
    await confirmDelete({
      title: '删除所选模型？',
      name: rows.map((row) => row.model.modelId),
      description: emptied.length
        ? [`将删除 ${rows.length} 个模型。`, `厂商「${emptied.map((provider) => provider.displayName || provider.name).join('、')}」的模型会全部删掉。若仍被检索配置引用，将保留厂商。`]
        : `将删除 ${rows.length} 个模型。`,
      confirmText: '删除所选',
    });
  } catch {
    return;
  }
  deletingSelected.value = true;
  let failed = 0;
  try {
    for (const row of rows) {
      try { await adminLlmProviderApi.removeModel(row.model.id); }
      catch { failed += 1; }
    }
    tableRef.value?.clearSelection();
    await reload();
    ElMessage[failed ? 'error' : 'success'](failed ? `已删除 ${rows.length - failed} 个，${failed} 个失败` : `已删除 ${rows.length} 个模型`);
  } finally {
    deletingSelected.value = false;
  }
}

async function onDeleteModel(m: AdminLlmModelRow) {
  const provider = providers.value.find((p) => p.models.some((x) => x.id === m.id));
  const lastOfProvider = Boolean(provider && provider.models.length <= 1);
  try {
    await confirmDelete({
      title: '删除模型？', name: m.modelId,
      description: lastOfProvider
        ? ['这是该厂商最后一个模型，将移除模型的企业分配。', `若厂商「${provider?.displayName || provider?.name}」仍被检索配置引用，将保留厂商。`]
        : '将从模型列表中删除此模型。',
      confirmText: '删除模型',
    });
  } catch {
    return;
  }
  busyModelId.value = m.id;
  try {
    await adminLlmProviderApi.removeModel(m.id);
    ElMessage.success('已删除模型');
    await reload();
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '删除失败');
  } finally {
    busyModelId.value = null;
  }
}

function healthLabel(status?: string) { return ({unchecked:'待检查',healthy:'正常',degraded:'波动观察中',limited:'限流冷却',unavailable:'故障隔离'} as Record<string,string>)[status || 'unchecked'] || '待检查'; }
function healthStatus(row: FlatRow) { return isImage(row.model) ? '' : (row.model.health?.status || 'unchecked'); }
async function onRoutingChange(model: AdminLlmModelRow, changes: Parameters<typeof adminLlmProviderApi.updateModel>[1]) {
  busyModelId.value=model.id;
  if (changes.sortOrder !== undefined) model.sortOrder = changes.sortOrder;
  if (changes.isPreferred === true) {
    for (const provider of providers.value) for (const item of provider.models) item.isPreferred = item.id === model.id;
  } else if (changes.isPreferred === false) model.isPreferred = false;
  try { await adminLlmProviderApi.updateModel(model.id,changes); await reload(); }
  catch(e){ElMessage.error(e instanceof ApiError ? e.message : '设置失败'); await reload().catch(()=>{});}
  finally{busyModelId.value=null;}
}
let healthTimer: ReturnType<typeof setInterval> | undefined;
onMounted(()=>{void reload();healthTimer=setInterval(()=>{if(dialog.visible||imageEdit.visible||imagePreviewOpen.value||loading.value||busyModelId.value)return;void reload(probingIds.value.length>0||bulkRunning.value);},15000);});
onUnmounted(()=>{clearInterval(healthTimer);bulkStop?.abort();for(const ac of probes.values())ac.abort();});
</script>

<style scoped>
.probe-toast {
  position: fixed;
  top: 16px;
  left: 50%;
  z-index: 4000;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(480px, calc(100vw - 32px));
  padding: 10px 16px;
  background: #fff;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.12);
  color: #333946;
  font-size: 14px;
  line-height: 1.4;
}

.probe-spinner {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  border: 2px solid #d9deff;
  border-top-color: #4A53A3;
  border-radius: 50%;
  animation: probe-spin 0.8s linear infinite;
}

@keyframes probe-spin {
  to { transform: rotate(360deg); }
}

.models-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-size: 13px;
  color: #333946;
  background: #fff;
  padding: 24px;
  --el-color-primary: #4A53A3;
  --el-border-radius-base: 6px;
}
.page-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.page-head h1 {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 600;
  color: #333946;
}
.page-link {
  margin-left: 8px;
  color: #4A53A3;
  text-decoration: none;
  font-size: 12px;
}
.page-link:hover {
  color: #3E468C;
  text-decoration: underline;
}
.page-head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 1;
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  align-items: center;
}
.page-search {
  width: 260px;
}
.page-filter {
  width: 160px;
  --el-border-radius-base: 0;
}
.page-filter :deep(.el-select__wrapper) {
  border-radius: 0;
}
.page-filter :deep(.el-select__selected-item) {
  color: var(--el-text-color-regular);
  font-weight: var(--el-font-weight-primary);
}
.mark {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.mark-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: 0 0 8px;
}
.enable-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.page-alert {
  margin-bottom: 0;
}
.panel {
  background: #fff;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
  overflow: hidden;
}
.model-table {
  width: 100%;
  font-size: 13px;
}
.model-pagination {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  padding: 12px 16px;
}
:deep(.model-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
}
:deep(.model-table .el-table__cell) {
  font-size: 13px;
  padding: 14px 0;
}
:deep(.model-table .el-input-number) {
  width: 132px;
}
@media (max-width: 768px) {
  .models-page { padding: 16px; }
  .page-head-actions { width: 100%; }
  .page-search { flex: 1; min-width: 0; }
}
.thinking-header {
  cursor: help;
}
.op-row {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
}
.op-row :deep(.el-button) {
  flex: 0 0 auto;
  min-width: 0;
  margin: 0;
  padding-inline: 8px;
}
.prov-name {
  font-weight: 500;
}
.prov-sub {
  margin-left: 6px;
  font-size: 12px;
  color: #8b909b;
}
.form-section-title {
  margin: 4px 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: #333946;
}
.form-section-title.row-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.section-actions {
  display: flex;
  gap: 8px;
}
.fetch-alert {
  margin-bottom: 12px;
}
.remote-list {
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  padding: 8px 12px;
  margin-bottom: 12px;
  background: #fafbfc;
}
.remote-select-all {
  display: flex;
  margin-bottom: 4px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}
.remote-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
}
.remote-id {
  font-size: 13px;
  color: #333946;
}
.remote-owned {
  margin-left: 8px;
  font-size: 12px;
  color: #98a2b3;
}
.manual-item {
  margin-bottom: 0;
}
.hint {
  margin-top: 6px;
  font-size: 12px;
  color: #8b909b;
}
</style>

<!-- dialog 挂 body：只动弹窗本身，不改 el-overlay 布局 -->
<style>
.el-dialog.models-dialog {
  margin: 48px auto !important;
  max-height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  border-radius: 0;
}
.el-dialog.models-dialog.is-align-center {
  margin: 48px auto !important;
}
.el-dialog.models-dialog .el-dialog__header {
  flex-shrink: 0;
  padding-right: 40px;
}
.el-dialog.models-dialog .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-top: 12px;
  padding-bottom: 8px;
}
.el-dialog.models-dialog .el-dialog__footer {
  flex-shrink: 0;
}

.models-filter-popper.el-popper {
  border-radius: 0;
}
</style>
