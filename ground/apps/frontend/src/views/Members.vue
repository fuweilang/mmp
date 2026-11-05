<template>
  <section class="members-page">
    <div class="members-toolbar">
      <div class="members-search-wrap">
        <el-input
          v-model="keywordDraft"
          class="members-search"
          clearable
          placeholder="搜索姓名 / 手机号"
          :prefix-icon="Search"
          @clear="onSearchNow"
          @input="onSearchInput"
          @keyup.enter="onSearchNow"
        />
        <el-select
          v-model="roleFilter"
          class="role-filter"
          clearable
          multiple
          collapse-tags
          placeholder="筛选角色"
        >
          <el-option
            v-for="role in assignableRoles"
            :key="role.id"
            :label="role.name"
            :value="role.id"
          />
        </el-select>
      </div>
      <el-button class="toolbar-button" @click="onSearchNow">搜索</el-button>
      <el-button class="toolbar-button" @click="onReset">重置</el-button>
      <div class="members-actions">
        <el-tooltip content="需要企业管理员" placement="top" :disabled="isOrgAdminUser">
          <span>
            <el-button type="primary" :disabled="!isOrgAdminUser || !hasTenant" @click="openCreate">添加成员</el-button>
          </span>
        </el-tooltip>
      </div>
    </div>

    <MemberTable
      :loading="loading"
      :rows="pagedRows"
      :empty-text="emptyText"
      :show-empty-add="showEmptyAdd"
      :is-org-admin-user="isOrgAdminUser"
      :current-user-id="auth.session?.user.id"
      :current-page="currentPage"
      :page-size="pageSize"
      :total="filteredRows.length"
      @view="openView"
      @edit-roles="openEditRoles"
      @password="openPassword"
      @remove="onRemove"
      @create="openCreate"
      @page-change="onPageChange"
      @page-size-change="onPageSizeChange"
    />

    <AddMemberDialog
      v-model="open"
      :form="form"
      :rules="rules"
      :assignable-roles="assignableRoles"
      :saving="saving"
      @close="resetForm"
      @submit="onAdd"
    />

    <EditMemberRolesDialog
      v-model="roleDialogOpen"
      :member-name="editingRow?.user.name ?? ''"
      v-model:edit-name="editName"
      v-model:edit-role-ids="editRoleIds"
      :assignable-roles="assignableRoles"
      :saving="savingRoles"
      @submit="onSaveRoles"
    />

    <MemberPasswordDialog
      v-model="passwordOpen"
      :member-name="passwordRow?.user.name ?? ''"
      :password-form="passwordForm"
      :password-rules="passwordRules"
      :saving="savingPassword"
      @submit="onSavePassword"
    />

    <ViewMemberDialog
      v-model="viewOpen"
      :member="viewMember"
      :perms-loading="permsLoading"
      :is-platform-admin="viewIsPlatformAdmin"
      :perm-groups="viewPermGroups"
      :roles="viewRoles"
    />
  </section>
</template>

<script setup lang="ts">
import MemberTable from '@/components/members/MemberTable.vue';
import AddMemberDialog from '@/components/members/AddMemberDialog.vue';
import EditMemberRolesDialog from '@/components/members/EditMemberRolesDialog.vue';
import MemberPasswordDialog from '@/components/members/MemberPasswordDialog.vue';
import ViewMemberDialog from '@/components/members/ViewMemberDialog.vue';
import { useMembersPage } from '@/components/members/useMembersPage';

const {
  Search,
  auth,
  hasTenant,
  isOrgAdminUser,
  loading,
  open,
  saving,
  keywordDraft,
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
} = useMembersPage();
</script>

<style scoped>
.role-edit-hint {
  color: #98a2b3;
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
}

.members-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.members-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  overflow-x: auto;
}

.members-search-wrap {
  align-items: center;
  display: flex;
  flex: 1 1 auto;
  gap: 10px;
  min-width: 0;
}

.members-search {
  width: 220px;
}

.role-filter {
  width: 140px;
}

.toolbar-button {
  flex: 0 0 auto;
  margin-left: 0;
}

.toolbar-button + .toolbar-button {
  margin-left: 0;
}

.members-actions {
  display: flex;
  flex: 0 0 auto;
  margin-left: auto;
}
</style>
