<template>
  <el-dialog
    :model-value="modelValue"
    title="发布记录"
    width="900px"
    destroy-on-close
    class="official-agent-dialog official-agent-versions"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="agent" class="publish-records-heading">
      <p class="publish-records-summary">{{ agent.draft.name }}（{{ agent.key }}）</p>
      <span class="publish-records-count">共 {{ versions.length }} 个版本</span>
    </div>
    <p class="publish-records-hint">回滚会用所选版本覆盖当前草稿。</p>
    <el-table
      v-loading="loading"
      :data="versions"
      row-key="id"
      border
      class="version-table"
      empty-text="暂无成功发布记录"
    >
      <el-table-column type="expand" width="40" align="center">
        <template #default="{ row }">
          <div class="version-expand">
            <div class="version-expand-head">
              <span class="version-expand-title">冻结依赖 · v{{ row.version }}</span>
              <span v-if="agent?.onlineVersion?.id === row.id" class="version-expand-hint">当前在线版本</span>
            </div>

            <template v-if="row.executionConfig">
              <el-descriptions :column="2" border size="small" class="version-expand-descriptions">
                <el-descriptions-item label="执行路由">
                  {{ routeLabel(row.executionConfig.route) }}
                </el-descriptions-item>
                <template v-if="row.executionConfig.route === 'KNOWLEDGE_CORE'">
                  <el-descriptions-item label="检索策略">
                    {{ retrievalLabel(row.executionConfig.retrievalPolicy) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="Token 预算">
                    {{ formatBudget(row.executionConfig.budgetTokens) }}
                  </el-descriptions-item>
                  <el-descriptions-item label="生成模型">
                    <span :title="modelTitle(row.executionConfig.generationModel)">
                      {{ modelLabel(row.executionConfig.generationModel) }}
                    </span>
                  </el-descriptions-item>
                  <el-descriptions-item label="重排配置" :span="2">
                    {{ row.executionConfig.rerankProfileId || '未启用' }}
                  </el-descriptions-item>
                  <el-descriptions-item label="知识库发布" :span="2">
                    <div v-if="row.executionConfig.releaseIds?.length" class="version-expand-chips">
                      <el-tag
                        v-for="id in row.executionConfig.releaseIds"
                        :key="id"
                        size="small"
                        type="info"
                        effect="plain"
                        :title="id"
                      >{{ id }}</el-tag>
                    </div>
                    <span v-else class="muted">未绑定知识库</span>
                  </el-descriptions-item>
                </template>
                <el-descriptions-item v-else label="知识库" :span="2">
                  <span class="muted">旧版直连路径，不绑定知识库 release</span>
                </el-descriptions-item>
              </el-descriptions>
            </template>
            <el-alert
              v-else
              type="info"
              :closable="false"
              show-icon
              title="该版本未记录执行配置（历史版本）"
            />

            <div class="version-expand-section-title">分类与标签</div>
            <template v-if="row.kind">
              <el-descriptions :column="2" border size="small" class="version-expand-descriptions">
                <el-descriptions-item label="分类">
                  {{ categoryLabel(row.category) }}
                </el-descriptions-item>
                <el-descriptions-item label="专家类型">
                  {{ kindLabel(row.kind) }}
                </el-descriptions-item>
                <el-descriptions-item label="能力标签" :span="2">
                  <div v-if="row.capabilities?.length" class="version-expand-chips">
                    <el-tag
                      v-for="tag in row.capabilities"
                      :key="tag"
                      size="small"
                      type="info"
                      effect="plain"
                    >{{ tag }}</el-tag>
                  </div>
                  <span v-else class="muted">无</span>
                </el-descriptions-item>
              </el-descriptions>
            </template>
            <span v-else class="muted">该历史版本未记录分类与能力标签，回滚不会恢复它们。</span>

            <div class="version-expand-section-title">技能</div>
            <ul v-if="row.linkedSkillSummaries?.length" class="version-expand-skills">
              <li v-for="skill in row.linkedSkillSummaries" :key="skill.id">
                <span class="version-expand-skill-name">{{ skill.name }}</span>
                <span class="skill-rev">r{{ skill.packageRevision }}</span>
                <el-tag v-if="!skill.enabledAt" size="small" type="info" effect="plain">已停用</el-tag>
              </li>
            </ul>
            <span v-else class="muted">发布时未关联技能</span>

            <el-collapse class="version-expand-raw">
              <el-collapse-item title="原始 JSON" name="raw">
                <pre class="dep-json">{{ jsonOf(row.executionConfig) }}</pre>
                <pre class="dep-json">{{ jsonOf(row.linkedSkillSummaries || []) }}</pre>
              </el-collapse-item>
            </el-collapse>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="版本" width="84" align="center">
        <template #default="{ row }">
          <span class="version-number">v{{ row.version }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="104" align="center">
        <template #default="{ row }">
          <el-tag v-if="agent?.onlineVersion?.id === row.id" type="success" size="small">当前在线</el-tag>
          <span v-else class="muted">历史</span>
        </template>
      </el-table-column>
      <el-table-column label="发布时间" min-width="168">
        <template #default="{ row }">{{ formatDate(row.publishedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作人" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.publishedByName || (row.publishedByUserId ? '账号已不可用' : '历史未知') }}
        </template>
      </el-table-column>
      <el-table-column v-if="canAuthor" label="操作" width="132" align="right">
        <template #default="{ row }">
          <el-button
            link
            type="primary"
            :loading="rollbackId === row.id"
            :disabled="agent?.onlineVersion?.id === row.id || (!!rollbackId && rollbackId !== row.id)"
            @click="emit('rollback', row)"
          >
            回滚到此版本
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { OfficialAgentRow, OfficialAgentVersion } from '../../../api/admin';
import { formatDate } from './agent-display';

const props = defineProps<{
  modelValue: boolean;
  agent: OfficialAgentRow | null;
  versions: OfficialAgentVersion[];
  loading: boolean;
  canAuthor: boolean;
  rollbackId: string;
  categoryOptions?: Array<{ value: string; label: string }>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  rollback: [version: OfficialAgentVersion];
}>();

const ROUTE_LABELS: Record<string, string> = {
  LEGACY: '直连模型（旧版）',
  KNOWLEDGE_CORE: '平台知识库',
};
const RETRIEVAL_LABELS: Record<string, string> = {
  REQUIRED: '必须检索资料',
  AUTO: '自动判断',
  OFF: '关闭检索',
};

function routeLabel(value?: string) {
  return ROUTE_LABELS[value ?? 'LEGACY'] ?? value ?? '未记录';
}

function retrievalLabel(value?: string) {
  return RETRIEVAL_LABELS[value ?? 'OFF'] ?? value ?? '未记录';
}

function modelLabel(value?: { mode: string; modelId?: string }) {
  if (!value || value.mode === 'AUTO') return '自动选择';
  return '指定模型';
}

function modelTitle(value?: { mode: string; modelId?: string }) {
  return value?.mode === 'FIXED' ? value.modelId : undefined;
}

function categoryLabel(value?: string | null) {
  if (!value) return '未分类';
  return props.categoryOptions?.find(item => item.value === value)?.label ?? value;
}

function kindLabel(value: string) {
  return value === 'KNOWLEDGE' ? '知识型专家' : '通用专家';
}

function formatBudget(value?: number) {
  return Number.isFinite(value) ? `${value!.toLocaleString('zh-CN')} tokens` : '—';
}

function jsonOf(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}
</script>

<style scoped>
.publish-records-heading {
  align-items: baseline;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 4px;
}

.publish-records-summary {
  color: #333946;
  font-size: 13px;
  font-weight: 600;
  margin: 0;
}

.publish-records-count {
  color: #98a2b3;
  font-size: 12px;
}

.publish-records-hint {
  color: #98a2b3;
  font-size: 12px;
  margin: 0 0 12px;
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

.el-dialog.official-agent-dialog {
  border-radius: 10px;
}

.el-dialog.official-agent-versions {
  display: flex;
  flex-direction: column;
  margin: 48px auto !important;
  max-height: calc(100dvh - 96px);
}

.official-agent-versions .el-dialog__header,
.official-agent-versions .el-dialog__footer {
  flex-shrink: 0;
}

.official-agent-versions .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.official-agent-versions .version-number {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.official-agent-versions .muted {
  color: #98a2b3;
}

.official-agent-versions .version-table {
  width: 100%;
}

.official-agent-versions .el-table__expanded-cell {
  background: #fff;
  padding: 0 !important;
}

.official-agent-versions .el-table__expanded-cell:hover {
  background: #fff !important;
}

.official-agent-versions .version-expand {
  background: #fafbfd;
  border-top: 1px solid #eef0f4;
  padding: 14px 18px 16px;
}

.official-agent-versions .version-expand-head {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 12px;
}

.official-agent-versions .version-expand-title {
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

.official-agent-versions .version-expand-hint {
  color: #667085;
  font-size: 12px;
}

.official-agent-versions .version-expand-descriptions {
  margin-bottom: 4px;
}

.official-agent-versions .version-expand-descriptions .el-descriptions__label {
  color: #667085;
  font-weight: 400;
  width: 96px;
}

.official-agent-versions .version-expand-section-title {
  color: #333946;
  font-size: 13px;
  font-weight: 600;
  margin: 16px 0 8px;
}

.official-agent-versions .version-expand-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.official-agent-versions .version-expand-chips .el-tag {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  max-width: 100%;
}

.official-agent-versions .version-expand-skills {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  list-style: none;
  margin: 0;
  padding: 0;
}

.official-agent-versions .version-expand-skills li {
  align-items: center;
  background: #fff;
  border: 1px solid #eef0f4;
  border-radius: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
}

.official-agent-versions .version-expand-skill-name {
  font-weight: 600;
}

.official-agent-versions .skill-rev {
  color: #98a2b3;
  font-size: 12px;
}

.official-agent-versions .version-expand-raw {
  border-top: 1px solid #eef0f4;
  margin-top: 16px;
}

.official-agent-versions .version-expand-raw .el-collapse-item__header {
  background: transparent;
  font-size: 13px;
}

.official-agent-versions .version-expand-raw .el-collapse-item__wrap {
  background: transparent;
}

.official-agent-versions .dep-json {
  background: #f8fafc;
  border: 1px solid #eef0f4;
  border-radius: 6px;
  color: #333946;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  margin: 0 0 10px;
  max-height: 200px;
  overflow: auto;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 768px) {
  .official-agent-dialog {
    width: calc(100vw - 32px) !important;
  }

  .official-agent-versions .version-expand {
    padding: 12px 12px 14px;
  }

  .official-agent-versions .version-expand-skills {
    grid-template-columns: minmax(0, 1fr);
  }

  .official-agent-versions .version-expand-descriptions .el-descriptions__label {
    width: 84px !important;
  }
}
</style>
