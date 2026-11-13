<template>
  <el-drawer
    :model-value="modelValue"
    title="官方专家运营审计"
    class="official-agent-audit"
    size="min(100vw, max(640px, 52vw))"
    @update:model-value="emit('update:modelValue', $event)"
    @closed="expandedAuditId = ''"
  >
    <template #header="{ titleId, titleClass }">
      <div class="audit-drawer-heading">
        <h2 :id="titleId" :class="titleClass">官方专家运营审计</h2>
        <div class="audit-drawer-toolbar">
          <el-button size="small" :loading="loading" @click="emit('refresh')">刷新</el-button>
          <el-button size="small" link type="primary" @click="emit('full-audit')">完整操作审计 ↗</el-button>
        </div>
      </div>
    </template>
    <el-table
      v-loading="loading"
      :data="rows"
      :expand-row-keys="expandedAuditId ? [expandedAuditId] : []"
      row-key="id"
      size="small"
    >
      <el-table-column label="时间" width="145">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" min-width="145">
        <template #default="{ row }">{{ auditActionLabel(row.action) }}</template>
      </el-table-column>
      <el-table-column label="操作者" min-width="90" show-overflow-tooltip>
        <template #default="{ row }">{{ row.actorName }}</template>
      </el-table-column>
      <el-table-column label="企业" min-width="80" show-overflow-tooltip>
        <template #default="{ row }">{{ row.enterpriseName }}</template>
      </el-table-column>
      <el-table-column label="详情" width="86" align="center">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            :aria-expanded="expandedAuditId === row.id"
            @click="expandedAuditId = expandedAuditId === row.id ? '' : row.id"
          >
            {{ expandedAuditId === row.id ? '收起详情' : '查看详情' }}
          </el-button>
        </template>
      </el-table-column>
      <el-table-column type="expand" :width="1" class-name="audit-expand-control">
        <template #default="{ row }">
          <div class="audit-details">
            <dl class="audit-fields">
              <div v-for="field in auditMetaFields(row.meta)" :key="field.label">
                <dt>{{ field.label }}</dt>
                <dd>{{ field.value }}</dd>
              </div>
            </dl>
            <details>
              <summary>原始 JSON</summary>
              <pre class="meta-pre">{{ formatMeta(row.meta) }}</pre>
            </details>
          </div>
        </template>
      </el-table-column>
      <template #empty><el-empty description="暂无官方专家相关审计" /></template>
    </el-table>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { AuditActionLabel } from '@mammoth/shared';
import type { AdminAuditRow } from '../../../api/admin';
import { formatDate } from './agent-display';

defineProps<{
  modelValue: boolean;
  rows: AdminAuditRow[];
  loading: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  refresh: [];
  'full-audit': [];
}>();

const expandedAuditId = ref('');

const auditFieldLabels = {
  key: '专家标识',
  agentId: '专家 ID',
  version: '版本',
  versionId: '版本 ID',
  requestedCount: '请求数量',
  created: '新建数',
  updated: '更新数',
  filled: '补全数',
  offlined: '下架数',
  granted: '授权数',
  reactivated: '重新开通数',
  upgraded: '升级数',
  revoked: '撤销数',
  skipped: '跳过数',
  errors: '失败数',
};

function auditMetaFields(meta: unknown) {
  if (!meta || typeof meta !== 'object') return [];
  const values = meta as Record<string, unknown>;
  return Object.entries(auditFieldLabels).flatMap(([key, label]) => {
    const value = values[key];
    return typeof value === 'string' || typeof value === 'number' ? [{ label, value }] : [];
  });
}

function formatMeta(meta: unknown) {
  try {
    return JSON.stringify(meta ?? {}, null, 2);
  } catch {
    return String(meta);
  }
}

function auditActionLabel(action: string) {
  return AuditActionLabel[action] || action;
}
</script>

<style scoped>
.audit-drawer-heading,
.audit-drawer-toolbar {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.audit-drawer-heading {
  flex: 1;
  justify-content: space-between;
}

.audit-drawer-heading h2 {
  color: #333946;
  font-weight: 600;
  margin: 0;
}

.audit-drawer-toolbar .el-button + .el-button {
  margin-left: 0;
}

:deep(.audit-expand-control .el-table__expand-icon) {
  display: none;
}

.audit-details {
  background: #f8fafc;
  padding: 12px 16px;
}

.audit-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin: 0;
}

.audit-fields > div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.audit-fields dt {
  color: #667085;
}

.audit-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.audit-fields:not(:empty) + details {
  margin-top: 8px;
}

.audit-details summary {
  color: var(--el-color-primary);
  cursor: pointer;
}

.meta-pre {
  background: #f8fafc;
  color: #333946;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  margin: 0;
  max-height: 140px;
  overflow: auto;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

<style>
.official-agent-audit .el-drawer__header {
  border-bottom: 1px solid #e4e7ed;
  gap: 12px;
  margin-bottom: 0;
  padding: 16px;
}

.official-agent-audit .el-drawer__body {
  padding: 12px 16px 16px;
}
</style>
