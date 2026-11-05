<template>
  <div>
    <el-table
      v-loading="loading"
      :data="rows"
      border
      class="members-table"
      header-cell-class-name="members-table-header"
    >
      <el-table-column label="姓名" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.user.name }}
        </template>
      </el-table-column>
      <el-table-column label="手机号" min-width="140">
        <template #default="{ row }">
          {{ row.user.phone }}
        </template>
      </el-table-column>
      <el-table-column label="角色" min-width="160">
        <template #default="{ row }">
          <div class="role-tags">
            <el-tag
              v-for="role in memberRoles(row)"
              :key="role.label"
              class="identity-tag"
              size="small"
              :style="roleTagStyleByName(role.color)"
            >
              <span class="visual-dot" :style="{ backgroundColor: role.color }" />
              {{ role.label }}
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button link type="primary" @click="$emit('view', row)">查看</el-button>
            <el-tooltip content="需要企业管理员" placement="top" :disabled="isOrgAdminUser">
              <span>
                <el-button link type="primary" :disabled="!isOrgAdminUser" @click="$emit('edit-roles', row)">编辑角色</el-button>
              </span>
            </el-tooltip>
            <el-tooltip
              v-if="row.user.id !== currentUserId"
              content="需要企业管理员"
              placement="top"
              :disabled="isOrgAdminUser"
            >
              <span>
                <el-button link type="primary" :disabled="!isOrgAdminUser" @click="$emit('password', row)">
                  修改密码
                </el-button>
              </span>
            </el-tooltip>
            <el-tooltip
              v-if="row.user.id !== currentUserId"
              content="需要企业管理员"
              placement="top"
              :disabled="isOrgAdminUser"
            >
              <span>
                <el-button link type="danger" :disabled="!isOrgAdminUser" @click="$emit('remove', row)">
                  删除
                </el-button>
              </span>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="emptyText">
          <el-tooltip
            v-if="showEmptyAdd"
            content="需要企业管理员"
            placement="top"
            :disabled="isOrgAdminUser"
          >
            <span>
              <el-button type="primary" :disabled="!isOrgAdminUser" @click="$emit('create')">
                添加成员
              </el-button>
            </span>
          </el-tooltip>
        </el-empty>
      </template>
    </el-table>

    <div class="members-pagination">
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
import type { MemberRow } from '@/api/tenants';
import { memberRoles, roleTagStyleByName } from './memberDisplay';

defineProps<{
  loading: boolean;
  rows: MemberRow[];
  emptyText: string;
  showEmptyAdd: boolean;
  isOrgAdminUser: boolean;
  currentUserId?: string;
  currentPage: number;
  pageSize: number;
  total: number;
}>();

defineEmits<{
  (e: 'view', row: MemberRow): void;
  (e: 'edit-roles', row: MemberRow): void;
  (e: 'password', row: MemberRow): void;
  (e: 'remove', row: MemberRow): void;
  (e: 'create'): void;
  (e: 'page-change', page: number): void;
  (e: 'page-size-change', size: number): void;
}>();
</script>

<style scoped>
.members-table {
  margin-top: 20px;
  width: 100%;
}

.operation-buttons {
  align-items: center;
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  white-space: nowrap;
}

.operation-buttons :deep(.el-button + .el-button) {
  margin-left: 0;
}

.operation-buttons :deep(.el-button) {
  margin: 0;
}

.role-tags {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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

.members-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

:deep(.members-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

:deep(.el-table__body td),
:deep(.el-table__body .cell) {
  font-size: 13px;
}
</style>
