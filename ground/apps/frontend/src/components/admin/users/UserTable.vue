<template>
  <div>
    <el-alert
      v-if="loadError"
      class="page-alert"
      type="error"
      show-icon
      :closable="false"
      :title="loadError"
    >
      <template #default>
        <el-button text type="primary" @click="$emit('retry')">
          重试
        </el-button>
      </template>
    </el-alert>

    <el-table
      v-loading="loading"
      :data="rows"
      border
      class="user-table"
      header-cell-class-name="user-table-header"
    >
      <el-table-column label="用户名/姓名" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.name }}
        </template>
      </el-table-column>
      <el-table-column prop="phone" label="手机号" width="120" />
      <el-table-column label="角色" min-width="180">
        <template #default="{ row }">
          <div class="role-tags">
            <el-tag
              v-for="tag in roleTags(row)"
              :key="tag.label"
              class="identity-tag"
              size="small"
              :style="roleTagStyle(tag.color)"
            >
              <span class="visual-dot" :style="{ backgroundColor: tag.color }" />
              {{ tag.label }}
            </el-tag>
            <span v-if="roleTags(row).length === 0" class="muted">普通用户</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="所属企业" min-width="220">
        <template #default="{ row }">
          <span v-if="row.tenants.length === 0" class="muted">-</span>
          <span
            v-for="tenant in row.tenants"
            :key="tenant.id"
            class="subject-label"
          >
            <span class="visual-dot" :style="{ backgroundColor: tenantColor(tenant.id) }" />
            <span>{{ tenant.name }}</span>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="账号状态" width="100">
        <template #default="{ row }">
          <el-tooltip
            v-if="row.blockedByTenant"
            content="所属企业已停用，请先在企业管理中启用该企业"
            placement="top"
          >
            <el-tag size="small" type="info">停用</el-tag>
          </el-tooltip>
          <el-tag v-else size="small" :type="row.status === 'active' ? 'success' : 'info'">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="330" fixed="right" align="center">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="$emit('view', row)">
              查看
            </el-button>
            <el-button text type="primary" @click="$emit('edit', row)">
              编辑
            </el-button>
            <el-button
              v-if="canChangePassword(row, actorIsSuperAdmin)"
              text
              type="primary"
              @click="$emit('change-password', row)"
            >
              修改密码
            </el-button>
            <el-button
              v-if="row.status === 'active' && !row.blockedByTenant && !isSuperAdminRow(row)"
              text
              type="warning"
              :disabled="row.id === currentUserId"
              :loading="statusChangingId === row.id"
              @click="$emit('deactivate', row)"
            >
              停用
            </el-button>
            <el-button
              v-if="row.status !== 'active' && !row.blockedByTenant && !isSuperAdminRow(row)"
              text
              type="success"
              :loading="statusChangingId === row.id"
              @click="$emit('activate', row)"
            >
              启用
            </el-button>
            <el-button
              v-if="canDeleteUser(row)"
              text
              type="danger"
              :loading="deletingId === row.id"
              @click="$emit('delete', row)"
            >
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="emptyText">
          <el-button v-if="!hasActiveFilters" type="primary" @click="$emit('create')">
            新建用户
          </el-button>
        </el-empty>
      </template>
    </el-table>

    <div class="user-pagination">
      <el-pagination
        :current-page="currentPage"
        :page-size="pageSize"
        background
        layout="total, sizes, prev, pager, next, jumper"
        :page-sizes="[10, 20, 50]"
        :total="total"
        @current-change="$emit('page-change', $event)"
        @size-change="$emit('page-size-change', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AdminUserRow } from '@/api/admin';
import {
  canChangePassword,
  canDeleteUser,
  isSuperAdminRow,
  roleTagStyle,
  roleTags,
  statusLabel,
  tenantColor,
} from './userDisplay';

defineProps<{
  rows: AdminUserRow[];
  loading: boolean;
  loadError: string;
  emptyText: string;
  hasActiveFilters: boolean;
  currentPage: number;
  pageSize: number;
  total: number;
  currentUserId: string;
  actorIsSuperAdmin: boolean;
  statusChangingId: string;
  deletingId: string;
}>();

defineEmits<{
  retry: [];
  view: [row: AdminUserRow];
  edit: [row: AdminUserRow];
  'change-password': [row: AdminUserRow];
  activate: [row: AdminUserRow];
  deactivate: [row: AdminUserRow];
  delete: [row: AdminUserRow];
  create: [];
  'page-change': [page: number];
  'page-size-change': [size: number];
}>();
</script>

<style scoped>
.page-alert {
  margin-bottom: 12px;
}

.user-table {
  margin-top: 20px;
  width: 100%;
}

.muted {
  color: #98a2b3;
}

.subject-label,
.identity-tag {
  align-items: center;
  display: inline-flex;
  gap: 7px;
}

.role-tags {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.subject-label + .subject-label {
  margin-left: 10px;
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

.user-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

:deep(.user-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}
</style>
