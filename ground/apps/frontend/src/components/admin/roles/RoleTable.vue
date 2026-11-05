<template>
  <div>
    <el-table
      :data="rows"
      border
      class="role-table"
      header-cell-class-name="role-table-header"
    >
      <el-table-column label="角色" min-width="150">
        <template #default="{ row }">
          <el-tag class="identity-tag" size="small" :style="roleTagStyle(row.key)">
            <span class="visual-dot" :style="{ backgroundColor: roleColor(row.key) }" />
            {{ row.name }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="110" align="center">
        <template #default="{ row }">
          <el-tag
            size="small"
            effect="light"
            :type="row.builtIn ? 'info' : 'primary'"
          >
            {{ row.builtIn ? '系统内置' : '自定义' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="key" label="Key" width="150" show-overflow-tooltip />
      <el-table-column label="范围" width="110">
        <template #default="{ row }">
          {{ scopeLabel(row.scope) }}
        </template>
      </el-table-column>
      <el-table-column v-if="showTenantColumn" label="所属企业" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.tenant" class="subject-label" :style="{ color: tenantColor(row.tenant.id) }">
            <span class="visual-dot" :style="{ backgroundColor: tenantColor(row.tenant.id) }" />
            <span>{{ row.tenant.name }}</span>
          </span>
          <span v-else class="muted-dash">-</span>
        </template>
      </el-table-column>
      <el-table-column label="权限数" width="90" align="center">
        <template #default="{ row }">
          {{ row.permissions.length }}
        </template>
      </el-table-column>
      <el-table-column prop="description" label="说明" min-width="300" show-overflow-tooltip />
      <el-table-column label="操作" width="210" fixed="right" align="center">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="$emit('view', row)">
              查看
            </el-button>
            <el-tooltip :content="editHint(row)" placement="top" :disabled="!editHint(row)">
              <span>
                <el-button text type="primary" :disabled="!canEditRow(row)" @click="$emit('edit', row)">
                  编辑
                </el-button>
              </span>
            </el-tooltip>
            <el-tooltip :content="deleteHint(row)" placement="top" :disabled="!deleteHint(row)">
              <span>
                <el-button
                  text
                  type="danger"
                  :disabled="!canDeleteRow(row)"
                  @click="$emit('delete', row)"
                >
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

    <div class="role-pagination">
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
import type { RoleRow } from './roleTypes';
import {
  isBuiltinRoleRow,
  roleColor,
  roleTagStyle,
  scopeLabel,
  tenantColor,
} from './roleDisplay';

const props = defineProps<{
  rows: RoleRow[];
  loading?: boolean;
  showTenantColumn: boolean;
  canWrite: boolean;
  canDeleteRoles: boolean;
  currentPage: number;
  pageSize: number;
  total: number;
  emptyText: string;
}>();

defineEmits<{
  view: [row: RoleRow];
  edit: [row: RoleRow];
  delete: [row: RoleRow];
  'page-change': [page: number];
  'page-size-change': [size: number];
}>();

function canEditRow(row: RoleRow) {
  if (!props.canWrite) return false;
  // 仅 super_admin 禁用编辑；其余平台/企业预设角色放开
  if (row.key === 'super_admin') return false;
  return true;
}

function editHint(row: RoleRow) {
  if (!props.canWrite) return '仅超级管理员、平台管理员或持有 portal.admin.roles.write 可编辑';
  if (row.key === 'super_admin') return '超级管理员角色不可编辑';
  return '';
}

function canDeleteRow(row: RoleRow) {
  if (!props.canDeleteRoles) return false;
  if (isBuiltinRoleRow(row)) return false;
  return row.userCount === 0;
}

function deleteHint(row: RoleRow) {
  if (!props.canDeleteRoles) return '仅超级管理员、平台管理员可删除角色';
  if (isBuiltinRoleRow(row)) return '系统内置角色不可删除';
  if (row.userCount > 0) return `还有 ${row.userCount} 个用户使用该角色，禁止删除`;
  return '';
}
</script>

<style scoped>
.subject-label {
  align-items: center;
  display: inline-flex;
  font-weight: 600;
  gap: 7px;
}

.muted-dash {
  color: #94a3b8;
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
</style>
