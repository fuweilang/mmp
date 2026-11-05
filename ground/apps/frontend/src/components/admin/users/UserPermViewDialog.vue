<template>
  <el-dialog
    :model-value="modelValue"
    title="查看用户"
    class="user-dialog user-view-dialog"
    width="640px"
    align-center
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-descriptions v-if="viewingRow" :column="2" border>
      <el-descriptions-item label="姓名">
        {{ viewingRow.name }}
      </el-descriptions-item>
      <el-descriptions-item label="手机号">
        {{ viewingRow.phone }}
      </el-descriptions-item>
      <el-descriptions-item label="角色">
        {{ roleLabel(viewingRow) }}
      </el-descriptions-item>
      <el-descriptions-item label="所属企业">
        <span v-if="viewingRow.tenants.length === 0" class="muted">-</span>
        <span v-else>{{ viewingRow.tenants.map((t) => t.name).join('、') }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="账号状态">
        {{ viewingRow.blockedByTenant ? '停用（所属企业已停用）' : statusLabel(viewingRow.status) }}
      </el-descriptions-item>
      <el-descriptions-item label="创建时间">
        {{ formatDateTime(viewingRow.createdAt) }}
      </el-descriptions-item>
    </el-descriptions>

    <div class="view-perms">
      <div class="view-perms-title-row">
        <div class="view-perms-title">权限详情</div>
        <el-select
          v-if="tenantOptions.length > 1"
          :model-value="selectedTenantId"
          placeholder="选择企业"
          size="small"
          style="width: 200px"
          @change="onTenantChange"
        >
          <el-option
            v-for="t in tenantOptions"
            :key="t.id"
            :label="t.name"
            :value="t.id"
          />
        </el-select>
      </div>
      <div v-if="permsLoading" class="muted">加载中…</div>
      <template v-else>
        <el-alert
          v-if="viewIsPlatformAdmin"
          type="warning"
          :closable="false"
          title="平台管理员：拥有全部权限"
          class="view-perms-admin"
        />
        <div v-for="g in viewPermGroups" :key="g.category" class="view-perm-group">
          <div class="view-perm-group-title">
            {{ g.labelZh }}
            <span class="view-perm-count">{{ g.items.length }}</span>
          </div>
          <div class="view-perm-chips">
            <span
              v-for="item in g.items"
              :key="item.key"
              class="view-perm-chip"
              :title="permChipTitle(item)"
            >
              <span>{{ item.labelZh }}</span>
              <span v-if="sourceLabel(item.key)" class="view-perm-source">
                {{ sourceLabel(item.key) }}
              </span>
            </span>
          </div>
        </div>
        <div v-if="!viewIsPlatformAdmin && viewPermGroups.length === 0" class="muted">
          暂无权限
        </div>
      </template>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AdminUserRow, PermissionCatalogGroup, RolePermSource } from '@/api/admin';
import { formatDateTime } from '@/utils/format';
import { roleLabel, statusLabel } from './userDisplay';

const props = defineProps<{
  modelValue: boolean;
  viewingRow: AdminUserRow | null;
  permsLoading: boolean;
  viewIsPlatformAdmin: boolean;
  viewPermGroups: PermissionCatalogGroup[];
  viewRoles?: RolePermSource[];
  tenantOptions?: Array<{ id: string; name: string }>;
  selectedTenantId?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  'update:selectedTenantId': [v: string];
}>();

const tenantOptions = computed(() => props.tenantOptions ?? []);

function onTenantChange(v: string) {
  emit('update:selectedTenantId', v);
}

function sourceLabel(key: string) {
  const roles = props.viewRoles ?? [];
  const names = roles.filter((r) => r.permKeys.includes(key)).map((r) => r.name);
  return names.length ? names.join('、') : '';
}

function permChipTitle(item: { key: string; labelEn?: string }) {
  const src = sourceLabel(item.key);
  return src ? `${item.labelEn || item.key} · 来自：${src}` : (item.labelEn || item.key);
}
</script>

<style>
/* 弹窗统一风格：方角、细分隔线、13px 正文 */
.user-dialog {
  border-radius: 0;
  max-width: calc(100vw - 32px);
}

/* 查看用户：水平垂直居中，上下与视口留白，过高时 body 内滚动 */
.user-view-dialog {
  display: flex;
  flex-direction: column;
  margin: auto !important;
  max-height: calc(100vh - 64px);
  padding: 0;
}

.user-view-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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

/* 查看用户：权限详情 */
.view-perms {
  margin-top: 14px;
}

.view-perms-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.view-perms-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d2939;
}

.view-perms-admin {
  margin-bottom: 10px;
}

.view-perm-group {
  padding: 10px 12px;
  border: 1px solid #eef0f4;
  border-radius: 8px;
  margin-bottom: 8px;
  background: #fbfcfe;
}

.view-perm-group-title {
  font-size: 12px;
  font-weight: 600;
  color: #333946;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.view-perm-count {
  font-weight: 400;
  color: #98a2b3;
}

.view-perm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.view-perm-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  background: #EEF0F8;
  color: #4A53A3;
  font-size: 12px;
  line-height: 20px;
  border: 1px solid #dbe7ff;
}

.view-perm-source {
  color: #667085;
  font-size: 11px;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
