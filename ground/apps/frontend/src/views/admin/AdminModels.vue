<template>
  <section class="models-page">
    <div class="page-head">
      <div>
        <h1>模型管理</h1>
        <p>
          自动模式先用默认模型，故障时按优先级切换备选（数字越小越优先，0 最高）。系统每 5 分钟检查，故障恢复后自动启用；手动禁用需手动开启。
        </p>
      </div>
      <div class="page-head-actions">
        <el-input
          v-model="keyword"
          class="page-search"
          clearable
          placeholder="搜索 Model ID / 显示名 / 厂商"
        />
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
        v-loading="loading"
        :data="filteredRows"
        border
        class="model-table"
        row-key="key"
        header-cell-class-name="model-table-header"
        empty-text="无匹配结果"
      >
        <el-table-column label="Model ID" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.model.modelId }}</template>
        </el-table-column>
        <el-table-column label="显示名" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.model.displayName }}</template>
        </el-table-column>
        <el-table-column label="厂商" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="prov-name">{{ row.provider.displayName }}</span>
            <span class="prov-sub">{{ row.provider.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="默认" width="120" align="center">
          <template #default="{ row }"><el-tag v-if="row.model.isPreferred" type="success">默认模型</el-tag><el-button v-else link type="primary" :disabled="!row.model.enabled" :loading="busyModelId === row.model.id" @click="onRoutingChange(row.model,{isPreferred:true})">设为默认</el-button></template>
        </el-table-column>
        <el-table-column label="优先级（小优先）" width="165"><template #default="{ row }"><el-input-number :model-value="row.model.sortOrder" :min="0" :max="10000" :precision="0" :disabled="busyModelId === row.model.id" @change="(value: number | undefined) => value !== undefined && onRoutingChange(row.model,{sortOrder:value})" /></template></el-table-column>
        <el-table-column label="运行状态" min-width="195"><template #default="{ row }">
          <el-tag :type="!row.model.enabled ? 'info' : row.model.health?.status === 'healthy' ? 'success' : 'warning'">{{ !row.model.enabled ? '手动禁用' : healthLabel(row.model.health?.status) }}</el-tag>
          <div class="prov-sub">{{ row.model.health?.reason }}</div>
          <div v-if="row.model.health?.checkedAt" class="prov-sub">{{ new Date(row.model.health.checkedAt).toLocaleString('zh-CN') }} · {{ row.model.health.latencyMs ?? '—' }}ms</div>
        </template></el-table-column>
        <el-table-column label="工具调用" width="90" align="center"><template #default="{ row }"><el-switch :model-value="row.model.supportsTools" :disabled="busyModelId === row.model.id" @change="(value: boolean) => onRoutingChange(row.model,{supportsTools:value})" /></template></el-table-column>
        <el-table-column label="图片输入" width="90" align="center"><template #default="{ row }"><el-switch :model-value="row.model.supportsVision" :disabled="busyModelId === row.model.id" @change="(value: boolean) => onRoutingChange(row.model,{supportsVision:value})" /></template></el-table-column>
        <el-table-column label="启用" width="90" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.model.enabled"
              :loading="busyModelId === row.model.id"
              @change="(v: boolean) => onToggleModel(row.model, v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="普通对话思考" width="150" align="center">
          <template #header>
            <el-tooltip content="新建模型默认关闭。开启后普通对话也会启用深度思考，通常响应更慢；关闭后仅工具调用时启用思考。实际效果取决于模型支持。" placement="top" :show-after="200">
              <span class="thinking-header" tabindex="0">普通对话思考 ⓘ</span>
            </el-tooltip>
          </template>
          <template #default="{ row }">
            <el-switch
              :model-value="row.model.thinkingEnabled"
              :loading="busyModelId === row.model.id"
              @change="(v: boolean) => onToggleThinking(row.model, v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right" align="center">
          <template #default="{ row }">
            <div class="op-row">
              <el-button
                text
                type="primary"
                :loading="probingKey === row.model.id"
                @click="onProbeSaved(row.model)"
              >
                测试
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
        <el-form-item label="短名" required>
          <el-input
            v-model="dialog.form.name"
            :disabled="dialog.mode === 'edit'"
            placeholder="如 deepseek / kimi"
          />
          <div v-if="dialog.mode === 'create' && nameConflictProvider" class="hint name-conflict">
            短名「{{ nameConflictProvider.name }}」已存在，请换一个短名
          </div>
        </el-form-item>
        <el-form-item label="显示名" required>
          <el-input v-model="dialog.form.displayName" placeholder="DeepSeek" />
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="dialog.form.baseUrl" placeholder="https://api.deepseek.com" />
        </el-form-item>
        <el-form-item label="API Key" :required="dialog.mode === 'create'">
          <el-input
            v-model="dialog.form.apiKey"
            type="password"
            show-password
            :placeholder="dialog.mode === 'edit' && dialog.hasApiKey ? '留空则保持原 Key' : 'sk-…'"
          />
          <div v-if="dialog.mode === 'edit' && dialog.hasApiKey" class="hint">
            当前掩码：{{ dialog.apiKeyMasked }}
          </div>
        </el-form-item>

        <div class="form-section-title row-between">
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
          v-if="dialog.fetchError"
          class="fetch-alert"
          :title="dialog.fetchError"
          type="error"
          show-icon
          :closable="false"
        />

        <div v-if="dialog.remoteModels.length" class="remote-list">
          <el-checkbox-group v-model="dialog.selectedIds">
            <div
              v-for="m in dialog.remoteModels"
              :key="m.id"
              class="remote-item"
            >
              <el-checkbox :value="m.id">
                <span class="remote-id">{{ m.id }}</span>
                <span v-if="m.ownedBy" class="remote-owned">{{ m.ownedBy }}</span>
              </el-checkbox>
            </div>
          </el-checkbox-group>
        </div>

        <el-form-item label="手填 Model ID" class="manual-item">
          <el-select
            v-model="dialog.selectedIds"
            multiple
            filterable
            allow-create
            default-first-option
            clearable
            collapse-tags
            collapse-tags-tooltip
            placeholder="输入后回车添加；可多选"
            style="width: 100%"
          >
            <el-option
              v-for="id in manualOptions"
              :key="id"
              :label="id"
              :value="id"
            />
          </el-select>
          <div class="hint">拉取失败时仍可在此手填；已勾选与手填共用同一列表</div>
        </el-form-item>

      </el-form>

      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="dialog.saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
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
const error = ref('');
const keyword = ref('');
const providers = ref<AdminLlmProviderRow[]>([]);
// Preserve initial positions across settings changes and health refreshes.
const rowPositions = new Map<string, number>();
const busyModelId = ref<string | null>(null);
const probingKey = ref<string | null>(null);

const flatRows = computed<FlatRow[]>(() => {
  const out: FlatRow[] = [];
  for (const p of providers.value) {
    for (const m of p.models) {
      out.push({ key: m.id, provider: p, model: m });
    }
  }
  return out.sort((a, b) => rowPositions.get(a.key)! - rowPositions.get(b.key)!);
});

const filteredRows = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) return flatRows.value;
  return flatRows.value.filter((r) => {
    const hay = `${r.model.modelId} ${r.model.displayName} ${r.provider.name} ${r.provider.displayName}`.toLowerCase();
    return hay.includes(q);
  });
});

const dialog = reactive({
  visible: false,
  mode: 'create' as 'create' | 'edit',
  saving: false,
  fetching: false,
  testingSelected: false,
  providerId: '' as string,
  hasApiKey: false,
  apiKeyMasked: null as string | null,
  existingModelIds: [] as string[],
  fetchError: '' as string,
  remoteModels: [] as Array<{ id: string; ownedBy?: string }>,
  selectedIds: [] as string[],
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

const manualOptions = computed(() => {
  const set = new Set<string>();
  for (const m of dialog.remoteModels) set.add(m.id);
  for (const id of dialog.selectedIds) {
    const t = String(id).trim();
    if (t) set.add(t);
  }
  for (const id of dialog.existingModelIds) set.add(id);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
});

function resetDialogModels() {
  dialog.fetchError = '';
  dialog.remoteModels = [];
  dialog.selectedIds = [];
  dialog.existingModelIds = [];
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    const nextProviders = await adminLlmProviderApi.list();
    const models = nextProviders.flatMap((provider) => provider.models);
    if (rowPositions.size === 0) {
      models.sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred)
        || a.sortOrder - b.sortOrder || a.modelId.localeCompare(b.modelId));
    }
    for (const model of models) {
      if (!rowPositions.has(model.id)) rowPositions.set(model.id, rowPositions.size);
    }
    providers.value = nextProviders;
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

const nameConflictProvider = computed(() => {
  if (dialog.mode !== 'create') return null;
  const n = dialog.form.name.trim().toLowerCase();
  if (!n) return null;
  return providers.value.find((p) => p.name.toLowerCase() === n) || null;
});

function openCreate() {
  dialog.mode = 'create';
  dialog.providerId = '';
  dialog.hasApiKey = false;
  dialog.apiKeyMasked = null;
  dialog.form = { name: '', displayName: '', baseUrl: '', apiKey: '' };
  resetDialogModels();
  dialog.visible = true;
}

function openEditProvider(provider: AdminLlmProviderRow, preferModelId?: string) {
  dialog.mode = 'edit';
  dialog.providerId = provider.id;
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
    const name = dialog.form.name.trim();
    const displayName = dialog.form.displayName.trim();
    const baseUrl = dialog.form.baseUrl.trim();
    const apiKey = dialog.form.apiKey.trim();
    const modelIds = selectedModelIds.value;

    if (!name || !displayName) {
      ElMessage.warning('请填写短名与显示名');
      return;
    }
    if (!baseUrl) {
      ElMessage.warning('请填写 Base URL');
      return;
    }

    if (dialog.mode === 'create') {
      const existing = providers.value.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        ElMessage.error(`短名「${existing.name}」已存在，请换一个短名`);
        return;
      }
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
          displayName: modelId,
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
          displayName: modelId,
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

async function onProbeSaved(m: AdminLlmModelRow) {
  probingKey.value = m.id;
  try {
    const res = await adminLlmProviderApi.probe({ modelRowId: m.id });
    await reload();
    if (res.ok) ElMessage.success(res.message || '连通正常');
    else ElMessage.error(res.message || '连通失败');
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '测试失败');
  } finally {
    probingKey.value = null;
  }
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

async function onDeleteModel(m: AdminLlmModelRow) {
  const provider = providers.value.find((p) => p.models.some((x) => x.id === m.id));
  const lastOfProvider = Boolean(provider && provider.models.length <= 1);
  try {
    await ElMessageBox.confirm(
      lastOfProvider
        ? `确认删除模型「${m.modelId}」？这是该厂商最后一个模型，将移除模型的企业分配；若厂商「${provider?.displayName || provider?.name}」仍被检索配置引用，将保留厂商。`
        : `确认删除模型「${m.modelId}」？`,
      '删除模型',
      { type: 'warning' },
    );
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
async function onRoutingChange(model: AdminLlmModelRow, changes: Parameters<typeof adminLlmProviderApi.updateModel>[1]) {
  busyModelId.value=model.id;
  try { await adminLlmProviderApi.updateModel(model.id,changes); await reload(); }
  catch(e){ElMessage.error(e instanceof ApiError ? e.message : '设置失败');}
  finally{busyModelId.value=null;}
}
let healthTimer: ReturnType<typeof setInterval> | undefined;
onMounted(()=>{void reload();healthTimer=setInterval(()=>{if(!dialog.visible&&!loading.value&&!busyModelId.value&&!probingKey.value)void reload();},15000);});
onUnmounted(()=>clearInterval(healthTimer));
</script>

<style scoped>
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
.page-head p {
  margin: 0;
  color: #667085;
  font-size: 13px;
  line-height: 1.8;
  max-width: 880px;
  padding: 12px 16px;
  background: #f6f7fc;
  border-left: 3px solid #4A53A3;
  border-radius: 0 6px 6px 0;
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
  flex-shrink: 0;
  align-items: center;
}
.page-search {
  width: 260px;
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
  margin: 0;
}
.prov-name {
  font-weight: 500;
  color: #333946;
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
</style>
