<template>
  <section class="role-page" v-loading="loading">
    <el-alert
      v-if="errorText"
      class="role-alert"
      type="error"
      show-icon
      :closable="false"
      :title="errorText"
    >
      <template #default>
        <el-button text type="primary" @click="reload">重试</el-button>
      </template>
    </el-alert>

    <div class="role-tabs-bar">
      <div class="role-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="role-tab"
          :class="{ active: activeTab === 'platform' }"
          :aria-selected="activeTab === 'platform'"
          @click="setTab('platform')"
        >
          平台角色
        </button>
        <button
          type="button"
          role="tab"
          class="role-tab"
          :class="{ active: activeTab === 'tenant' }"
          :aria-selected="activeTab === 'tenant'"
          @click="setTab('tenant')"
        >
          企业自定义角色
        </button>
      </div>
    </div>

    <div class="role-toolbar">
      <div class="toolbar-left">
        <el-select
          v-if="isTenantTab"
          v-model="tenantFilter"
          class="tenant-filter"
          clearable
          filterable
          placeholder="筛选企业"
          @change="onSearchNow"
        >
          <el-option
            v-for="ent in enterprises"
            :key="ent.id"
            :label="ent.name"
            :value="ent.id"
          >
            <span class="tenant-option">
              <span class="visual-dot" :style="{ backgroundColor: tenantColor(ent.id) }" />
              <span>{{ ent.name }}</span>
            </span>
          </el-option>
        </el-select>
        <el-input
          v-model="keywordDraft"
          class="role-search"
          clearable
          placeholder="搜索角色名"
          :prefix-icon="Search"
          @clear="onSearchNow"
          @input="onSearchInput"
          @keyup.enter="onSearchNow"
        />
        <el-button class="toolbar-button" type="primary" :loading="loading" @click="onSearchNow">
          搜索
        </el-button>
        <el-button class="toolbar-button" @click="onReset">
          重置
        </el-button>
      </div>
      <div class="toolbar-right">
        <el-tooltip
          content="仅超级管理员、平台管理员或持有 portal.admin.roles.write 可新建角色"
          placement="top"
          :disabled="canWrite"
        >
          <span>
            <el-button class="toolbar-button" type="primary" :disabled="!canWrite" @click="openCreator">
              新建角色
            </el-button>
          </span>
        </el-tooltip>
      </div>
    </div>

    <PlatformRolesPane
      v-if="!isTenantTab"
      :rows="pagedRows"
      :loading="loading"
      :can-write="canWrite"
      :can-delete-roles="canDeleteRoles"
      :current-page="currentPage"
      :page-size="pageSize"
      :total="filteredRows.length"
      :empty-text="emptyText"
      @view="openViewer"
      @edit="openEditor"
      @delete="onDelete"
      @page-change="onPageChange"
      @page-size-change="onPageSizeChange"
    />
    <TenantRolesPane
      v-else
      :rows="pagedRows"
      :loading="loading"
      :can-write="canWrite"
      :can-delete-roles="canDeleteRoles"
      :current-page="currentPage"
      :page-size="pageSize"
      :total="filteredRows.length"
      :empty-text="emptyText"
      @view="openViewer"
      @edit="openEditor"
      @delete="onDelete"
      @page-change="onPageChange"
      @page-size-change="onPageSizeChange"
    />

    <el-drawer
      v-model="drawerOpen"
      :title="drawerTitle"
      class="role-drawer"
      size="760px"
      destroy-on-close
      @closed="onDrawerClosed"
    >
      <template v-if="editing || isCreating">
        <el-alert
          v-if="editing?.scope === 'ORG_PRESET'"
          type="warning"
          :closable="false"
          show-icon
          title="企业预设角色：修改后会影响所有企业中使用该角色的成员。"
          class="drawer-alert"
        />
        <el-alert
          v-if="editing?.scope === 'ORG_CUSTOM'"
          type="warning"
          :closable="false"
          show-icon
          title="企业自定义角色：修改会直接影响该企业内使用该角色的成员。"
          class="drawer-alert"
        />
        <el-alert
          v-if="editing?.key === 'super_admin'"
          type="info"
          :closable="false"
          show-icon
          title="超级管理员角色不可编辑：权限默认全选并锁定。"
          class="drawer-alert"
        />
        <el-form label-position="top">
          <el-form-item v-if="isTenantTab && isCreating" label="所属企业" required>
            <el-select
              v-model="createTenantId"
              style="width: 100%"
              filterable
              placeholder="选择企业"
            >
              <el-option
                v-for="ent in enterprises"
                :key="ent.id"
                :label="ent.name"
                :value="ent.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="显示名" required>
            <el-input
              v-model="editName"
              maxlength="40"
              :disabled="!canEditMeta"
            />
          </el-form-item>
          <el-form-item label="说明">
            <el-input
              v-model="editDescription"
              type="textarea"
              :rows="2"
              maxlength="200"
              :disabled="!canEditMeta"
            />
          </el-form-item>
        </el-form>

        <PermCatalogPicker
          :catalog="catalog"
          :selected="selected"
          :editable="canEditPerms"
          @toggle="togglePerm"
        />
      </template>

      <template #footer>
        <div class="drawer-footer">
          <el-button @click="drawerOpen = false">关闭</el-button>
          <el-button
            v-if="canEditPerms || canEditMeta"
            type="primary"
            :loading="saving"
            @click="onSave"
          >
            保存
          </el-button>
        </div>
      </template>
    </el-drawer>

    <el-dialog
      v-model="viewOpen"
      :title="viewing ? `查看角色 · ${viewing.name}` : '查看角色'"
      class="role-dialog"
      width="640px"
      align-center
    >
      <template v-if="viewing">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="Key">
            {{ viewing.key }}
          </el-descriptions-item>
          <el-descriptions-item label="范围">
            {{ scopeLabel(viewing.scope) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="viewing.tenant" label="所属企业">
            {{ viewing.tenant.name }}
          </el-descriptions-item>
          <el-descriptions-item label="权限数">
            {{ viewing.permissions.length }}
          </el-descriptions-item>
          <el-descriptions-item label="关联用户">
            {{ viewing.userCount }}
          </el-descriptions-item>
          <el-descriptions-item label="说明" :span="2">
            {{ viewing.description || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <PermCatalogPicker
          readonly
          :readonly-groups="viewGroups"
        />
      </template>
      <template #footer>
        <el-button @click="viewOpen = false">关闭</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search } from 'lucide-vue-next';
import {
  adminEnterpriseApi,
  adminPermissionApi,
  adminRoleApi,
  adminTenantRoleApi,
  type PermissionCatalogGroup,
} from '../../api/admin';
import { useAuthStore } from '../../stores/auth';
import { useAdminSearch, useAdminTable } from '../../composables/useAdminTable';
import PlatformRolesPane from '@/components/admin/roles/PlatformRolesPane.vue';
import TenantRolesPane from '@/components/admin/roles/TenantRolesPane.vue';
import PermCatalogPicker from '@/components/admin/roles/PermCatalogPicker.vue';
import type { RoleRow } from '@/components/admin/roles/roleTypes';
import {
  groupPages,
  scopeLabel,
  tenantColor,
} from '@/components/admin/roles/roleDisplay';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

function parseRoleTab(raw: unknown): 'platform' | 'tenant' {
  return raw === 'tenant' ? 'tenant' : 'platform';
}
const rows = ref<RoleRow[]>([]);
const catalog = ref<PermissionCatalogGroup[]>([]);
const activeTab = ref<'platform' | 'tenant'>(parseRoleTab(route.query.tab));
const isTenantTab = computed(() => activeTab.value === 'tenant');
const tenantFilter = ref('');
const enterprises = ref<Array<{ id: string; name: string }>>([]);
const createTenantId = ref('');
const saving = ref(false);
const errorText = ref('');
const keywordDraft = ref('');
const keyword = ref('');

const drawerOpen = ref(false);
const drawerMode = ref<'create' | 'edit'>('edit');
const viewOpen = ref(false);
const viewing = ref<RoleRow | null>(null);
const editing = ref<RoleRow | null>(null);
const editName = ref('');
const editDescription = ref('');
const selected = ref<Set<string>>(new Set());

const canWrite = computed(() => {
  const perms = auth.session?.effectivePermissions;
  if (Array.isArray(perms) && perms.includes('portal.admin.roles.write')) return true;
  const key = auth.session?.platformRoleKey
    || auth.session?.user?.platformRoleKey
    || '';
  return key === 'super_admin' || key === 'platform_admin';
});

/** 删除自定义角色：仅超管/平台管（与 roles.write 解耦）。 */
const canDeleteRoles = computed(() => {
  const key = auth.session?.platformRoleKey
    || auth.session?.user?.platformRoleKey
    || '';
  return key === 'super_admin' || key === 'platform_admin';
});

const isCreating = computed(() => drawerMode.value === 'create');

const drawerTitle = computed(() => {
  if (isCreating.value) return isTenantTab.value ? '新建企业角色' : '新建角色';
  return editing.value ? `${editing.value.name}（${editing.value.key}）` : '角色';
});

const canEditPerms = computed(() => {
  if (!canWrite.value) return false;
  if (isCreating.value) return true;
  if (!editing.value) return false;
  // 仅 super_admin 硬锁；其余角色（含原 locked 的 org_*）可改
  if (editing.value.key === 'super_admin') return false;
  return true;
});

const canEditMeta = computed(() => {
  if (!canWrite.value) return false;
  if (isCreating.value) return true;
  if (!editing.value) return false;
  if (editing.value.key === 'super_admin') return false;
  return true;
});

const hasActiveFilters = computed(() => Boolean(keyword.value));

const {
  currentPage,
  pageSize,
  filteredRows,
  pagedRows,
  emptyText,
  resetPage,
  onPageChange,
  onPageSizeChange,
} = useAdminTable<RoleRow>({
  rows: () => rows.value,
  pageSize: 10,
  hasFilters: () => hasActiveFilters.value,
  emptyAll: '暂无角色',
  emptyFiltered: '没有符合条件的角色',
  filter: (row) => {
    const q = keyword.value.trim().toLowerCase();
    if (!q) return true;
    return row.name.toLowerCase().includes(q)
      || row.key.toLowerCase().includes(q)
      || (row.description || '').toLowerCase().includes(q);
  },
});

const {
  loading,
  onSearchInput,
  onSearchNow,
  onReset,
  dispose: disposeSearch,
} = useAdminSearch({
  debounceMs: 500,
  load: () => reload(),
  resetPage,
  beforeSearch: () => { keyword.value = keywordDraft.value.trim(); },
  clearFilters: () => {
    keywordDraft.value = '';
    keyword.value = '';
  },
});


const viewSelected = computed(() => new Set(viewing.value?.permissions ?? []));

const viewGroups = computed(() => {
  const granted = viewSelected.value;
  return catalog.value
    .map((group) => ({
      ...group,
      pages: groupPages(group)
        .map((page) => ({ ...page, items: page.items.filter((item) => granted.has(item.key)) }))
        .filter((page) => page.items.length > 0),
    }))
    .filter((group) => group.pages.length > 0);
});

function syncTabQuery(tab: 'platform' | 'tenant') {
  const nextQuery = { ...route.query, tab };
  if (route.query.tab === tab) return;
  void router.replace({ query: nextQuery });
}

async function reload() {
  loading.value = true;
  errorText.value = '';
  try {
    if (isTenantTab.value) {
      const [roleList, cat, ents] = await Promise.all([
        adminTenantRoleApi.list({
          tenantId: tenantFilter.value || undefined,
          keyword: keyword.value || undefined,
        }),
        adminTenantRoleApi.catalog(),
        enterprises.value.length
          ? Promise.resolve(enterprises.value)
          : adminEnterpriseApi.list(),
      ]);
      rows.value = roleList;
      catalog.value = cat.categories;
      enterprises.value = ents;
    } else {
      const [roleList, cat] = await Promise.all([
        adminRoleApi.list({ keyword: keyword.value || undefined }),
        adminPermissionApi.catalog(),
      ]);
      rows.value = roleList;
      catalog.value = cat.categories;
    }
  } catch (e) {
    errorText.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

function setTab(tab: 'platform' | 'tenant') {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  onTabChange();
}

function onTabChange() {
  keywordDraft.value = '';
  keyword.value = '';
  tenantFilter.value = '';
  resetPage();
  syncTabQuery(activeTab.value);
  void reload();
}


function catalogKeySet() {
  const keys = new Set<string>();
  for (const group of catalog.value) {
    for (const page of groupPages(group)) {
      for (const item of page.items) keys.add(item.key);
    }
  }
  return keys;
}

/** 只保留当前目录中的权限键，避免回传已下线的 portal.console.agents 等陈旧键。 */
function knownPerms(perms: Iterable<string>) {
  const known = catalogKeySet();
  return [...new Set([...perms].filter((k) => known.has(k)))].sort();
}

async function openViewer(row: RoleRow) {
  await ensureEditorCatalog(row.scope);
  viewing.value = row;
  viewOpen.value = true;
}

async function onDrawerClosed() {
  // 恢复当前 Tab 目录，避免预置编辑后的并集目录残留到平台角色查看。
  try {
    if (isTenantTab.value) {
      const cat = await adminTenantRoleApi.catalog();
      catalog.value = cat.categories;
    } else {
      const cat = await adminPermissionApi.catalog();
      catalog.value = cat.categories;
    }
  } catch {
    /* ignore */
  }
}

async function ensureEditorCatalog(scope: 'PLATFORM' | 'ORG_PRESET' | 'ORG_CUSTOM' | string) {
  // 平台角色用全量 Catalog；企业预置/企业自定义用并集∩硬顶，避免勾到 portal.admin.*。
  if (scope === 'ORG_PRESET' || scope === 'ORG_CUSTOM' || isTenantTab.value) {
    const cat = await adminTenantRoleApi.catalog();
    catalog.value = cat.categories;
  } else {
    const cat = await adminPermissionApi.catalog();
    catalog.value = cat.categories;
  }
}

async function openCreator() {
  drawerMode.value = 'create';
  editing.value = null;
  editName.value = '';
  editDescription.value = '';
  selected.value = new Set();
  createTenantId.value = tenantFilter.value || '';
  await ensureEditorCatalog(isTenantTab.value ? 'ORG_CUSTOM' : 'PLATFORM');
  drawerOpen.value = true;
}

async function openEditor(row: RoleRow) {
  drawerMode.value = 'edit';
  editing.value = row;
  editName.value = row.name;
  editDescription.value = row.description || '';
  await ensureEditorCatalog(row.scope);
  selected.value = new Set(knownPerms(row.permissions));
  drawerOpen.value = true;
}

function togglePerm(key: string) {
  if (!canEditPerms.value) return;
  const next = new Set(selected.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selected.value = next;
}

async function onSave() {
  if (!isCreating.value && !editing.value) return;
  if (!canEditPerms.value && !canEditMeta.value) return;
  const name = editName.value.trim();
  if (!name) {
    ElMessage.warning('请填写角色名称');
    return;
  }
  saving.value = true;
  try {
    if (isCreating.value) {
      if (isTenantTab.value) {
        if (!createTenantId.value) {
          ElMessage.warning('请选择所属企业');
          return;
        }
        await adminTenantRoleApi.create({
          tenantId: createTenantId.value,
          name,
          description: editDescription.value.trim() || null,
          permissions: knownPerms(selected.value),
        });
        ElMessage.success('角色已创建');
      } else {
        const created = await adminRoleApi.create({
          name,
          description: editDescription.value.trim() || null,
          permissions: knownPerms(selected.value),
        });
        rows.value = [...rows.value, created];
        ElMessage.success('角色已创建，权限将在用户下次登录后生效');
      }
      drawerOpen.value = false;
      await reload();
      return;
    }
    const target = editing.value;
    if (!target) return;
    const body: { name?: string; description?: string | null; permissions?: string[] } = {};
    if (canEditMeta.value) {
      body.name = editName.value.trim();
      body.description = editDescription.value.trim() || null;
    }
    if (canEditPerms.value) {
      body.permissions = knownPerms(selected.value);
    }
    if (isTenantTab.value) {
      await adminTenantRoleApi.update(target.id, body);
      ElMessage.success('已保存');
      drawerOpen.value = false;
      await reload();
      return;
    }
    const updated = await adminRoleApi.update(target.id, body);
    const idx = rows.value.findIndex((r) => r.id === updated.id);
    if (idx >= 0) rows.value[idx] = updated;
    editing.value = updated;
    selected.value = new Set(updated.permissions);
    ElMessage.success('已保存，权限变更将在相关用户下次登录后生效');
    drawerOpen.value = false;
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onDelete(row: RoleRow) {
  try {
    await ElMessageBox.confirm(
      `删除后不可恢复，确定删除角色「${row.name}」？`,
      '删除角色',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  try {
    if (isTenantTab.value) {
      await adminTenantRoleApi.remove(row.id);
    } else {
      await adminRoleApi.remove(row.id);
    }
    rows.value = rows.value.filter((item) => item.id !== row.id);
    if (editing.value?.id === row.id) drawerOpen.value = false;
    ElMessage.success('角色已删除');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败');
  }
}

onMounted(() => {
  syncTabQuery(activeTab.value);
  void reload();
});

onBeforeUnmount(() => {
  disposeSearch();
});
</script>

<style scoped>
.role-tabs-bar {
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 16px;
}

.role-tabs {
  display: flex;
  gap: 0;
}

.role-tab {
  align-items: center;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: #667085;
  cursor: pointer;
  display: inline-flex;
  font-size: 14px;
  font-weight: 500;
  height: 40px;
  line-height: 1;
  margin-bottom: -1px;
  padding: 0 16px;
}

.role-tab.active {
  border-bottom-color: #4A53A3;
  color: #4A53A3;
  font-weight: 600;
}

.tenant-filter {
  width: 220px;
}

.tenant-option {
  align-items: center;
  display: inline-flex;
  gap: 8px;
}

.subject-label {
  align-items: center;
  display: inline-flex;
  font-weight: 600;
  gap: 7px;
}

.muted-dash {
  color: #94a3b8;
}

.role-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.role-alert {
  margin-bottom: 12px;
}

.role-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 16px;
  justify-content: space-between;
}

.toolbar-left,
.toolbar-right {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.toolbar-left {
  flex: 1 1 auto;
}

.toolbar-right {
  flex: 0 0 auto;
}

.role-search {
  flex: 0 0 auto;
  min-width: 0;
  width: 240px;
}

.toolbar-button {
  flex: 0 0 auto;
  margin-left: 0;
}

.role-table {
  margin-top: 20px;
  width: 100%;
}

.identity-tag {
  align-items: center;
  display: inline-flex;
  gap: 7px;
}


.visual-dot {
  border-radius: 50%;
  flex: 0 0 7px;
  height: 7px;
  width: 7px;
}

.role-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.drawer-alert {
  margin-bottom: 14px;
}

.chip-section-title {
  color: #333946;
  font-size: 13px;
  font-weight: 600;
  margin: 8px 0 12px;
}

.chip-group {
  margin-bottom: 16px;
}

.chip-group-label {
  align-items: center;
  color: #64748b;
  display: flex;
  font-size: 12px;
  font-weight: 600;
  gap: 8px;
  margin-bottom: 8px;
}

.chip-group-count {
  color: #94a3b8;
  font-weight: 500;
}

.chip-page {
  margin-bottom: 10px;
}

.chip-page:last-child {
  margin-bottom: 0;
}

.chip-page-label {
  align-items: center;
  color: #475569;
  display: flex;
  font-size: 12px;
  font-weight: 600;
  gap: 8px;
  margin: 0 0 6px;
}

.chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.perm-chip {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  color: #334155;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.2;
  padding: 6px 12px;
}

.perm-chip.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #3E468C;
  font-weight: 600;
}

.perm-chip.locked {
  cursor: default;
  opacity: 0.85;
}

.perm-chip:disabled {
  cursor: default;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.operation-buttons {
  align-items: center;
  display: flex;
  gap: 4px;
  justify-content: center;
  white-space: nowrap;
}

.operation-buttons :deep(.el-button + .el-button) {
  margin-left: 0;
}


:deep(.role-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

:deep(.el-table__body td),
:deep(.el-table__body .cell) {
  font-size: 13px;
}

@media (max-width: 768px) {
  .role-toolbar {
    align-items: stretch;
    flex-direction: column;
    overflow-x: visible;
  }

  .toolbar-left,
  .toolbar-right {
    flex-direction: column;
    width: 100%;
  }

  .role-toolbar {
    align-items: stretch;
  }

  .role-search,
  .toolbar-button {
    width: 100%;
  }

  .role-pagination {
    justify-content: flex-start;
    overflow-x: auto;
  }
}
</style>

<!-- 查看弹窗渲染在 body（teleport）下，作用域样式无法命中根节点，这里用全局样式 -->
<style>
.role-dialog {
  display: flex;
  flex-direction: column;
  margin: auto;
  max-height: calc(100vh - 64px);
  max-width: calc(100vw - 32px);
  padding: 0;
}

.role-dialog .el-dialog__header {
  border-bottom: 1px solid #dfe5ef;
  margin-right: 0;
  padding: 18px 24px;
}

.role-dialog .el-dialog__title {
  color: #333946;
  font-size: 16px;
  font-weight: 600;
}

.role-dialog .el-dialog__body {
  color: #333946;
  flex: 1;
  font-size: 13px;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 24px 8px;
}

.role-dialog .el-dialog__footer {
  border-top: 1px solid #dfe5ef;
  padding: 14px 24px;
}

.role-dialog .el-descriptions__label {
  background: #f8fafc;
  color: #667085;
  font-weight: 400;
  width: 96px;
}

.role-dialog .el-descriptions__cell {
  padding: 10px 14px;
}

.role-dialog .chip-section-title {
  margin-top: 18px;
}

@media (max-width: 768px) {
  .role-dialog {
    width: calc(100vw - 32px) !important;
  }
}
</style>
