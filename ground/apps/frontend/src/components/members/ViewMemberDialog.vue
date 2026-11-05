<template>
  <el-dialog
    :model-value="modelValue"
    title="查看成员"
    width="640px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-descriptions v-if="member" :column="2" border>
      <el-descriptions-item label="姓名">
        {{ member.user.name }}
      </el-descriptions-item>
      <el-descriptions-item label="手机号">
        {{ member.user.phone || '-' }}
      </el-descriptions-item>
      <el-descriptions-item label="角色">
        {{ member.user.roles?.map((r) => r.role.name).join('、') || '-' }}
      </el-descriptions-item>
      <el-descriptions-item label="加入时间">
        {{ formatDateTime(member.createdAt) }}
      </el-descriptions-item>
    </el-descriptions>

    <div class="view-perms">
      <div class="view-perms-title">权限详情</div>
      <div v-if="permsLoading" class="muted">加载中…</div>
      <template v-else>
        <el-alert
          v-if="isPlatformAdmin"
          type="warning"
          :closable="false"
          title="平台管理员：拥有全部权限"
          class="view-perms-admin"
        />
        <div v-for="g in permGroups" :key="g.category" class="view-perm-group">
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
              <span v-if="permSourceLabel(item.key)" class="view-perm-source">
                {{ permSourceLabel(item.key) }}
              </span>
            </span>
          </div>
        </div>
        <div v-if="!isPlatformAdmin && permGroups.length === 0" class="muted">
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
import type { MemberRow, RolePermSource } from '@/api/tenants';
import type { PermissionCatalogGroup } from '@/api/console';
import { formatDateTime } from '@/utils/format';

const props = defineProps<{
  modelValue: boolean;
  member: MemberRow | null;
  permsLoading: boolean;
  isPlatformAdmin: boolean;
  permGroups: PermissionCatalogGroup[];
  roles: RolePermSource[];
}>();

defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
}>();

function permSourceLabel(key: string) {
  const names = props.roles.filter((r) => r.permKeys.includes(key)).map((r) => r.name);
  return names.length ? names.join('、') : '';
}

function permChipTitle(item: { key: string; labelEn?: string }) {
  const src = permSourceLabel(item.key);
  return src ? `${item.labelEn || item.key} · 来自：${src}` : (item.labelEn || item.key);
}
</script>

<style scoped>
.view-perms {
  margin-top: 14px;
}

.view-perms-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d2939;
  margin-bottom: 10px;
}

.view-perms-admin {
  margin-bottom: 10px;
}

.view-perm-group {
  padding: 10px 12px;
  border: 1px solid #eef0f4;
  border-radius: 0;
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
  color: var(--app-primary-color);
  font-size: 12px;
  line-height: 20px;
  border: 1px solid #dbe7ff;
}

.view-perm-source {
  color: #667085;
  font-size: 11px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: #98a2b3;
  font-size: 13px;
}
</style>
