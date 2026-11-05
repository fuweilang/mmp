import { computed, h, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormRules } from 'element-plus';
import { Search } from 'lucide-vue-next';
import { isOrgAdmin } from '@mammoth/shared';
import { tenantApi, type MemberRow, type RolePermSource } from '@/api/tenants';
import { tenantRoleApi, type AssignableRole, type PermissionCatalogGroup } from '@/api/console';
import { useAuthStore } from '@/stores/auth';

export function useMembersPage() {
  const auth = useAuthStore();
  const hasTenant = computed(() => Boolean(auth.session?.currentTenant));
  /** 写操作仅企业管理员（或平台管理员代运营）；读列表由路由/页面权限控制。 */
  const isOrgAdminUser = computed(() => isOrgAdmin(auth.session));
  const rows = ref<MemberRow[]>([]);
  const loading = ref(false);
  const open = ref(false);
  const saving = ref(false);
  const keywordDraft = ref('');
  const keyword = ref('');
  const roleFilter = ref<string[]>([]);
  const currentPage = ref(1);
  const pageSize = ref(10);
  let searchTimer = 0;
  const form = reactive({
    name: '',
    phone: '',
    password: '',
    roleIds: [] as string[],
  });

  const rules: FormRules = {
    name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
    phone: [{ required: true, min: 11, message: '请输入 11 位手机号', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
    roleIds: [{ required: true, type: 'array', min: 1, message: '请选择角色', trigger: 'change' }],
  };

  const filteredRows = computed(() => {
    const q = keyword.value.toLowerCase();
    const filterIds = new Set(roleFilter.value);
    return rows.value.filter((row) => {
      if (filterIds.size) {
        const ids = (row.user?.roles ?? []).map((item) => item.role.id);
        if (!ids.some((id) => filterIds.has(id))) return false;
      }
      if (!q) return true;
      return row.user.name.toLowerCase().includes(q) || (row.user.phone || '').includes(q);
    });
  });

  const pagedRows = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return filteredRows.value.slice(start, start + pageSize.value);
  });

  const emptyText = computed(() => {
    if (!hasTenant.value) return '请先选择企业';
    if (keyword.value || roleFilter.value.length) return '没有符合条件的成员';
    return '还没有成员';
  });

  const showEmptyAdd = computed(
    () => hasTenant.value && !keyword.value && !roleFilter.value.length,
  );

  function resetPage() {
    currentPage.value = 1;
  }

  function onSearchInput() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(onSearchNow, 300);
  }

  function onSearchNow() {
    window.clearTimeout(searchTimer);
    keyword.value = keywordDraft.value.trim();
    resetPage();
  }

  function onReset() {
    window.clearTimeout(searchTimer);
    keywordDraft.value = '';
    keyword.value = '';
    roleFilter.value = [];
    resetPage();
  }

  async function loadAssignableRoles() {
    if (!auth.session?.currentTenant) {
      assignableRoles.value = [];
      return;
    }
    assignableRoles.value = await tenantRoleApi.assignable();
  }

  function onPageChange(page: number) {
    currentPage.value = page;
  }

  function onPageSizeChange(size: number) {
    pageSize.value = size;
    resetPage();
  }

  function resetForm() {
    form.name = '';
    form.phone = '';
    form.password = '';
    form.roleIds = [];
  }

  function openCreate() {
    if (!isOrgAdminUser.value) return;
    resetForm();
    open.value = true;
  }

  const roleDialogOpen = ref(false);
  const savingRoles = ref(false);
  const editingRow = ref<MemberRow | null>(null);
  const editRoleIds = ref<string[]>([]);
  const editName = ref('');
  const assignableRoles = ref<AssignableRole[]>([]);

  const viewOpen = ref(false);
  const viewMember = ref<MemberRow | null>(null);
  const permsLoading = ref(false);
  const viewPermSet = ref<Set<string> | null>(null);
  const viewRoles = ref<RolePermSource[]>([]);
  const viewIsPlatformAdmin = ref(false);
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


  const passwordOpen = ref(false);
  const savingPassword = ref(false);
  const passwordRow = ref<MemberRow | null>(null);
  const passwordForm = reactive({ password: '', confirm: '' });
  const passwordRules: FormRules = {
    password: [{ required: true, message: '请输入新密码', trigger: 'blur' }],
    confirm: [
      { required: true, message: '请再次输入新密码', trigger: 'blur' },
      {
        validator: (_rule, value: string, callback) => {
          if (value !== passwordForm.password) callback(new Error('两次输入的密码不一致'));
          else callback();
        },
        trigger: 'blur',
      },
    ],
  };

  function openPassword(row: MemberRow) {
    if (!isOrgAdminUser.value) return;
    passwordRow.value = row;
    passwordForm.password = '';
    passwordForm.confirm = '';
    passwordOpen.value = true;
  }

  async function onSavePassword() {
    if (!isOrgAdminUser.value || !passwordRow.value) return;
    savingPassword.value = true;
    try {
      await tenantApi.changeMemberPassword(passwordRow.value.id, passwordForm.password);
      ElMessage.success('密码已重置');
      passwordOpen.value = false;
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '重置失败');
    } finally {
      savingPassword.value = false;
    }
  }

  async function loadPermCatalog() {
    if (permCatalog.value.length) return;
    try {
      const res = await tenantRoleApi.catalog();
      permCatalog.value = res.categories;
    } catch {
      permCatalog.value = [];
    }
  }

  function openView(row: MemberRow) {
    viewMember.value = row;
    viewOpen.value = true;
    permsLoading.value = true;
    viewPermSet.value = null;
    viewRoles.value = [];
    viewIsPlatformAdmin.value = false;
    void loadPermCatalog();
    tenantApi
      .memberPermissions(row.id)
      .then((res) => {
        viewMember.value = res.member;
        viewPermSet.value = new Set(res.permissions);
        viewRoles.value = res.roles ?? [];
        viewIsPlatformAdmin.value = res.isPlatformAdmin;
      })
      .catch(() => {
        viewPermSet.value = new Set();
        viewRoles.value = [];
      })
      .finally(() => {
        permsLoading.value = false;
      });
  }

  async function openEditRoles(row: MemberRow) {
    if (!isOrgAdminUser.value) return;
    editingRow.value = row;
    editName.value = row.user.name;
    // 预填企业侧角色（预设 + 本企业自建），平台角色不在可选项内。
    editRoleIds.value = (row.user.roles ?? [])
      .filter((item) => item.role.scope === 'ORG_PRESET' || item.role.scope === 'ORG_CUSTOM')
      .map((item) => item.role.id);
    if (!assignableRoles.value.length) {
      assignableRoles.value = await tenantRoleApi.assignable();
    }
    roleDialogOpen.value = true;
  }

  async function onRemove(row: MemberRow) {
    if (!isOrgAdminUser.value) return;
    try {
      await ElMessageBox.confirm(
        h('div', [
          '删除后「',
          h('span', { style: 'color: var(--app-primary-color); font-weight: 600;' }, row.user.name),
          '」将不再是本企业成员；若其未加入其他企业、无平台角色，账号将被一并删除且不可恢复。确定删除？',
        ]),
        '删除成员',
        { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }
    try {
      await tenantApi.removeMember(row.id);
      rows.value = rows.value.filter((item) => item.id !== row.id);
      ElMessage.success('已删除');
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '删除失败');
    }
  }

  async function onSaveRoles() {
    if (!isOrgAdminUser.value || !editingRow.value) return;
    const name = editName.value.trim();
    if (!name) {
      ElMessage.warning('请输入姓名');
      return;
    }
    savingRoles.value = true;
    try {
      const updated = await tenantApi.patchMember(editingRow.value.id, {
        name,
        roleIds: [...editRoleIds.value],
      });
      const index = rows.value.findIndex((row) => row.id === editingRow.value?.id);
      if (index >= 0) rows.value[index] = updated;
      roleDialogOpen.value = false;
      ElMessage.success('已保存');
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      savingRoles.value = false;
    }
  }

  async function load() {
    if (!auth.session?.currentTenant) {
      rows.value = [];
      return;
    }
    loading.value = true;
    try {
      rows.value = await tenantApi.members();
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      loading.value = false;
    }
  }

  async function onAdd() {
    if (!isOrgAdminUser.value) return;
    saving.value = true;
    try {
      await tenantApi.addMember({
        name: form.name.trim(),
        phone: form.phone,
        password: form.password,
        roleIds: [...form.roleIds],
      });
      ElMessage.success('已添加');
      open.value = false;
      await load();
    } catch (e) {
      ElMessage.error(e instanceof Error ? e.message : '失败');
    } finally {
      saving.value = false;
    }
  }

  watch(roleFilter, resetPage);
  onMounted(() => {
    load();
    loadAssignableRoles();
  });
  watch(() => auth.session?.currentTenant?.id, () => {
    load();
    loadAssignableRoles();
  });
  onBeforeUnmount(() => {
    window.clearTimeout(searchTimer);
  });
  return {
    Search,
    auth,
    hasTenant,
    isOrgAdminUser,
    loading,
    open,
    saving,
    keywordDraft,
    keyword,
    roleFilter,
    currentPage,
    pageSize,
    form,
    rules,
    filteredRows,
    pagedRows,
    emptyText,
    showEmptyAdd,
    onSearchInput,
    onSearchNow,
    onReset,
    onPageChange,
    onPageSizeChange,
    resetForm,
    openCreate,
    roleDialogOpen,
    savingRoles,
    editingRow,
    editRoleIds,
    editName,
    assignableRoles,
    viewOpen,
    viewMember,
    permsLoading,
    viewRoles,
    viewIsPlatformAdmin,
    viewPermGroups,
    passwordOpen,
    savingPassword,
    passwordRow,
    passwordForm,
    passwordRules,
    openPassword,
    onSavePassword,
    openView,
    openEditRoles,
    onRemove,
    onSaveRoles,
    onAdd,
  };
}
