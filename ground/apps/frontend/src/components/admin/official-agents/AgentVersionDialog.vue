<template>
  <el-dialog
    :model-value="modelValue"
    title="发布记录"
    width="900px"
    destroy-on-close
    class="official-agent-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p v-if="agent" class="publish-records-summary">
      {{ agent.draft.name }}（{{ agent.key }}）
    </p>
    <el-table
      v-loading="loading"
      :data="versions"
      border
      empty-text="暂无成功发布记录"
    >
      <el-table-column label="版本" width="90">
        <template #default="{ row }">v{{ row.version }}</template>
      </el-table-column>
      <el-table-column label="发布时间" min-width="170">
        <template #default="{ row }">{{ formatDate(row.publishedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作人" min-width="140">
        <template #default="{ row }">
          {{ row.publishedByName || (row.publishedByUserId ? '账号已不可用' : '历史未知') }}
        </template>
      </el-table-column>
      <el-table-column label="发布依赖与回滚" min-width="190"><template #default="{row}"><el-tag v-if="agent?.onlineVersion?.id===row.id" type="success">当前在线</el-tag><el-button v-if="canAuthor" text :disabled="agent?.onlineVersion?.id===row.id || !!rollbackId" @click="emit('rollback', row)">回滚到此版本</el-button><el-collapse><el-collapse-item title="冻结依赖"><pre class="viewer-prompt">{{JSON.stringify(row.executionConfig || {route:'LEGACY'},null,2)}}</pre><pre class="viewer-prompt">{{JSON.stringify(row.linkedSkillSummaries || [],null,2)}}</pre></el-collapse-item></el-collapse></template></el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { OfficialAgentRow, OfficialAgentVersion } from '../../../api/admin';
import { formatDate } from './agent-display';

defineProps<{
  modelValue: boolean;
  agent: OfficialAgentRow | null;
  versions: OfficialAgentVersion[];
  loading: boolean;
  canAuthor: boolean;
  rollbackId: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  rollback: [version: OfficialAgentVersion];
}>();
</script>

<style scoped>
.publish-records-summary {
  margin: 0 0 12px;
  color: #667085;
  font-size: 13px;
}

.viewer-prompt {
  background: #f8fafc;
  color: #333946;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  max-height: 240px;
  overflow: auto;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

<style>
.official-agent-dialog {
  border-radius: 0;
  max-width: calc(100vw - 32px);
}

.official-agent-dialog .el-dialog__header {
  border-bottom: 1px solid #dfe5ef;
  margin-right: 0;
  padding: 18px 24px;
}

.official-agent-dialog .el-dialog__body {
  color: #333946;
  font-size: 13px;
  padding: 22px 24px;
}

.official-agent-dialog .el-dialog__footer {
  border-top: 1px solid #dfe5ef;
  padding: 14px 24px;
}

@media (max-width: 768px) {
  .official-agent-dialog {
    width: calc(100vw - 32px) !important;
  }
}

.el-dialog.official-agent-dialog { border-radius: 10px; }
</style>
