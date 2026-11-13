<template>
  <el-dialog
    :model-value="modelValue"
    title="查看官方专家"
    width="760px"
    class="official-agent-dialog official-agent-viewer"
    align-center
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-loading="loading">
    <template v-if="agent">
      <div class="viewer-hero">
        <div class="agent-avatar agent-avatar-lg" aria-hidden="true">
          <img
            v-if="agent.avatarUrl && !isAvatarBroken(agent)"
            :src="agent.avatarUrl"
            :alt="agent.draft.name"
            @error="onAvatarError(agent)"
          />
          <UserRound v-else :size="22" aria-hidden="true" />
        </div>
        <div class="viewer-hero-text">
          <div class="agent-name">{{ display.name }}</div>
          <div class="agent-key">{{ agent.key }}</div>
          <div class="viewer-meta">
            <el-tag size="small" effect="plain" :type="agent.kind === 'KNOWLEDGE' ? 'warning' : 'primary'">
              {{ kindLabel(agent.kind) }}
            </el-tag>
            <el-tag size="small" :type="statusType(agent.status)">
              {{ statusLabel(agent.status) }}
            </el-tag>
          </div>
        </div>
      </div>

      <el-alert
        class="viewer-source-tip"
        type="info"
        :closable="false"
        title="只读查看当前已保存草稿内容（不是线上版本）；本弹窗不会改动任何配置。"
      />
      <el-alert
        v-if="agent.hasUnpublishedChanges"
        class="viewer-source-tip"
        type="warning"
        :closable="false"
        title="存在未发布修改（含头像 / 主配置 / 专家介绍）。"
      />

      <div class="form-section-title">基本信息</div>
      <el-descriptions :column="1" border class="viewer-descriptions" size="small">
        <el-descriptions-item label="专家名称">{{ display.name || '未填写' }}</el-descriptions-item>
        <el-descriptions-item label="一句话介绍">{{ display.summary || '未填写' }}</el-descriptions-item>
        <el-descriptions-item label="分类">{{ categoryLabel(agent.category) }}</el-descriptions-item>
        <el-descriptions-item label="能力标签">
          <div v-if="capabilityLabels.length" class="viewer-chip-row">
            <el-tag v-for="label in capabilityLabels" :key="label" size="small" effect="plain">{{ label }}</el-tag>
          </div>
          <span v-else class="muted">未填写</span>
        </el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(agent.status) }}</el-descriptions-item>
      </el-descriptions>

      <div class="form-section-title">执行配置</div>
      <el-descriptions :column="1" border class="viewer-descriptions" size="small">
        <el-descriptions-item label="类型">{{ kindLabel(agent.kind) }}</el-descriptions-item>
        <el-descriptions-item label="角色定位">{{ definition.profile?.role || '未填写' }}</el-descriptions-item>
        <el-descriptions-item label="流程">
          <ol v-if="definition.workflow?.length"><li v-for="step in definition.workflow" :key="step">{{ step }}</li></ol>
          <span v-else class="muted">未填写</span>
        </el-descriptions-item>
        <el-descriptions-item label="交付标准">
          <ul v-if="definition.deliverables?.length"><li v-for="item in definition.deliverables" :key="item">{{ item }}</li></ul>
          <span v-else class="muted">未填写</span>
        </el-descriptions-item>
        <el-descriptions-item label="专家指令（仅管理员）">
          <pre class="viewer-prompt">{{ display.systemPrompt || '未填写' }}</pre>
        </el-descriptions-item>
        <el-descriptions-item label="可用工具">
          <div v-if="display.toolScope.length" class="viewer-chip-row">
            <el-tag v-for="tool in display.toolScope" :key="tool" size="small" effect="plain" type="info">{{ toolScopeLabel(tool) }}</el-tag>
          </div>
          <span v-else class="muted">未声明工具（通用对话）</span>
        </el-descriptions-item>
        <el-descriptions-item label="执行与知识策略"><pre class="viewer-prompt">{{JSON.stringify(agent.draft.executionConfig || {route:'LEGACY'},null,2)}}</pre></el-descriptions-item>
        <el-descriptions-item label="关联技能">
          <ul v-if="agent.linkedSkills?.length" class="linked-skill-previews"><li v-for="skill in agent.linkedSkills" :key="skill.id"><strong>{{ skill.name }} · r{{ skill.packageRevision }}{{ skill.enabledAt ? '' : ' · 已停用' }}</strong><span>{{ skill.summary }}</span></li></ul>
          <span v-else class="muted">未关联技能</span>
        </el-descriptions-item>
      </el-descriptions>

      <div class="form-section-title">专家介绍</div>
      <el-descriptions :column="1" border class="viewer-descriptions" size="small">
        <el-descriptions-item label="详细说明">
          <div class="viewer-longtext">{{ discovery?.introduction || '未填写' }}</div>
        </el-descriptions-item>
        <el-descriptions-item label="推荐提问">
          <ol v-if="discovery?.starters?.length" class="viewer-questions">
            <li v-for="(starter, index) in discovery.starters" :key="index">{{ starter.text }}</li>
          </ol>
          <span v-else class="muted">未填写</span>
        </el-descriptions-item>
        <el-descriptions-item label="你能得到什么">
          <ul v-if="discovery?.outputs?.length"><li v-for="item in discovery.outputs" :key="item">{{ item }}</li></ul>
          <span v-else class="muted">未填写</span>
        </el-descriptions-item>
        <el-descriptions-item label="建议提供的信息">
          <ul v-if="discovery?.materials?.length"><li v-for="item in discovery.materials" :key="item">{{ item }}</li></ul>
          <span v-else class="muted">未填写</span>
        </el-descriptions-item>
        <el-descriptions-item label="不适合处理什么">
          <ul v-if="discovery?.boundaries?.length"><li v-for="item in discovery.boundaries" :key="item">{{ item }}</li></ul>
          <span v-else class="muted">未填写</span>
        </el-descriptions-item>
      </el-descriptions>

      <el-collapse>
        <el-collapse-item title="系统信息 / 来源许可" name="sys">
          <el-descriptions :column="1" border class="viewer-descriptions" size="small">
            <el-descriptions-item label="标识">{{ agent.key }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatDate(agent.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ formatDate(agent.updatedAt) }}</el-descriptions-item>
            <el-descriptions-item v-if="definition.source?.repository" label="来源 / 许可">
              {{ definition.source.repository }} · {{ definition.license?.spdx || '待确认' }}
              <div class="agent-key">{{ definition.source.ref }}</div>
            </el-descriptions-item>
            <el-descriptions-item v-if="definition.adaptation?.notes?.length" label="宿主适配">
              <ul><li v-for="note in definition.adaptation.notes" :key="note">{{ note }}</li></ul>
            </el-descriptions-item>
          </el-descriptions>
        </el-collapse-item>
      </el-collapse>
    </template>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { UserRound } from 'lucide-vue-next';
import type { ExpertDefinition, OfficialAgentRow } from '../../../api/admin';
import {
  buildCapabilityLabels,
  categoryLabel,
  formatDate,
  kindLabel,
  statusLabel,
  statusType,
  toolScopeLabel,
} from './agent-display';

export interface ViewerDiscovery {
  introduction: string;
  outputs: string[];
  materials: string[];
  boundaries: string[];
  starters: Array<{ text: string }>;
}

const props = defineProps<{
  modelValue: boolean;
  agent: OfficialAgentRow | null;
  discovery: ViewerDiscovery | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const brokenAvatarIds = reactive<Record<string, boolean>>({});

/** 缓存键含头像地址：详情回读/换头像后 url 变化即重试加载。 */
function avatarCacheKey(agent: OfficialAgentRow) {
  return `${agent.id}:${agent.avatarUrl ?? ''}`;
}

function isAvatarBroken(agent: OfficialAgentRow) {
  return Boolean(brokenAvatarIds[avatarCacheKey(agent)]);
}

const display = computed(() => {
  const agent = props.agent;
  if (!agent) {
    return {
      name: '',
      summary: '',
      openingQuestions: [] as string[],
      systemPrompt: '',
      toolScope: [] as string[],
    };
  }
  return {
    name: agent.draft.name,
    summary: agent.draft.summary,
    openingQuestions: agent.draft.openingQuestions,
    systemPrompt: agent.draft.systemPrompt,
    toolScope: agent.draft.toolScope,
  };
});

const capabilityLabels = computed(() => {
  const agent = props.agent;
  if (!agent) return [] as string[];
  return buildCapabilityLabels(display.value.toolScope, agent.capabilities);
});

const definition = computed<ExpertDefinition>(() => props.agent?.draft.expertDefinition ?? {});

function onAvatarError(agent: OfficialAgentRow) {
  brokenAvatarIds[avatarCacheKey(agent)] = true;
}
</script>

<style scoped>
.viewer-longtext {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow: auto;
}

.form-section-title {
  margin: 4px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.agent-avatar {
  align-items: center;
  background: #eef2ff;
  border: 1px solid #dfe5ef;
  border-radius: 8px;
  color: #4338ca;
  display: inline-flex;
  flex: none;
  font-size: 14px;
  font-weight: 600;
  height: 36px;
  justify-content: center;
  line-height: 1;
  overflow: hidden;
  width: 36px;
}

.agent-avatar img {
  display: block;
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.agent-avatar-lg {
  border-radius: 10px;
  font-size: 22px;
  height: 56px;
  width: 56px;
}

.agent-name {
  color: #333946;
  font-weight: 600;
}

.agent-key,
.muted {
  color: #98a2b3;
  font-size: 12px;
}

.viewer-hero {
  align-items: center;
  display: flex;
  gap: 14px;
  margin-bottom: 16px;
}

.viewer-hero-text {
  min-width: 0;
}

.viewer-meta {
  align-items: center;
  color: #667085;
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  gap: 8px;
  margin-top: 8px;
}

.viewer-source-tip {
  margin-bottom: 14px;
}

.viewer-descriptions {
  margin-top: 4px;
}

.viewer-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.viewer-questions {
  margin: 0;
  padding-left: 18px;
}

.viewer-questions li + li {
  margin-top: 4px;
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

.linked-skill-previews { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; width: 100%; }
.linked-skill-previews li { padding: 8px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.linked-skill-previews strong, .linked-skill-previews span { display: block; }
.linked-skill-previews span { margin-top: 4px; color: var(--el-text-color-secondary); font-size: 12px; line-height: 18px; }
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

/* 只读详情：水平垂直居中，上下相对视口留白，中间内容滚动；不改编辑/授权等其它弹窗 */
.el-dialog.official-agent-viewer,
.el-dialog.official-agent-history {
  display: flex;
  flex-direction: column;
  margin: 48px auto !important;
  max-height: calc(100dvh - 96px);
}

.el-dialog.official-agent-viewer.is-align-center,
.el-dialog.official-agent-history.is-align-center {
  margin: 48px auto !important;
}

.official-agent-viewer .el-dialog__header,
.official-agent-viewer .el-dialog__footer,
.official-agent-history .el-dialog__header,
.official-agent-history .el-dialog__footer {
  flex-shrink: 0;
}

.official-agent-viewer .el-dialog__body,
.official-agent-history .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .official-agent-dialog {
    width: calc(100vw - 32px) !important;
  }

  .el-dialog.official-agent-viewer,
  .el-dialog.official-agent-history {
    margin: auto !important;
    max-height: calc(100dvh - 48px);
  }

  .el-dialog.official-agent-viewer.is-align-center,
  .el-dialog.official-agent-history.is-align-center {
    margin: auto !important;
  }
}

.el-dialog.official-agent-dialog { border-radius: 10px; }
</style>
