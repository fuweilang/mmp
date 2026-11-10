<template>
  <section class="enterprise-page">
    <div class="enterprise-toolbar">
      <div class="enterprise-search-wrap">
        <el-input
          v-model="nameDraft"
          class="enterprise-search-keyword"
          clearable
          placeholder="搜索企业名称"
          :prefix-icon="Search"
          @clear="onSearchNow"
          @input="onSearchInput"
          @keyup.enter="onSearchNow"
        />
        <el-input
          v-model="slugDraft"
          class="enterprise-search"
          clearable
          placeholder="搜索品牌"
          :prefix-icon="Search"
          @clear="onSearchNow"
          @input="onSearchInput"
          @keyup.enter="onSearchNow"
        />
        <el-select
          v-model="statusFilter"
          class="status-filter"
          clearable
          placeholder="账号状态"
          @change="onFilterChange"
          @clear="onFilterChange"
        >
          <el-option label="激活" value="active" />
          <el-option label="停用" value="inactive" />
        </el-select>
      </div>
      <el-button class="toolbar-button" :loading="loading" type="primary" @click="onSearchNow">
        搜索
      </el-button>
      <el-button class="toolbar-button" @click="onReset">
        重置
      </el-button>
      <div class="enterprise-actions">
        <el-button type="primary" @click="openCreate">新建</el-button>
      </div>
    </div>

    <el-table
      v-loading="loading"
      :data="pagedRows"
      border
      class="enterprise-table"
      header-cell-class-name="enterprise-table-header"
    >
      <el-table-column label="名称" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="subject-label">
            <span class="visual-dot" :style="{ backgroundColor: enterpriseColor(row.id) }" />
            <span>{{ row.name }}</span>
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="slug" label="品牌" min-width="140" show-overflow-tooltip />
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.type === 'AGENCY'" size="small" type="warning" effect="plain">代理商</el-tag>
          <el-tag v-else size="small" type="primary" effect="plain">企业</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="上级" width="120">
        <template #default="{ row }">
          <el-tag v-if="row.parentName" size="small" type="warning" effect="plain">{{ row.parentName }}</el-tag>
          <span v-else-if="row.type === 'PLATFORM'" class="admin-empty">—</span>
          <span v-else class="admin-empty">猛犸总部</span>
        </template>
      </el-table-column>
      <el-table-column label="管理员" min-width="180">
        <template #default="{ row }">
          <div v-if="row.admins.length" class="admin-list">
            <div
              v-for="admin in row.admins"
              :key="admin.id"
              class="admin-item"
            >
              <span class="admin-name">{{ admin.name }}</span>
              <span class="admin-phone">{{ admin.phone }}</span>
            </div>
          </div>
          <span v-else class="admin-empty">未设置</span>
        </template>
      </el-table-column>
      <el-table-column label="账号状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="AI币余额" width="110">
        <template #default="{ row }">
          <span>{{ row.balanceCoins ?? 0 }}</span>
        </template>
      </el-table-column>
      <el-table-column label="成员数" width="90">
        <template #default="{ row }">
          {{ row.memberCount }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="400" fixed="right" align="center">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="openView(row)">
              查看
            </el-button>
            <el-button
              v-if="row.type !== 'PLATFORM'"
              text
              type="primary"
              @click="openTokenStats(row)"
            >
              Token/AI币
            </el-button>
            <el-button
              v-if="row.type !== 'PLATFORM'"
              text
              type="primary"
              @click="openFunds(row)"
            >
              资金
            </el-button>
            <el-button
              v-if="row.type !== 'PLATFORM'"
              text
              type="primary"
              @click="openWorkbench(row)"
            >
              进入业务工作台
            </el-button>
            <el-button v-if="row.type !== 'PLATFORM'" text type="primary" @click="openEdit(row)">
              编辑
            </el-button>
            <el-button
              v-if="row.type !== 'PLATFORM' && row.status === 'active'"
              text
              type="warning"
              :loading="statusChangingId === row.id"
              @click="onDeactivate(row)"
            >
              停用
            </el-button>
            <el-button
              v-if="row.type !== 'PLATFORM' && row.status !== 'active'"
              text
              type="success"
              :loading="statusChangingId === row.id"
              @click="onActivate(row)"
            >
              启用
            </el-button>
            <el-button
              v-if="row.type !== 'PLATFORM'"
              text
              type="danger"
              :loading="deletingId === row.id"
              @click="onDelete(row)"
            >
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="emptyText">
          <el-button v-if="!hasActiveFilters" type="primary" @click="openCreate">
            新建企业
          </el-button>
        </el-empty>
      </template>
    </el-table>

    <div class="enterprise-pagination">
      <el-pagination
        :current-page="currentPage"
        :page-size="pageSize"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[10, 20, 50]"
        :total="filteredRows.length"
        @current-change="onPageChange"
        @size-change="onPageSizeChange"
      />
    </div>

    <el-dialog
      v-model="workbenchVisible"
      title="进入业务工作台"
      class="enterprise-dialog"
      width="480px"
      :close-on-click-modal="false"
    >
      <p class="workbench-tip">
        将以当前管理员身份代运营「<span class="workbench-enterprise-name">{{ workbenchEnterprise?.name }}</span>」，进入该企业的企业控制台，不会切换登录身份。
      </p>
      <template #footer>
        <el-button :disabled="entering" @click="workbenchVisible = false">取消</el-button>
        <el-button type="primary" :loading="entering" @click="confirmWorkbench">进入工作台</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="viewOpen"
      title="查看企业"
      class="enterprise-dialog"
      width="480px"
    >
      <el-descriptions v-if="viewingRow" :column="1" border>
        <el-descriptions-item label="名称">
          {{ viewingRow.name }}
        </el-descriptions-item>
        <el-descriptions-item label="品牌">
          {{ viewingRow.slug }}
        </el-descriptions-item>
        <el-descriptions-item label="账号状态">
          {{ statusLabel(viewingRow.status) }}
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="viewOpen = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="open"
      :title="editingId ? '编辑企业' : '新建企业'"
      class="enterprise-dialog"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="88px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="80" @input="form.name = sanitizeText(form.name)" />
        </el-form-item>
        <el-form-item label="品牌" prop="slug">
          <el-input v-model="form.slug" maxlength="80" placeholder="请输入品牌" @input="form.slug = sanitizeText(form.slug)" />
        </el-form-item>
        <template v-if="!editingId">
          <el-form-item label="类型" prop="type">
            <el-radio-group v-model="form.type">
              <el-radio value="ENTERPRISE">企业</el-radio>
              <el-radio value="AGENCY">代理商</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="isPlatformAdmin && form.type === 'ENTERPRISE'" label="上级" prop="parentId">
            <el-select v-model="form.parentId" clearable placeholder="猛犸总部（直属）" style="width: 100%">
              <el-option
                v-for="a in agencyOptions"
                :key="a.id"
                :label="a.name"
                :value="a.id"
              />
            </el-select>
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="open = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, type VNode } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Search } from 'lucide-vue-next';
import { adminEnterpriseApi, type AdminEnterpriseRow } from '../../api/admin';
import { useAuthStore } from '../../stores/auth';
import { sanitizeText } from '../../utils/sanitizeText';

const ENTERPRISE_COLORS = ['#7c3aed', '#0891b2', '#c2410c', '#15803d', '#be123c', '#4f46e5', '#a16207', '#0f766e'];

const auth = useAuthStore();
const router = useRouter();
const rows = ref<AdminEnterpriseRow[]>([]);
const loading = ref(false);
const open = ref(false);
const saving = ref(false);
const editingId = ref('');
const deletingId = ref('');
const statusChangingId = ref('');
const entering = ref(false);
const workbenchVisible = ref(false);
const workbenchEnterprise = ref<AdminEnterpriseRow | null>(null);
const viewOpen = ref(false);
const viewingRow = ref<AdminEnterpriseRow | null>(null);
const nameDraft = ref('');
const slugDraft = ref('');
const statusFilter = ref('');
const currentPage = ref(1);
const pageSize = ref(20);
const formRef = ref<FormInstance>();
let searchTimer = 0;
let requestSequence = 0;

const form = reactive({
  name: '',
  slug: '',
  type: 'ENTERPRISE' as 'ENTERPRISE' | 'AGENCY',
  parentId: '' as string,
});

const isPlatformAdmin = computed(() => Boolean(auth.session?.user.isPlatformAdmin));
/** 上级下拉：当前列表里的代理商（仅平台管理员需要选）。 */
const agencyOptions = computed(() => rows.value.filter((row) => row.type === 'AGENCY'));

const rules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  slug: [{ required: true, message: '请输入品牌', trigger: 'blur' }],
};

const hasActiveFilters = computed(() =>
  Boolean(nameDraft.value || slugDraft.value || statusFilter.value),
);

const emptyText = computed(() => (hasActiveFilters.value ? '没有符合条件的企业' : '还没有企业'));

const filteredRows = computed(() => {
  const name = nameDraft.value.trim().toLowerCase();
  const slug = slugDraft.value.trim().toLowerCase();
  return rows.value.filter((row) => {
    if (name && !row.name.toLowerCase().includes(name)) return false;
    if (slug && !row.slug.toLowerCase().includes(slug)) return false;
    if (statusFilter.value && row.status !== statusFilter.value) return false;
    return true;
  });
});

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});

function statusLabel(status: string) {
  return status === 'active' ? '激活' : '停用';
}

function enterpriseColor(id: string) {
  let hash = 0;
  for (const character of id) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return ENTERPRISE_COLORS[hash % ENTERPRISE_COLORS.length];
}

function resetPage() {
  currentPage.value = 1;
}

function onSearchInput() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(onSearchNow, 350);
}

function onSearchNow() {
  window.clearTimeout(searchTimer);
  resetPage();
  void load();
}

function onFilterChange() {
  resetPage();
}

function onReset() {
  window.clearTimeout(searchTimer);
  nameDraft.value = '';
  slugDraft.value = '';
  statusFilter.value = '';
  resetPage();
  void load();
}

function onPageChange(page: number) {
  currentPage.value = page;
}

function onPageSizeChange(size: number) {
  pageSize.value = size;
  resetPage();
}

function resetForm() {
  editingId.value = '';
  form.name = '';
  form.slug = '';
  form.type = 'ENTERPRISE';
  form.parentId = '';
  formRef.value?.clearValidate();
}

function openCreate() {
  resetForm();
  open.value = true;
}

function openEdit(row: AdminEnterpriseRow) {
  resetForm();
  editingId.value = row.id;
  form.name = row.name;
  form.slug = row.slug;
  open.value = true;
}

function openView(row: AdminEnterpriseRow) {
  viewingRow.value = row;
  viewOpen.value = true;
}

async function load() {
  const sequence = ++requestSequence;
  loading.value = true;
  try {
    const result = await adminEnterpriseApi.list();
    if (sequence !== requestSequence) return;
    rows.value = result;
  } catch (e) {
    if (sequence !== requestSequence) return;
    ElMessage.error(e instanceof Error ? e.message : '加载失败');
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

async function onSave() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    if (editingId.value) {
      await adminEnterpriseApi.update(editingId.value, {
        name: form.name.trim(),
        slug: form.slug.trim(),
      });
      ElMessage.success('已保存');
    } else {
      await adminEnterpriseApi.create({
        name: form.name.trim(),
        slug: form.slug.trim(),
        type: form.type,
        parentId: form.parentId || undefined,
      });
      ElMessage.success('已创建');
    }
    open.value = false;
    await load();
    await auth.load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}


function openTokenStats(row: AdminEnterpriseRow) {
  router.push({ path: '/admin/enterprise-token-stats', query: { tenantId: row.id } });
}

function openFunds(row: AdminEnterpriseRow) {
  router.push({ path: '/admin/enterprise-wallets', query: { tenantId: row.id, tab: 'funds' } });
}

async function openWorkbench(row: AdminEnterpriseRow) {
  if (row.status !== 'active') {
    ElMessage.warning('停用企业不能进入业务工作台');
    return;
  }
  workbenchEnterprise.value = row;
  workbenchVisible.value = true;
}

async function confirmWorkbench() {
  const row = workbenchEnterprise.value;
  if (!row) return;
  // 新标签打开业务工作台，原总后台标签保留。
  const tab = window.open('about:blank', '_blank');
  if (!tab) {
    ElMessage.warning('浏览器拦截了新标签，请允许弹出窗口后重试');
    return;
  }
  entering.value = true;
  try {
    await auth.switchTenant(row.id);
    workbenchVisible.value = false;
    // 先完成 switchTenant（cookie 落地）再导航，新标签加载 /console/ 时会话已就绪。
    tab.opener = null;
    tab.location.assign(`${window.location.origin}/console/`);
    ElMessage.success('已在新标签打开业务工作台');
  } catch (e) {
    tab.close();
    ElMessage.error(e instanceof Error ? e.message : '进入工作台失败');
  } finally {
    entering.value = false;
  }
}

/** 确认弹窗里需要强调的文本（企业名、用户等），与用户删除确认框保持同款蓝色。 */
function highlight(text: string) {
  return h('span', { style: { color: '#4A53A3', fontWeight: 600 } }, text);
}

async function onDeactivate(row: AdminEnterpriseRow) {
  try {
    await ElMessageBox.confirm(
      h('span', null, [
        '停用后「',
        highlight(row.name),
        '」的管理员与成员将无法使用该企业的控制台与专家。确定停用？',
      ]),
      '停用企业',
      {
        type: 'warning',
        confirmButtonText: '停用',
        confirmButtonClass: 'el-button--danger',
        customClass: 'enterprise-confirm',
      },
    );
  } catch {
    return;
  }
  statusChangingId.value = row.id;
  try {
    await adminEnterpriseApi.update(row.id, { status: 'inactive' });
    ElMessage.success('已停用');
    await load();
    // 若当前正代运营该企业，刷新会话让守卫把人带离停用租户。
    await auth.load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '停用失败');
  } finally {
    statusChangingId.value = '';
  }
}

async function onActivate(row: AdminEnterpriseRow) {
  try {
    await ElMessageBox.confirm(
      h('span', null, ['启用后「', highlight(row.name), '」的管理员与成员恢复使用。确定启用？']),
      '启用企业',
      { type: 'info', confirmButtonText: '启用', customClass: 'enterprise-confirm' },
    );
  } catch {
    return;
  }
  statusChangingId.value = row.id;
  try {
    await adminEnterpriseApi.update(row.id, { status: 'active' });
    ElMessage.success('已启用');
    await load();
    await auth.load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '启用失败');
  } finally {
    statusChangingId.value = '';
  }
}

async function onDelete(row: AdminEnterpriseRow) {
  try {
    const impact = await adminEnterpriseApi.deletionImpact(row.id);
    if (!impact.canDelete) {
      ElMessage.warning(`不能删除：${impact.blockedReasons.join('、')}`);
      return;
    }
    const lines = [
      h('p', { class: 'confirm-line' }, ['确定删除企业「', highlight(row.name), '」？删除后不可恢复。']),
    ];
    if (impact.deletedUsers.length > 0) {
      const users: (string | VNode)[] = [];
      impact.deletedUsers.forEach((user, index) => {
        if (index > 0) users.push('、');
        users.push(highlight(`${user.name}（${user.phone}）`));
      });
      lines.push(
        h('p', { class: 'confirm-line' }, [`将同时删除 ${impact.deletedUsers.length} 个只属于该企业的用户：`, ...users]),
      );
    } else {
      lines.push(h('p', { class: 'confirm-line' }, ['没有只属于该企业的用户需要删除。']));
    }
    if (impact.unboundMemberCount > 0) {
      lines.push(
        h('p', { class: 'confirm-line' }, [`另有 ${impact.unboundMemberCount} 个成员只解除企业关系，账号保留。`]),
      );
    }
    if (impact.usageEventCount > 0) {
      lines.push(h('p', { class: 'confirm-line' }, [`该企业的 ${impact.usageEventCount} 条用量记录将一并清除。`]));
    }
    await ElMessageBox.confirm(h('div', null, lines), '删除企业', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
      customClass: 'enterprise-confirm',
    });
  } catch {
    return;
  }
  deletingId.value = row.id;
  try {
    await adminEnterpriseApi.remove(row.id);
    ElMessage.success('已删除');
    await load();
    await auth.load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败');
  } finally {
    deletingId.value = '';
  }
}

onMounted(load);

onBeforeUnmount(() => {
  window.clearTimeout(searchTimer);
  requestSequence += 1;
});
</script>

<style scoped>
.enterprise-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.enterprise-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  overflow-x: auto;
}

.enterprise-search-wrap {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  gap: 10px;
  min-width: 0;
}

.enterprise-search,
.enterprise-search-keyword,
.status-filter {
  flex: 0 0 auto;
  min-width: 0;
  width: 160px;
}

.enterprise-search-keyword {
  width: 210px;
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

.enterprise-actions {
  display: flex;
  flex: 0 0 auto;
  margin-left: auto;
}

.enterprise-table {
  margin-top: 20px;
  width: 100%;
}

.subject-label {
  align-items: center;
  display: inline-flex;
  gap: 7px;
}

.admin-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.admin-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.admin-name {
  color: #333946;
}

.admin-phone {
  color: #667085;
  font-size: 12px;
}

.admin-empty {
  color: #98a2b3;
}

.visual-dot {
  border-radius: 50%;
  flex: 0 0 7px;
  height: 7px;
  width: 7px;
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

.enterprise-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.workbench-tip {
  color: var(--app-text-color);
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
}

.workbench-enterprise-name {
  color: var(--app-primary-color);
  font-weight: 600;
}

:deep(.enterprise-table-header) {
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

@media (max-width: 768px) {
  .enterprise-toolbar {
    align-items: stretch;
    flex-direction: column;
    overflow-x: visible;
  }

  .enterprise-search-wrap {
    flex-direction: column;
    width: 100%;
  }

  .enterprise-search,
  .enterprise-search-keyword,
  .status-filter,
  .toolbar-button {
    width: 100%;
  }

  .enterprise-actions {
    margin-left: 0;
    width: 100%;
  }

  .enterprise-actions .el-button {
    width: 100%;
  }

  .enterprise-pagination {
    justify-content: flex-start;
    overflow-x: auto;
  }
}
</style>

<!-- 弹窗与确认框渲染在 body（teleport）下，scoped 样式无法命中弹窗结构节点，这里用全局样式（同 AdminRoles） -->
<style>
/* 弹窗统一风格：方角、细分隔线、13px 正文 */
.enterprise-dialog {
  border-radius: 0;
  max-width: calc(100vw - 32px);
}

.enterprise-dialog .el-dialog__header {
  border-bottom: 1px solid #dfe5ef;
  margin-right: 0;
  padding: 18px 24px;
}

.enterprise-dialog .el-dialog__title {
  color: #333946;
  font-size: 16px;
  font-weight: 600;
}

.enterprise-dialog .el-dialog__headerbtn {
  height: 52px;
  width: 52px;
}

.enterprise-dialog .el-dialog__body {
  color: #333946;
  font-size: 13px;
  padding: 22px 24px;
}

.enterprise-dialog .el-dialog__footer {
  border-top: 1px solid #dfe5ef;
  padding: 14px 24px;
}

.enterprise-dialog .el-dialog__footer .el-button + .el-button {
  margin-left: 8px;
}

.enterprise-dialog .el-form-item {
  margin-bottom: 18px;
}

.enterprise-dialog .el-form-item:last-child {
  margin-bottom: 0;
}

.enterprise-dialog .el-form-item__label {
  color: #667085;
  font-weight: 400;
}

.enterprise-dialog .el-descriptions__label {
  background: #f8fafc;
  color: #667085;
  font-weight: 400;
  text-align: right;
  width: 96px;
}

.enterprise-dialog .el-descriptions__content {
  color: #333946;
}

.enterprise-dialog .el-descriptions__cell {
  padding: 10px 14px;
}

/* ElMessageBox 确认框与页面弹窗同款 */
.enterprise-confirm {
  border-radius: 0;
  padding: 0;
  width: 480px;
}

.enterprise-confirm .el-message-box__header {
  border-bottom: 1px solid #dfe5ef;
  padding: 18px 24px;
}

.enterprise-confirm .el-message-box__title {
  color: #333946;
  font-size: 16px;
  font-weight: 600;
}

.enterprise-confirm .el-message-box__content {
  color: #667085;
  font-size: 13px;
  padding: 22px 24px;
}

.enterprise-confirm .el-message-box__message {
  line-height: 1.7;
  white-space: pre-line;
}

.enterprise-confirm .el-message-box__message .confirm-line {
  margin: 0;
}

.enterprise-confirm .el-message-box__message .confirm-line + .confirm-line {
  margin-top: 6px;
}

.enterprise-confirm .el-message-box__btns {
  border-top: 1px solid #dfe5ef;
  padding: 14px 24px;
}

.enterprise-confirm .el-message-box__btns .el-button + .el-button {
  margin-left: 8px;
}

@media (max-width: 768px) {
  .enterprise-dialog {
    width: calc(100vw - 32px) !important;
  }

  .enterprise-confirm {
    width: calc(100vw - 32px);
  }
}
</style>
