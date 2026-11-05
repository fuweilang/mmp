<template>
  <section class="roles-page">
    <div class="roles-toolbar">
      <el-input
        v-model="keywordDraft"
        class="roles-search"
        clearable
        placeholder="搜索角色名称"
        :prefix-icon="Search"
        @clear="onSearchNow"
        @input="onSearchInput"
        @keyup.enter="onSearchNow"
      />
      <el-button class="toolbar-button" @click="onSearchNow">搜索</el-button>
      <el-button class="toolbar-button" @click="onReset">重置</el-button>
      <div class="roles-actions">
        <el-tooltip content="需要企业管理员" placement="top" :disabled="isOrgAdminUser">
          <span>
            <el-button type="primary" :disabled="!isOrgAdminUser" @click="openCreate">新建角色</el-button>
          </span>
        </el-tooltip>
      </div>
    </div>

    <div v-loading="loading" class="roles-body">
      <template v-if="filteredRows.length || keyword || loading">
        <el-table
          :data="filteredRows"
          border
          class="roles-table"
          header-cell-class-name="roles-table-header"
        >
          <el-table-column label="名称" min-width="160" show-overflow-tooltip>
            <template #default="{ row, $index }">
              <div class="role-name-cell">
                <span class="role-dot" :style="{ backgroundColor: roleColor($index) }" />
                <span class="role-name">{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="系统预置" width="110" align="center">
            <template #default="{ row }">
              <el-tag
                size="small"
                effect="plain"
                :type="isPresetRole(row) ? 'warning' : 'success'"
              >
                {{ isPresetRole(row) ? '预置' : '自定义' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="描述" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.description || '—' }}
            </template>
          </el-table-column>
          <el-table-column label="成员数" width="100" align="center">
            <template #default="{ row }">
              {{ row.userCount }}
            </template>
          </el-table-column>
          <el-table-column label="权限" min-width="240">
            <template #default="{ row }">
              <div class="role-perms">
                <span
                  v-for="key in previewKeys(row)"
                  :key="key"
                  class="perm-chip perm-chip-readonly"
                >
                  {{ permLabel(key) }}
                </span>
                <span v-if="row.permKeys.length > 3" class="perm-chip perm-chip-more">
                  +{{ row.permKeys.length - 3 }}
                </span>
                <span v-if="!row.permKeys.length" class="role-perms-empty">未分配权限</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right" align="center">
            <template #default="{ row }">
              <div class="operation-buttons">
                <el-button link type="primary" @click="openViewer(row)">查看</el-button>
                <el-tooltip
                  v-if="isOrgAdminPreset(row)"
                  content="全局共享，请到平台管理修改"
                  placement="top"
                >
                  <span>
                    <el-button link type="primary" disabled>编辑</el-button>
                  </span>
                </el-tooltip>
                <el-tooltip
                  v-else-if="canEditRole(row)"
                  :content="isOrgMemberPreset(row) ? '编辑本企业成员权限覆盖' : '需要企业管理员'"
                  placement="top"
                  :disabled="isOrgAdminUser"
                >
                  <span>
                    <el-button link type="primary" :disabled="!isOrgAdminUser" @click="openEdit(row)">
                      编辑
                    </el-button>
                  </span>
                </el-tooltip>
                <el-tooltip
                  v-if="canDeleteRole(row)"
                  content="需要企业管理员"
                  placement="top"
                  :disabled="isOrgAdminUser"
                >
                  <span>
                    <el-button link type="danger" :disabled="!isOrgAdminUser" @click="onRemove(row)">
                      删除
                    </el-button>
                  </span>
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="emptyText" />
          </template>
        </el-table>
      </template>

      <div v-else-if="!loading" class="roles-empty-card">
        <p class="empty-title">{{ emptyText }}</p>
        <p class="empty-hint">
          列表含平台预置的企业管理员、企业成员，以及本企业自定义角色。
          企业管理员全局共享（只读）；企业成员可在本企业覆盖权限包；自定义角色可增删改。同一成员多角色权限取并集。
        </p>
        <el-tooltip content="需要企业管理员" placement="top" :disabled="isOrgAdminUser">
          <span>
            <el-button type="primary" :disabled="!isOrgAdminUser" @click="openCreate">新建角色</el-button>
          </span>
        </el-tooltip>
      </div>
    </div>

    <el-drawer
      v-model="drawerOpen"
      :title="editing ? `编辑角色 · ${editing.name}` : '新建角色'"
      size="680px"
      destroy-on-close
      @close="resetForm"
    >
      <el-alert
        v-if="editing && isOrgMemberPreset(editing)"
        type="info"
        :closable="false"
        show-icon
        title="保存后写入本企业覆盖，不影响其他企业与平台默认；未覆盖时跟随平台。"
        class="drawer-alert"
      />
      <el-alert
        v-else-if="editing"
        type="warning"
        :closable="false"
        show-icon
        title="修改权限会直接影响使用此角色的成员，保存后下次登录生效。"
        class="drawer-alert"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="名称" prop="name">
          <el-input
            v-model="form.name"
            maxlength="40"
            placeholder="如：部门主管"
            :disabled="!!editing && isOrgMemberPreset(editing)"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="form.description"
            maxlength="200"
            placeholder="这个角色的用途（可选）"
            :disabled="!!editing && isOrgMemberPreset(editing)"
          />
        </el-form-item>
        <el-form-item label="权限包" prop="permKeys">
          <div class="perm-panel">
            <div v-for="group in catalog" :key="group.category" class="perm-group">
              <div class="perm-group-label">
                <span>{{ group.labelZh }}</span>
                <span class="perm-group-count">{{ groupSelectedCount(group) }}</span>
              </div>
              <div
                v-for="(page, pageIndex) in groupPages(group)"
                :key="`${group.category}-${page.page ?? 'flat'}-${pageIndex}`"
                class="perm-page"
              >
                <div v-if="page.pageZh" class="perm-page-label">
                  <span>{{ page.pageZh }}</span>
                  <span class="perm-group-count">{{ pageSelectedCount(page) }}</span>
                </div>
                <div class="perm-chips" :class="{ indented: page.pageZh }">
                  <button
                    v-for="item in page.items"
                    :key="item.key"
                    type="button"
                    class="perm-chip"
                    :class="{ active: form.permKeys.includes(item.key) }"
                    :title="item.labelEn"
                    @click="togglePerm(item.key)"
                  >
                    {{ item.labelZh }}
                  </button>
                </div>
              </div>
            </div>
            <p v-if="!catalog.length && catalogLoaded" class="perm-empty">暂无可分配的权限</p>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="drawer-footer">
          <el-button @click="drawerOpen = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="onSave">
            {{ editing ? '保存' : '创建' }}
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
        <el-alert
          v-if="isOrgAdminPreset(viewing)"
          type="info"
          :closable="false"
          show-icon
          title="全局共享，请到平台管理修改"
          class="drawer-alert"
        />
        <el-alert
          v-else-if="isOrgMemberPreset(viewing)"
          type="info"
          :closable="false"
          show-icon
          :title="viewing.hasTenantOverride ? '当前显示本企业覆盖权限包' : '当前跟随平台默认（尚未覆盖）'"
          class="drawer-alert"
        />
        <el-descriptions :column="2" border>
          <el-descriptions-item label="类型">
            {{ isPresetRole(viewing) ? '系统预置' : '自定义' }}
          </el-descriptions-item>
          <el-descriptions-item label="权限数">
            {{ viewing.permKeys.length }}
          </el-descriptions-item>
          <el-descriptions-item label="关联成员" :span="2">
            {{ viewing.userCount }}
          </el-descriptions-item>
          <el-descriptions-item label="说明" :span="2">
            {{ viewing.description || '-' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="chip-section-title">权限包</div>
        <div
          v-for="group in viewGroups"
          :key="group.category"
          class="chip-group"
        >
          <div class="chip-group-label">
            <span>{{ group.labelZh }}</span>
            <span class="chip-group-count">{{ group.pages.flatMap((p) => p.items).length }} 项</span>
          </div>
          <div
            v-for="(page, pageIndex) in group.pages"
            :key="`view-${group.category}-${page.page || 'flat'}-${pageIndex}`"
            class="chip-page"
          >
            <div
              v-if="page.pageZh"
              class="chip-page-label"
            >
              <span>{{ page.pageZh }}</span>
              <span class="chip-group-count">{{ page.items.length }} 项</span>
            </div>
            <div class="chip-wrap">
              <span
                v-for="item in page.items"
                :key="item.key"
                class="perm-chip perm-chip-readonly"
                :title="item.labelEn"
              >
                {{ item.labelZh }}
              </span>
            </div>
          </div>
        </div>
        <p v-if="!viewGroups.length" class="perm-empty">未分配权限</p>
      </template>
      <template #footer>
        <el-button @click="viewOpen = false">关闭</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Search } from 'lucide-vue-next';
import { isOrgAdmin } from '@mammoth/shared';
import {
  tenantRoleApi,
  type PermissionCatalogGroup,
  type PermissionCatalogPage,
  type TenantRoleRow,
} from '../api/console';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
/** 写操作仅企业管理员（或平台管理员代运营）。 */
const isOrgAdminUser = computed(() => isOrgAdmin(auth.session));

const ROLE_COLORS = ['#4A53A3', '#0891b2', '#7c3aed', '#c2410c', '#15803d', '#b45309'];

const loading = ref(false);
const saving = ref(false);
const rows = ref<TenantRoleRow[]>([]);
const keywordDraft = ref('');
const keyword = ref('');
let searchTimer = 0;
const drawerOpen = ref(false);
const editing = ref<TenantRoleRow | null>(null);
const viewOpen = ref(false);
const viewing = ref<TenantRoleRow | null>(null);
const formRef = ref<FormInstance>();
const catalog = ref<PermissionCatalogGroup[]>([]);
const catalogLoaded = ref(false);

const form = reactive({
  name: '',
  description: '',
  permKeys: [] as string[],
});

const rules: FormRules = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  permKeys: [
    {
      validator: (_rule, value: string[], callback) => {
        if (!value || value.length === 0) callback(new Error('至少勾选一个权限'));
        else callback();
      },
      trigger: 'change',
    },
  ],
};

const filteredRows = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter((row) => row.name.toLowerCase().includes(q));
});

const emptyText = computed(() =>
  keyword.value ? '没有符合搜索的角色' : '暂无角色',
);

/** 平台预置（展示用）。 */
function isPresetRole(row: TenantRoleRow) {
  return row.scope === 'ORG_PRESET' || row.key === 'org_admin' || row.key === 'org_member';
}

function isOrgAdminPreset(row: TenantRoleRow) {
  return row.key === 'org_admin' || (row.scope === 'ORG_PRESET' && row.key === 'org_admin');
}

function isOrgMemberPreset(row: TenantRoleRow) {
  return row.key === 'org_member';
}

/** org_member 可走租户覆盖编辑；org_admin 只读；自定义看 editable。 */
function canEditRole(row: TenantRoleRow) {
  if (row.key === 'super_admin') return false;
  if (isOrgAdminPreset(row)) return false;
  if (isOrgMemberPreset(row)) return row.editable !== false;
  return row.scope === 'ORG_CUSTOM' && row.editable !== false;
}

function canDeleteRole(row: TenantRoleRow) {
  return row.scope === 'ORG_CUSTOM' && row.editable !== false && !isPresetRole(row);
}

function onSearchInput() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(onSearchNow, 500);
}

function onSearchNow() {
  window.clearTimeout(searchTimer);
  keyword.value = keywordDraft.value.trim();
}

function onReset() {
  window.clearTimeout(searchTimer);
  keywordDraft.value = '';
  keyword.value = '';
}

const permKeyLabel = computed(() => {
  const map = new Map<string, string>();
  for (const group of catalog.value) {
    for (const page of groupPages(group)) {
      for (const item of page.items) map.set(item.key, item.labelZh);
    }
  }
  return map;
});

function groupPages(group: PermissionCatalogGroup): PermissionCatalogPage[] {
  if (group.pages?.length) return group.pages;
  return [{ page: null, pageZh: '', pageEn: '', items: group.items }];
}

const viewSelected = computed(() => new Set(viewing.value?.permKeys ?? []));

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

function roleColor(index: number) {
  return ROLE_COLORS[index % ROLE_COLORS.length];
}

function previewKeys(row: TenantRoleRow) {
  return row.permKeys.slice(0, 3);
}

function permLabel(key: string) {
  return permKeyLabel.value.get(key) ?? key;
}

function groupSelectedCount(group: PermissionCatalogGroup) {
  const items = groupPages(group).flatMap((page) => page.items);
  const on = items.filter((item) => form.permKeys.includes(item.key)).length;
  return `${on}/${items.length}`;
}

function pageSelectedCount(page: PermissionCatalogPage) {
  const on = page.items.filter((item) => form.permKeys.includes(item.key)).length;
  return `${on}/${page.items.length}`;
}

function togglePerm(key: string) {
  const idx = form.permKeys.indexOf(key);
  if (idx >= 0) form.permKeys.splice(idx, 1);
  else form.permKeys.push(key);
}

async function load() {
  loading.value = true;
  try {
    rows.value = await tenantRoleApi.list();
  } finally {
    loading.value = false;
  }
}

async function loadCatalog(force = false) {
  // 目录随 admin 侧 org_admin∪org_member 包变化，打开创建/编辑时强制刷新
  if (catalogLoaded.value && !force) return;
  const data = await tenantRoleApi.catalog();
  catalog.value = data.categories;
  catalogLoaded.value = true;
}

function resetForm() {
  form.name = '';
  form.description = '';
  form.permKeys = [];
  editing.value = null;
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

function knownPermKeys(perms: Iterable<string>) {
  const known = catalogKeySet();
  return [...new Set([...perms].filter((k) => known.has(k)))];
}

async function openViewer(row: TenantRoleRow) {
  await loadCatalog(true);
  viewing.value = row;
  viewOpen.value = true;
}

async function openCreate() {
  if (!isOrgAdminUser.value) return;
  await loadCatalog(true);
  resetForm();
  drawerOpen.value = true;
}

async function openEdit(row: TenantRoleRow) {
  if (!isOrgAdminUser.value || !canEditRole(row)) return;
  await loadCatalog(true);
  editing.value = row;
  form.name = row.name;
  form.description = row.description ?? '';
  form.permKeys = knownPermKeys(row.permKeys);
  drawerOpen.value = true;
}

async function onSave() {
  if (!isOrgAdminUser.value) return;
  if (editing.value && isOrgAdminPreset(editing.value)) {
    ElMessage.warning('全局共享，请到平台管理修改');
    return;
  }
  await formRef.value?.validate();
  saving.value = true;
  try {
    const body = {
      name: form.name,
      description: form.description || undefined,
      permKeys: knownPermKeys(form.permKeys),
    };
    if (editing.value) {
      await tenantRoleApi.patch(editing.value.id, body);
      ElMessage.success(isOrgMemberPreset(editing.value) ? '已保存本企业成员权限覆盖' : '已保存');
      catalogLoaded.value = false;
    } else {
      await tenantRoleApi.create(body);
      ElMessage.success('已创建');
      catalogLoaded.value = false;
    }
    drawerOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

async function onRemove(row: TenantRoleRow) {
  if (!isOrgAdminUser.value || !canDeleteRole(row)) return;
  await ElMessageBox.confirm(
    h('div', [
      '确定删除角色「',
      h('span', { style: 'color: var(--app-primary-color); font-weight: 600;' }, row.name),
      '」？',
    ]),
    '删除角色',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    },
  );
  try {
    await tenantRoleApi.remove(row.id);
    ElMessage.success('已删除');
    await load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

onMounted(() => {
  void load();
  void loadCatalog();
});

onBeforeUnmount(() => {
  window.clearTimeout(searchTimer);
});
</script>

<style scoped>
.roles-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.roles-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  margin-bottom: 0;
  overflow-x: auto;
}

.roles-search {
  width: 260px;
}

.toolbar-button {
  flex: 0 0 auto;
  margin-left: 0;
}

.toolbar-button + .toolbar-button {
  margin-left: 0;
}

.roles-actions {
  display: flex;
  flex: 0 0 auto;
  margin-left: auto;
}

.roles-body {
  min-height: 200px;
}

.roles-table {
  margin-top: 20px;
  width: 100%;
}

:deep(.roles-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

:deep(.el-table__body td),
:deep(.el-table__body .cell) {
  font-size: 13px;
}

.role-name-cell {
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;
}

.role-dot {
  border-radius: 50%;
  flex: 0 0 8px;
  height: 8px;
  width: 8px;
}

.role-name {
  color: #333946;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-perms {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 24px;
}

.role-perms-empty {
  color: #98a2b3;
  font-size: 12px;
}

.roles-empty-card {
  align-items: center;
  background: #fff;
  border: 1px solid #dfe5ef;
  display: flex;
  flex-direction: column;
  gap: 0;
  justify-content: center;
  margin-top: 20px;
  min-height: 280px;
  padding: 40px 24px;
  text-align: center;
}

.empty-title {
  color: #333946;
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px;
}

.empty-hint {
  color: #8b909b;
  font-size: 12px;
  line-height: 1.8;
  margin: 0 0 16px;
  max-width: 420px;
  text-align: center;
}

.drawer-alert {
  margin-bottom: 16px;
}

/* ---- 权限面板（抽屉内） ---- */

.perm-panel {
  border: 1px solid #dfe5ef;
  max-height: 480px;
  overflow-y: auto;
  padding: 12px 16px;
  width: 100%;
}

.perm-group + .perm-group {
  margin-top: 12px;
}

.perm-group-label {
  align-items: center;
  color: #333946;
  display: flex;
  font-size: 13px;
  font-weight: 600;
  justify-content: space-between;
  margin-bottom: 6px;
}

.perm-group-count {
  color: #98a2b3;
  font-size: 12px;
  font-weight: 400;
}

.perm-page + .perm-page {
  margin-top: 10px;
}

.perm-page-label {
  align-items: center;
  background: #f8fafc;
  color: #667085;
  display: flex;
  font-size: 12px;
  gap: 6px;
  justify-content: space-between;
  line-height: 28px;
  margin-bottom: 6px;
  padding: 0 8px;
}

.perm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.perm-chips.indented {
  padding-left: 8px;
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
  transition: all 0.18s ease;
}

.perm-chip:hover {
  border-color: #3b82f6;
  color: var(--app-primary-hover-color);
}

.perm-chip.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: var(--app-primary-hover-color);
  font-weight: 600;
}

.perm-chip-readonly {
  cursor: default;
  pointer-events: none;
}

.perm-chip-readonly:hover {
  border-color: #e2e8f0;
  color: #334155;
}

.perm-chip-more {
  background: #F5F6FB;
  color: #8b909b;
}

.perm-empty {
  color: #98a2b3;
  font-size: 13px;
  margin: 0;
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
</style>

<!-- 查看弹窗 teleport 到 body，需全局样式 -->
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
