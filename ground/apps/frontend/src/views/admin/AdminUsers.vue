<template>
  <section class="user-page">
    <div class="user-toolbar">
      <div class="user-search-wrap">
        <el-input
          v-model="nameDraft"
          class="user-search-keyword"
          clearable
          placeholder="搜索姓名"
          :prefix-icon="Search"
          @clear="onSearchNow"
          @input="onSearchInput"
          @keyup.enter="onSearchNow"
        />
        <el-input
          v-model="phoneDraft"
          class="user-search"
          clearable
          placeholder="搜索手机号"
          :prefix-icon="Search"
          @clear="onSearchNow"
          @input="onPhoneInput"
          @keyup.enter="onSearchNow"
        />
        <el-select
          v-model="roleFilter"
          class="role-filter"
          clearable
          placeholder="筛选角色"
          @change="onSearchNow"
          @clear="onSearchNow"
        >
          <el-option
            v-for="role in roleOptions"
            :key="role.key"
            :label="role.name"
            :value="role.key"
          />
          <el-option label="无角色" value="none" />
        </el-select>
        <el-select
          v-model="statusFilter"
          class="status-filter"
          clearable
          placeholder="账号状态"
          @change="onSearchNow"
          @clear="onSearchNow"
        >
          <el-option label="激活" value="active" />
          <el-option label="停用" value="inactive" />
        </el-select>
        <el-select
          v-model="enterpriseFilter"
          class="enterprise-filter"
          clearable
          filterable
          placeholder="筛选所属企业"
          @change="onEnterpriseChange"
          @clear="onEnterpriseChange"
        >
          <el-option
            v-for="item in enterprises"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </div>
      <el-button class="toolbar-button" :loading="loading" type="primary" @click="onSearchNow">
        搜索
      </el-button>
      <el-button class="toolbar-button" @click="onReset">
        重置
      </el-button>
      <div class="user-actions">
        <el-button type="primary" @click="openCreate">新建</el-button>
      </div>
    </div>

    <UserTable
      :rows="pagedRows"
      :loading="loading"
      :load-error="loadError"
      :empty-text="emptyText"
      :has-active-filters="hasActiveFilters"
      :current-page="currentPage"
      :page-size="pageSize"
      :total="filteredRows.length"
      :current-user-id="currentUserId"
      :actor-is-super-admin="actorIsSuperAdmin"
      :status-changing-id="statusChangingId"
      :deleting-id="deletingId"
      @retry="load"
      @view="openView"
      @edit="openEdit"
      @change-password="openChangePassword"
      @activate="onActivate"
      @deactivate="onDeactivate"
      @delete="onDelete"
      @create="openCreate"
      @page-change="onPageChange"
      @page-size-change="onPageSizeChange"
    />

    <UserFormDialog
      ref="userFormDialogRef"
      v-model="open"
      :form="form"
      :editing-id="editingId"
      :saving="saving"
      :enterprises="enterprises"
      :user-enterprises="editingEnterprises"
      :enterprises-loading="enterprisesLoading"
      :enterprises-error="enterprisesError"
      :role-options="roleOptions"
      @save="onSave"
      @role-change="onRoleKeyChange"
      @reload-enterprises="loadEnterprises"
    />

    <UserPermViewDialog
      v-model="viewOpen"
      :viewing-row="viewingRow"
      :perms-loading="permsLoading"
      :view-is-platform-admin="viewIsPlatformAdmin"
      :view-perm-groups="viewPermGroups"
      :view-roles="viewRoles"
      :tenant-options="viewTenantOptions"
      v-model:selected-tenant-id="viewTenantId"
    />

    <el-dialog
      v-model="passwordOpen"
      title="修改密码"
      class="user-dialog"
      width="460px"
    >
      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="96px">
        <el-form-item label="新密码" prop="password">
          <el-input
            v-model="passwordForm.password"
            type="password"
            show-password
            placeholder="请输入新密码"
            @input="passwordFormRef?.clearValidate('confirm')"
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirm">
          <el-input
            v-model="passwordForm.confirm"
            type="password"
            show-password
            placeholder="请再次输入密码"
          />
        </el-form-item>
        <div class="form-hint form-hint-block">
          修改后该用户需使用新密码重新登录
        </div>
      </el-form>
      <template #footer>
        <el-button @click="passwordOpen = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="onChangePassword">确定</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Search } from 'lucide-vue-next';
import { useAdminSearch, useAdminTable } from '../../composables/useAdminTable';
import { adminEnterpriseApi, adminPermissionApi, adminRoleApi, adminUserApi, type AdminEnterpriseRow, type AdminRoleRow, type AdminUserRow, type PermissionCatalogGroup, type RolePermSource } from '../../api/admin';
import { useAuthStore } from '../../stores/auth';
import UserTable from '@/components/admin/users/UserTable.vue';
import UserFormDialog from '@/components/admin/users/UserFormDialog.vue';
import UserPermViewDialog from '@/components/admin/users/UserPermViewDialog.vue';
import { canChangePassword, canDeleteUser } from '@/components/admin/users/userDisplay';

const auth = useAuthStore();
const rows = ref<AdminUserRow[]>([]);
const enterprises = ref<AdminEnterpriseRow[]>([]);
const editingEnterprises = ref<Array<Pick<AdminEnterpriseRow, 'id' | 'name'>>>([]);
const enterprisesLoading = ref(false);
const enterprisesError = ref('');
const roleOptions = ref<AdminRoleRow[]>([]);
const loadError = ref('');
const open = ref(false);
const saving = ref(false);
const editingId = ref('');
const initialTenantId = ref('');
const initialPlatformAccount = ref(false);
const passwordOpen = ref(false);
const viewOpen = ref(false);
const viewingRow = ref<AdminUserRow | null>(null);
const permsLoading = ref(false);
const viewPermSet = ref<Set<string> | null>(null);
const viewRoles = ref<RolePermSource[]>([]);
const viewIsPlatformAdmin = ref(false);
const viewTenantId = ref('');
const viewTenantOptions = ref<Array<{ id: string; name: string }>>([]);
const permCatalog = ref<PermissionCatalogGroup[]>([]);

/** 按有效权限并集展示；不把 console∪admin 目录模板当用户权限。 */
const viewPermGroups = computed<PermissionCatalogGroup[]>(() => {
  const set = viewPermSet.value;
  if (!set) return [];
  const known = new Set<string>();
  const groups = permCatalog.value
    .map((g) => {
      const items = g.items.filter((item) => set.has(item.key));
      for (const item of items) known.add(item.key);
      return { ...g, items };
    })
    .filter((g) => g.items.length > 0);
  const orphans = [...set].filter((k) => !known.has(k)).sort();
  if (orphans.length) {
    groups.push({
      category: '_effective_other',
      labelZh: '其他有效权限',
      labelEn: 'Other',
      items: orphans.map((key) => ({ key, labelZh: key, labelEn: key })),
      pages: [],
    });
  }
  return groups;
});

async function loadPermCatalog() {
  if (permCatalog.value.length) return;
  try {
    const res = await adminPermissionApi.catalog();
    permCatalog.value = res.categories;
  } catch {
    permCatalog.value = [];
  }
}
const passwordSaving = ref(false);
const passwordTargetId = ref('');
const passwordFormRef = ref<FormInstance>();
const passwordForm = reactive({
  password: '',
  confirm: '',
});
const statusChangingId = ref('');
const deletingId = ref('');
const nameDraft = ref('');
const phoneDraft = ref('');
const roleFilter = ref('');
const statusFilter = ref('');
const enterpriseFilter = ref('');
const userFormDialogRef = ref<InstanceType<typeof UserFormDialog> | null>(null);

const form = reactive({
  name: '',
  phone: '',
  password: '',
  passwordConfirm: '',
  /** 用户角色（多选）；空数组 = 无角色。 */
  roleKeys: [] as string[],
  tenantId: '',
});

function onRoleKeyChange() {
  const result = userFormDialogRef.value?.validateField?.('tenantId');
  if (result && typeof (result as Promise<unknown>).catch === 'function') {
    (result as Promise<unknown>).catch(() => undefined);
  }
}

const currentUserId = computed(() => auth.session?.user.id || '');

const actorIsSuperAdmin = computed(
  () =>
    auth.session?.platformRoleKey === 'super_admin'
    || auth.session?.user?.platformRoleKey === 'super_admin',
);

const hasActiveFilters = computed(() =>
  Boolean(nameDraft.value || phoneDraft.value || roleFilter.value || statusFilter.value || enterpriseFilter.value),
);

const {
  currentPage,
  pageSize,
  filteredRows,
  pagedRows,
  emptyText,
  resetPage,
  onPageChange,
  onPageSizeChange,
} = useAdminTable<AdminUserRow>({
  rows: () => rows.value,
  pageSize: 20,
  hasFilters: () => hasActiveFilters.value,
  emptyAll: '还没有用户',
  emptyFiltered: '没有符合条件的用户',
  filter: (row) => {
    const name = nameDraft.value.trim();
    const phone = phoneDraft.value.trim();
    if (name && !row.name.includes(name)) return false;
    if (phone && !row.phone.includes(phone)) return false;
    return true;
  },
});

const {
  loading,
  onSearchInput,
  onSearchNow,
  onReset,
  runLoad,
  dispose: disposeSearch,
} = useAdminSearch({
  debounceMs: 350,
  load: () => load(),
  resetPage,
  clearFilters: () => {
    nameDraft.value = '';
    phoneDraft.value = '';
    roleFilter.value = '';
    statusFilter.value = '';
    enterpriseFilter.value = '';
  },
});

const passwordRules: FormRules = {
  password: [{ required: true, message: '请输入新密码', trigger: 'blur' }],
  confirm: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (value !== passwordForm.password) {
          callback(new Error('两次输入的密码不一致'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

function onPhoneInput(value: string) {
  phoneDraft.value = value.replace(/\D/g, '').slice(0, 11);
  onSearchInput();
}

function onEnterpriseChange() {
  resetPage();
  void load();
}

function resetForm() {
  editingEnterprises.value = [];
  editingId.value = '';
  initialPlatformAccount.value = false;
  initialTenantId.value = '';
  form.name = '';
  form.phone = '';
  form.password = '';
  form.passwordConfirm = '';
  form.roleKeys = [];
  form.tenantId = '';
  userFormDialogRef.value?.clearValidate?.();
}

function clearFormError() {
  // 等表单渲染完再清，避免复用弹窗时残留上一个用户的报错
  void nextTick(() => userFormDialogRef.value?.clearValidate?.());
}

function openCreate() {
  resetForm();
  open.value = true;
  clearFormError();
}

function applyPermResponse(res: {
  permissions: string[];
  roles?: RolePermSource[];
  isPlatformAdmin: boolean;
  tenantId: string | null;
  tenants: Array<{ id: string; name: string }>;
}) {
  viewPermSet.value = new Set(res.permissions);
  viewRoles.value = res.roles ?? [];
  viewIsPlatformAdmin.value = res.isPlatformAdmin;
  viewTenantOptions.value = res.tenants ?? [];
  viewTenantId.value = res.tenantId ?? res.tenants?.[0]?.id ?? '';
}

async function loadViewPermissions(userId: string, tenantId?: string) {
  permsLoading.value = true;
  try {
    const res = await adminUserApi.permissions(userId, tenantId ? { tenantId } : {});
    applyPermResponse(res);
  } catch {
    viewPermSet.value = new Set();
    viewRoles.value = [];
  } finally {
    permsLoading.value = false;
  }
}

function openView(row: AdminUserRow) {
  viewingRow.value = row;
  viewOpen.value = true;
  viewPermSet.value = null;
  viewRoles.value = [];
  viewIsPlatformAdmin.value = false;
  viewTenantOptions.value = row.tenants.map((t) => ({ id: t.id, name: t.name }));
  viewTenantId.value = row.tenants[0]?.id ?? '';
  void loadPermCatalog();
  void loadViewPermissions(row.id, viewTenantId.value || undefined);
}

watch(viewTenantId, (next, prev) => {
  if (!viewOpen.value || !viewingRow.value) return;
  if (!next || next === prev) return;
  void loadViewPermissions(viewingRow.value.id, next);
});

function openEdit(row: AdminUserRow) {
  resetForm();
  editingId.value = row.id;
  editingEnterprises.value = row.tenants.map(({ id, name }) => ({ id, name }));
  initialPlatformAccount.value = row.isPlatformAdmin;
  form.name = row.name;
  form.phone = row.phone;
  form.password = '';
  const tenant = row.tenants[0];
  const legacyKey = row.platformRoleKey
    ?? tenant?.roleKey
    ?? (tenant?.role === 'ADMIN' || tenant?.role === 'OWNER' ? 'org_admin' : tenant?.role === 'MEMBER' ? 'org_member' : '');
  form.roleKeys = row.roleKeys?.length ? [...row.roleKeys] : (legacyKey ? [legacyKey] : []);
  form.tenantId = row.tenants[0]?.id ?? '';
  initialTenantId.value = form.tenantId;
  open.value = true;
  clearFormError();
}

async function load() {
  await runLoad(async (isCurrent) => {
    try {
      const result = await adminUserApi.list({
        keyword: nameDraft.value.trim() || phoneDraft.value.trim(),
        role: roleFilter.value,
        status: statusFilter.value,
        enterpriseId: enterpriseFilter.value,
      });
      if (!isCurrent()) return;
      rows.value = result;
      loadError.value = '';
    } catch (e) {
      if (!isCurrent()) return;
      loadError.value = e instanceof Error ? e.message : '加载失败';
      ElMessage.error(loadError.value);
    }
  });
}

async function loadEnterprises() {
  if (enterprisesLoading.value) return;
  enterprisesLoading.value = true;
  enterprisesError.value = '';
  try {
    enterprises.value = await adminEnterpriseApi.list();
  } catch {
    enterprisesError.value = '企业列表加载失败，请重试。';
  } finally {
    enterprisesLoading.value = false;
  }
}

async function loadRoles() {
  try {
    // 只允许分配平台角色；企业预设由成员身份自动套用
    roleOptions.value = await adminRoleApi.list();
  } catch {
    roleOptions.value = [];
  }
}

async function onSave() {
  // UserFormDialog 已校验
  saving.value = true;
  try {
    // 多角色：权限取并集；只有全部是超级管理员/平台管理员时才可以不绑企业。
    const isPlatformAccount = form.roleKeys.every((key) => ['super_admin', 'platform_admin'].includes(key));
    if (editingId.value) {
      const payload: Parameters<typeof adminUserApi.update>[1] = {
        name: form.name.trim(),
      };
      // super_admin edit: do not send roleKeys / isPlatformAdmin
      const hideRoleSelect = Boolean(editingId.value) && form.roleKeys.includes('super_admin');
      if (!hideRoleSelect) {
        payload.isPlatformAdmin = isPlatformAccount;
        payload.roleKeys = [...form.roleKeys];
        if (!initialPlatformAccount.value || !form.roleKeys.some(key => ['super_admin', 'platform_admin'].includes(key))) payload.tenantId = form.tenantId || null;
      }
      if (initialPlatformAccount.value && form.roleKeys.some(key => ['super_admin', 'platform_admin'].includes(key)) && form.tenantId && form.tenantId !== initialTenantId.value) {
        payload.addMemberTenantId = form.tenantId;
      }
      await adminUserApi.update(editingId.value, payload);
      ElMessage.success('已保存');
    } else {
      await adminUserApi.create({
        name: form.name.trim(),
        phone: form.phone,
        password: form.password,
        isPlatformAdmin: isPlatformAccount,
        roleKeys: [...form.roleKeys],
        ...(form.tenantId ? { tenantId: form.tenantId } : {}),
      });
      ElMessage.success('已创建');
    }
    open.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

function resetPasswordForm() {
  passwordTargetId.value = '';
  passwordForm.password = '';
  passwordForm.confirm = '';
  passwordFormRef.value?.clearValidate();
}

function openChangePassword(row: AdminUserRow) {
  if (!canChangePassword(row, actorIsSuperAdmin.value)) return;
  passwordTargetId.value = row.id;
  passwordForm.password = '';
  passwordForm.confirm = '';
  passwordOpen.value = true;
  void nextTick(() => passwordFormRef.value?.clearValidate());
}

async function onChangePassword() {
  if (!passwordTargetId.value) return;
  const valid = await passwordFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  passwordSaving.value = true;
  try {
    await adminUserApi.changePassword(passwordTargetId.value, passwordForm.password);
    ElMessage.success('密码已更新');
    passwordOpen.value = false;
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '修改密码失败');
  } finally {
    passwordSaving.value = false;
  }
}

async function onActivate(row: AdminUserRow) {
  try {
    await ElMessageBox.confirm(`启用后「${row.name}」可以重新登录。确定启用？`, '启用用户', {
      type: 'info',
      confirmButtonText: '启用',
    });
  } catch {
    return;
  }
  statusChangingId.value = row.id;
  try {
    await adminUserApi.update(row.id, { status: 'active' });
    ElMessage.success('已启用');
    await load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '启用失败');
  } finally {
    statusChangingId.value = '';
  }
}

async function onDeactivate(row: AdminUserRow) {
  try {
    await ElMessageBox.confirm(`停用后「${row.name}」将无法登录。确定停用？`, '停用用户', {
      type: 'warning',
      confirmButtonText: '停用',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  statusChangingId.value = row.id;
  try {
    await adminUserApi.deactivate(row.id);
    ElMessage.success('已停用');
    await load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '停用失败');
  } finally {
    statusChangingId.value = '';
  }
}

async function onDelete(row: AdminUserRow) {
  if (!canDeleteUser(row)) return;
  try {
    await ElMessageBox.confirm(
      h('span', null, [
        '删除“',
        h('span', { style: { color: '#4A53A3', fontWeight: 600 } }, row.name),
        '”后账号不可恢复，确认删除？',
      ]),
      '删除用户',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        confirmButtonClass: 'el-button--danger',
      },
    );
  } catch {
    return;
  }
  deletingId.value = row.id;
  try {
    await adminUserApi.remove(row.id);
    ElMessage.success('用户已删除');
    await load();
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败');
  } finally {
    deletingId.value = '';
  }
}

onMounted(() => {
  void loadEnterprises();
  void loadRoles();
  void load();
});

onBeforeUnmount(() => {
  disposeSearch();
});
</script>

<style scoped>
.user-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.user-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  overflow-x: auto;
}

.user-search-wrap {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  gap: 10px;
  min-width: 0;
}

.user-search,
.user-search-keyword,
.role-filter,
.status-filter,
.enterprise-filter {
  flex: 0 0 auto;
  min-width: 0;
  width: 160px;
}

.user-search-keyword {
  width: 210px;
}

.role-filter,
.status-filter {
  width: 135px;
}

.enterprise-filter {
  width: 190px;
}

.toolbar-button {
  flex: 0 0 auto;
  margin-left: 0;
}

.toolbar-button + .toolbar-button {
  margin-left: 0;
}

.user-actions {
  display: flex;
  flex: 0 0 auto;
  margin-left: auto;
}

.form-hint {
  color: #98a2b3;
  font-size: 12px;
  line-height: 1.6;
  margin-top: 4px;
}

.form-hint-block {
  margin: 0 0 4px 96px;
}
</style>

<style>
/* 弹窗统一风格：方角、细分隔线、13px 正文 */
.user-dialog {
  border-radius: 0;
  max-width: calc(100vw - 32px);
}

.user-dialog .el-dialog__header {
  border-bottom: 1px solid #dfe5ef;
  margin-right: 0;
  padding: 18px 24px;
}

.user-dialog .el-dialog__title {
  color: #333946;
  font-size: 16px;
  font-weight: 600;
}

.user-dialog .el-dialog__headerbtn {
  height: 52px;
  width: 52px;
}

.user-dialog .el-dialog__body {
  color: #333946;
  font-size: 13px;
  padding: 22px 24px 6px;
}

.user-dialog .el-dialog__footer {
  border-top: 1px solid #dfe5ef;
  padding: 14px 24px;
}

.user-dialog .el-dialog__footer .el-button + .el-button {
  margin-left: 8px;
}

.user-dialog .el-form-item {
  margin-bottom: 18px;
}

.user-dialog .el-form-item__label {
  color: #667085;
  font-weight: 400;
}

.user-dialog .el-descriptions__label {
  background: #f8fafc;
  color: #667085;
  font-weight: 400;
  text-align: right;
  width: 96px;
}

.user-dialog .el-descriptions__content {
  color: #333946;
}

.user-dialog .el-descriptions__cell {
  padding: 10px 14px;
}
</style>
