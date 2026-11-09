<template>
  <section class="official-agents-page">
    <div class="page-intro">
      <div>
        <h2>专家配置</h2>
        <p>维护官方专家配置、发布与版本。</p>
      </div>
      <div class="header-actions">
        <el-button @click="openAuditDrawer">运营审计</el-button>
        <el-button type="primary" @click="openCreate">新建专家</el-button>
      </div>
    </div>

    <div class="agent-toolbar">
      <el-input
        v-model="keyword"
        class="keyword-input"
        clearable
        placeholder="搜索名称、标识、ID 或简介"
        :prefix-icon="Search"
        @input="onSearchInput"
        @clear="onSearchNow"
        @keyup.enter="onSearchNow"
      />
      <el-button type="primary" @click="onSearchNow">搜索</el-button>
      <el-button @click="onReset">重置</el-button>
      <el-button
        type="warning"
        :disabled="!selectedRows.length"
        :loading="bulkOfflineLoading"
        @click="onBulkOffline"
      >
        批量下架（{{ selectedRows.length }}）
      </el-button>
    </div>

    <el-radio-group
      v-model="statusFilter"
      class="status-tabs"
      @change="onSearchNow"
    >
      <el-radio-button value="ALL">全部 {{ statusCounts.all }}</el-radio-button>
      <el-radio-button value="DRAFT">未发布 {{ statusCounts.DRAFT }}</el-radio-button>
      <el-radio-button value="PUBLISHED">已发布 {{ statusCounts.PUBLISHED }}</el-radio-button>
      <el-radio-button value="OFFLINE">已下架 {{ statusCounts.OFFLINE }}</el-radio-button>
    </el-radio-group>

    <div class="agent-table-wrap">
    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="pagedRows"
      border
      class="agent-table"
      row-key="id"
      :row-class-name="rowClassName"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="48" :selectable="canSelectOffline" />
      <el-table-column label="专家" min-width="260">
        <template #default="{ row }">
          <div class="agent-identity">
            <div class="agent-avatar" aria-hidden="true">
              <img
                v-if="row.avatarUrl && !brokenAvatarIds[row.id]"
                :src="row.avatarUrl"
                :alt="row.draft.name"
                @error="onAvatarError(row.id)"
              />
              <UserRound v-else :size="22" aria-hidden="true" />
            </div>
            <div class="agent-identity-text">
              <div class="agent-name">{{ row.draft.name }}</div>
              <div class="agent-key">{{ row.key }}</div>
              <div class="agent-id">{{ row.id }}</div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="110">
        <template #default="{ row }">
          <el-tag size="small" effect="plain" :type="row.kind === 'KNOWLEDGE' ? 'warning' : 'primary'">
            {{ kindLabel(row.kind) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <div class="status-cell">
            <el-tag size="small" :type="statusType(row.status)">
              {{ statusLabel(row.status) }}
            </el-tag>
            <el-tag
              v-if="row.hasUnpublishedChanges"
              size="small"
              type="warning"
              effect="plain"
            >
              有未发布修改
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" min-width="170">
        <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="410" fixed="right" align="center" class-name="agent-ops-col" label-class-name="agent-ops-col">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="openViewer(row)">查看</el-button>
            <el-button text type="primary" @click="discoveryId = row.id">专家介绍</el-button>
            <el-button text type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button text type="primary" @click="openPublishRecords(row)">发布记录</el-button>
            <el-button
              text
              type="primary"
              :loading="publishingId === row.id"
              @click="onPublish(row)"
            >
              发布
            </el-button>
            <el-button
              v-if="row.status === 'PUBLISHED'"
              text
              type="warning"
              :loading="offlineId === row.id"
              @click="onOffline(row)"
            >
              下架
            </el-button>
            <el-button
              text
              type="danger"
              :loading="deletingId === row.id"
              @click="onDelete(row)"
            >
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="hasFilters ? '没有符合条件的专家' : '还没有官方专家'">
          <el-button v-if="!hasFilters" type="primary" @click="openCreate">新建专家</el-button>
        </el-empty>
      </template>
    </el-table>
    </div>

    <div class="pagination-row">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        background
        layout="total, sizes, prev, pager, next"
        :page-sizes="[10, 20, 50]"
        :total="rows.length"
      />
    </div>

    <el-dialog
      v-model="editorOpen"
      :title="editingId ? '编辑专家' : '新建官方专家'"
      width="720px"
      class="official-agent-dialog official-agent-editor"
      destroy-on-close
      :close-on-press-escape="!saving && !iconValidating"
      :show-close="!saving && !iconValidating"
      @closed="clearIconDraft"
      align-center
      append-to-body
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="108px" class="agent-form" :disabled="saving || publishingFromEditor">
        <div class="form-section-title">基本信息</div>
        <el-form-item label="专家头像">
          <CatalogIconEditor profile="expert" v-model="pendingIcon" v-model:removed="removeIcon" :current-url="formAvatarUrl" :disabled="saving || publishingFromEditor" @validating="iconValidating=$event" />
        </el-form-item>
        <el-form-item label="专家名称" prop="name" required>
          <el-input v-model="form.name" maxlength="80" show-word-limit />
        </el-form-item>
        <el-form-item label="一句话介绍" prop="summary" required>
          <div class="form-hint field-req-hint">发布必填；保存草稿可暂空。</div>
          <el-input
            v-model="form.summary"
            type="textarea"
            :rows="2"
            maxlength="1000"
            show-word-limit
            placeholder="用于广场卡片与详情首屏"
          />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-select v-model="form.category" clearable placeholder="未设置" style="width: 100%">
            <el-option label="常用" value="common" />
            <el-option label="工作提效" value="productivity" />
            <el-option label="内容营销" value="content" />
            <el-option label="销售增长" value="sales" />
            <el-option label="专业知识" value="expertise" />
            <el-option label="数据分析" value="analytics" />
          </el-select>
        </el-form-item>
        <el-form-item label="能力标签" prop="capabilitiesText">
          <el-input
            v-model="form.capabilitiesText"
            type="textarea"
            :rows="2"
            placeholder="每行一个中文能力标签（展示用，不授予执行权限）"
          />
        </el-form-item>
        <el-form-item label="推荐提问">
          <el-alert
            type="info"
            :closable="false"
            title="推荐提问请在「专家介绍」维护（最多3条完整正文）。此处不重复填写。"
          />
          <div class="form-hint">
            当前同步：
            <template v-if="form.openingQuestionsText.trim()">{{ form.openingQuestionsText.split('\n').filter(Boolean).length }} 条</template>
            <template v-else>暂无</template>
            ·
            <el-button v-if="editingId" text type="primary" @click="discoveryId = editingId">打开专家介绍</el-button>
            <span v-else>保存新建后可直接打开专家介绍继续维护。</span>
          </div>
        </el-form-item>

        <div class="form-section-title">执行配置</div>
        <el-form-item label="类型" prop="kind">
          <el-radio-group v-model="form.kind" :disabled="Boolean(editingId)">
            <el-radio value="GENERAL">通用型</el-radio>
            <el-radio value="KNOWLEDGE">资料型</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="角色定位" prop="expertRole" required>
          <div class="form-hint field-req-hint">发布必填；保存草稿可暂空。</div>
          <el-input v-model="form.expertRole" placeholder="例如：负责关账计划与财务报告复核的财务负责人" maxlength="200" />
        </el-form-item>
        <el-form-item label="流程">
          <el-input v-model="form.workflowText" type="textarea" :rows="3" placeholder="每行一步；可留空" />
        </el-form-item>
        <el-form-item label="交付标准">
          <el-input v-model="form.deliverablesText" type="textarea" :rows="3" placeholder="每行一项交付物或验收标准" />
        </el-form-item>
        <el-form-item label="专家指令" prop="systemPrompt" required>
          <div class="form-hint field-req-hint">发布必填；保存草稿可暂空。仅管理员可见。</div>
          <el-input
            v-model="form.systemPrompt"
            type="textarea"
            :rows="8"
            maxlength="50000"
            placeholder="仅平台 Admin 可见，不会进入公开目录"
          />
        </el-form-item>
        <el-form-item label="可用工具" prop="toolScope">
          <el-select
            v-model="form.toolScope"
            multiple
            clearable
            collapse-tags
            collapse-tags-tooltip
            placeholder="从合法工具中选择；可不选"
            style="width: 100%"
          >
            <el-option
              v-for="tool in TOOL_SCOPE_OPTIONS"
              :key="tool.value"
              :label="tool.label"
              :value="tool.value"
            />
          </el-select>
          <div class="form-hint">工具权限与能力标签分开：这里是执行授权，标签仅展示。</div>
        </el-form-item>
        <el-form-item label="关联技能">
          <el-select
            v-model="form.linkedSkillIds"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            placeholder="仅可选当前已启用技能"
            style="width: 100%"
          >
            <el-option
              v-for="skill in selectableSkillOptions"
              :key="skill.id"
              :label="`${skill.name}（${skill.key}）${skill.enabledAt ? '' : ' · 已停用'}`"
              :value="skill.id"
            />
          </el-select>
          <div class="form-hint">可不关联技能。新会话按已发布版本冻结启用技能摘要；不自动授予工具权限。</div>
          <ul v-if="selectedSkillPreviews.length" class="linked-skill-previews">
            <li v-for="skill in selectedSkillPreviews" :key="skill.id"><strong>{{ skill.name }}</strong><span>{{ skill.summary }}</span></li>
          </ul>
        </el-form-item>

        <el-collapse v-model="advancedOpen">
          <el-collapse-item title="高级：自动标识" name="advanced">
            <el-form-item label="标识" prop="key">
              <el-input
                v-model="form.key"
                :disabled="Boolean(editingId)"
                maxlength="64"
                placeholder="可留空自动生成；创建后只读"
              />
            </el-form-item>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <div class="editor-footer">
          <span class="footer-hint">{{
            editingId
              ? '「保存并发布」会发布该专家全部已保存待发布修改，不只是本弹窗。'
              : '新建请先保存生成专家；保存成功后可在本页继续编辑，或关闭后从列表发布。'
          }}</span>
          <div class="footer-actions">
            <el-button :disabled="saving || publishingFromEditor" @click="editorOpen = false">取消</el-button>
            <el-button :loading="saving && !publishingFromEditor" :disabled="saving || publishingFromEditor || iconValidating" @click="onSave">保存修改</el-button>
            <el-button
              v-if="editingId"
              type="primary"
              :loading="publishingFromEditor"
              :disabled="saving || publishingFromEditor || iconValidating"
              @click="onSaveAndPublish"
            >
              保存并发布
            </el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="viewerOpen"
      title="查看官方专家"
      width="760px"
      class="official-agent-dialog official-agent-viewer"
      align-center
      append-to-body
      :close-on-click-modal="false"
    >
      <div v-loading="viewerLoading">
      <template v-if="viewerAgent">
        <div class="viewer-hero">
          <div class="agent-avatar agent-avatar-lg" aria-hidden="true">
            <img
              v-if="viewerAgent.avatarUrl && !brokenAvatarIds[viewerAgent.id]"
              :src="viewerAgent.avatarUrl"
              :alt="viewerAgent.draft.name"
              @error="onAvatarError(viewerAgent.id)"
            />
            <UserRound v-else :size="22" aria-hidden="true" />
          </div>
          <div class="viewer-hero-text">
            <div class="agent-name">{{ viewerDisplay.name }}</div>
            <div class="agent-key">{{ viewerAgent.key }}</div>
            <div class="viewer-meta">
              <el-tag size="small" effect="plain" :type="viewerAgent.kind === 'KNOWLEDGE' ? 'warning' : 'primary'">
                {{ kindLabel(viewerAgent.kind) }}
              </el-tag>
              <el-tag size="small" :type="statusType(viewerAgent.status)">
                {{ statusLabel(viewerAgent.status) }}
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
          v-if="viewerAgent.hasUnpublishedChanges"
          class="viewer-source-tip"
          type="warning"
          :closable="false"
          title="存在未发布修改（含头像 / 主配置 / 专家介绍）。"
        />

        <div class="form-section-title">基本信息</div>
        <el-descriptions :column="1" border class="viewer-descriptions" size="small">
          <el-descriptions-item label="专家名称">{{ viewerDisplay.name || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="一句话介绍">{{ viewerDisplay.summary || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="分类">{{ categoryLabel(viewerAgent.category) }}</el-descriptions-item>
          <el-descriptions-item label="能力标签">
            <div v-if="viewerCapabilityLabels.length" class="viewer-chip-row">
              <el-tag v-for="label in viewerCapabilityLabels" :key="label" size="small" effect="plain">{{ label }}</el-tag>
            </div>
            <span v-else class="muted">未填写</span>
          </el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusLabel(viewerAgent.status) }}</el-descriptions-item>
        </el-descriptions>

        <div class="form-section-title">执行配置</div>
        <el-descriptions :column="1" border class="viewer-descriptions" size="small">
          <el-descriptions-item label="类型">{{ kindLabel(viewerAgent.kind) }}</el-descriptions-item>
          <el-descriptions-item label="角色定位">{{ viewerDefinition.profile?.role || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="流程">
            <ol v-if="viewerDefinition.workflow?.length"><li v-for="step in viewerDefinition.workflow" :key="step">{{ step }}</li></ol>
            <span v-else class="muted">未填写</span>
          </el-descriptions-item>
          <el-descriptions-item label="交付标准">
            <ul v-if="viewerDefinition.deliverables?.length"><li v-for="item in viewerDefinition.deliverables" :key="item">{{ item }}</li></ul>
            <span v-else class="muted">未填写</span>
          </el-descriptions-item>
          <el-descriptions-item label="专家指令（仅管理员）">
            <pre class="viewer-prompt">{{ viewerDisplay.systemPrompt || '未填写' }}</pre>
          </el-descriptions-item>
          <el-descriptions-item label="可用工具">
            <div v-if="viewerDisplay.toolScope.length" class="viewer-chip-row">
              <el-tag v-for="tool in viewerDisplay.toolScope" :key="tool" size="small" effect="plain" type="info">{{ toolScopeLabel(tool) }}</el-tag>
            </div>
            <span v-else class="muted">未声明工具（通用对话）</span>
          </el-descriptions-item>
          <el-descriptions-item label="关联技能">
            <ul v-if="viewerAgent.linkedSkills?.length" class="linked-skill-previews"><li v-for="skill in viewerAgent.linkedSkills" :key="skill.id"><strong>{{ skill.name }} · r{{ skill.packageRevision }}{{ skill.enabledAt ? '' : ' · 已停用' }}</strong><span>{{ skill.summary }}</span></li></ul>
            <span v-else class="muted">未关联技能</span>
          </el-descriptions-item>
        </el-descriptions>

        <div class="form-section-title">专家介绍</div>
        <el-descriptions :column="1" border class="viewer-descriptions" size="small">
          <el-descriptions-item label="详细说明">
            <div class="viewer-longtext">{{ viewerDiscovery?.introduction || '未填写' }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="推荐提问">
            <ol v-if="viewerDiscovery?.starters?.length" class="viewer-questions">
              <li v-for="(starter, index) in viewerDiscovery.starters" :key="index">{{ starter.text }}</li>
            </ol>
            <span v-else class="muted">未填写</span>
          </el-descriptions-item>
          <el-descriptions-item label="你能得到什么">
            <ul v-if="viewerDiscovery?.outputs?.length"><li v-for="item in viewerDiscovery.outputs" :key="item">{{ item }}</li></ul>
            <span v-else class="muted">未填写</span>
          </el-descriptions-item>
          <el-descriptions-item label="建议提供的信息">
            <ul v-if="viewerDiscovery?.materials?.length"><li v-for="item in viewerDiscovery.materials" :key="item">{{ item }}</li></ul>
            <span v-else class="muted">未填写</span>
          </el-descriptions-item>
          <el-descriptions-item label="不适合处理什么">
            <ul v-if="viewerDiscovery?.boundaries?.length"><li v-for="item in viewerDiscovery.boundaries" :key="item">{{ item }}</li></ul>
            <span v-else class="muted">未填写</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-collapse>
          <el-collapse-item title="系统信息 / 来源许可" name="sys">
            <el-descriptions :column="1" border class="viewer-descriptions" size="small">
              <el-descriptions-item label="标识">{{ viewerAgent.key }}</el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ formatDate(viewerAgent.createdAt) }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">{{ formatDate(viewerAgent.updatedAt) }}</el-descriptions-item>
              <el-descriptions-item v-if="viewerDefinition.source?.repository" label="来源 / 许可">
                {{ viewerDefinition.source.repository }} · {{ viewerDefinition.license?.spdx || '待确认' }}
                <div class="agent-key">{{ viewerDefinition.source.ref }}</div>
              </el-descriptions-item>
              <el-descriptions-item v-if="viewerDefinition.adaptation?.notes?.length" label="宿主适配">
                <ul><li v-for="note in viewerDefinition.adaptation.notes" :key="note">{{ note }}</li></ul>
              </el-descriptions-item>
            </el-descriptions>
          </el-collapse-item>
        </el-collapse>
      </template>
      </div>
      <template #footer>
        <el-button @click="viewerOpen = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="publishRecordsOpen"
      title="发布记录"
      width="640px"
      destroy-on-close
      class="official-agent-dialog"
    >
      <p v-if="publishRecordsAgent" class="publish-records-summary">
        {{ publishRecordsAgent.draft.name }}（{{ publishRecordsAgent.key }}）
      </p>
      <el-table
        v-loading="publishRecordsLoading"
        :data="publishRecords"
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
      </el-table>
      <template #footer>
        <el-button @click="publishRecordsOpen = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="auditOpen"
      title="官方专家运营审计"
      class="official-agent-audit"
      size="min(100vw, max(640px, 52vw))"
      @closed="expandedAuditId = ''"
    >
      <template #header="{ titleId, titleClass }">
        <div class="audit-drawer-heading">
          <h2 :id="titleId" :class="titleClass">官方专家运营审计</h2>
          <div class="audit-drawer-toolbar">
            <el-button size="small" :loading="auditLoading" @click="loadAudit">刷新</el-button>
            <el-button size="small" link type="primary" @click="goFullAudit">完整操作审计 ↗</el-button>
          </div>
        </div>
      </template>
      <el-table
        v-loading="auditLoading"
        :data="auditRows"
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
    <CatalogDiscoveryEditor v-if="discoveryId" kind="expert" :resource-id="discoveryId" :agent-status="discoveryAgentStatus" @close="discoveryId=''" @saved="onDiscoverySaved" @published="onDiscoveryPublished" />
  </section>
</template>

<script setup lang="ts">
import { computed, h, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import CatalogDiscoveryEditor from '../../components/CatalogDiscoveryEditor.vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type TagProps } from 'element-plus';
import { Search, UserRound } from 'lucide-vue-next';
import CatalogIconEditor from '../../components/CatalogIconEditor.vue';
import {
  formatPublishMissingToast,
  formatValidationToast,
  summarizeInvalidFields,
  type FormInvalidFields,
} from '../../utils/admin-official-agent-form-errors';
import { AuditActionLabel } from '@mammoth/shared';
import {
  adminAuditApi,
  adminOfficialAgentApi,
  adminOfficialSkillApi,
  type AdminAuditRow,
  type OfficialAgentCategory,
  type OfficialAgentKind,
  type OfficialAgentRow,
  type OfficialAgentVersion,
  type ExpertDefinition,
  type OfficialAgentStatus,
  type OfficialSkillOption,
} from '../../api/admin';
import { formatAgentDateTime } from './official-agent-version-presentation';

const router = useRouter();

const rows = ref<OfficialAgentRow[]>([]);
const statusCounts = ref({ all: 0, DRAFT: 0, PUBLISHED: 0, OFFLINE: 0 });
const loading = ref(false);
const keyword = ref('');
const statusFilter = ref<OfficialAgentStatus | 'ALL'>('ALL');
const highlightedId = ref('');
const discoveryId = ref('');
const publishingFromEditor = ref(false);
const discoveryAgentStatus = computed(() => rows.value.find((row) => row.id === discoveryId.value)?.status ?? '');
const publishRecordsOpen = ref(false);
const publishRecordsLoading = ref(false);
const publishRecordsAgent = ref<OfficialAgentRow | null>(null);
const publishRecords = ref<OfficialAgentVersion[]>([]);
const currentPage = ref(1);
const pageSize = ref(10);
let highlightTimer = 0;
const editorOpen = ref(false);
const editingId = ref('');
const saving = ref(false);
const formAvatarUrl = ref<string | null>(null);
const pendingIcon=ref<File|null>(null);
const removeIcon=ref(false);
const iconValidating=ref(false);
let editorBaseline='';
function clearIconDraft(){pendingIcon.value=null;removeIcon.value=false;iconValidating.value=false;}
function editorFields(){return JSON.stringify(form);}
const publishingId = ref('');
const offlineId = ref('');
const deletingId = ref('');
const viewerOpen = ref(false);
const viewerLoading = ref(false);
const brokenAvatarIds = reactive<Record<string, boolean>>({});
const viewerAgent = ref<OfficialAgentRow | null>(null);
const viewerDiscovery = ref<{
  introduction: string;
  outputs: string[];
  materials: string[];
  boundaries: string[];
  starters: Array<{ text: string }>;
} | null>(null);
const formRef = ref<FormInstance>();
const tableRef = ref();
const selectedRows = ref<OfficialAgentRow[]>([]);
const bulkOfflineLoading = ref(false);
const auditOpen = ref(false);
const expandedAuditId = ref('');
const auditLoading = ref(false);
const auditRows = ref<AdminAuditRow[]>([]);
let searchTimer = 0;
let requestSequence = 0;

const form = reactive({
  key: '',
  kind: 'GENERAL' as OfficialAgentKind,
  name: '',
  summary: '',
  openingQuestionsText: '',
  systemPrompt: '',
  toolScope: [] as string[],
  category: '' as '' | OfficialAgentCategory,
  capabilitiesText: '',
  linkedSkillIds: [] as string[],
  expertRole: '',
  workflowText: '',
  deliverablesText: '',
});

const enabledSkillOptions = ref<OfficialSkillOption[]>([]);
const baseDefinition = ref<ExpertDefinition>({});
const retainedSkillOptions = ref<OfficialSkillOption[]>([]);
const selectableSkillOptions = computed(() => [...enabledSkillOptions.value, ...retainedSkillOptions.value.filter(skill => !enabledSkillOptions.value.some(item => item.id === skill.id))]);
const selectedSkillPreviews = computed(() => selectableSkillOptions.value.filter(skill => form.linkedSkillIds.includes(skill.id)));
const viewerDefinition = computed<ExpertDefinition>(() => viewerAgent.value?.draft.expertDefinition ?? {});


const rules: FormRules = {
  key: [
    {
      validator: (_rule, value, callback) => {
        const text = typeof value === 'string' ? value.trim() : '';
        // 新建可留空自动生成；仅在手动填写时校验格式。
        if (!text) {
          callback();
          return;
        }
        if (!/^[a-z][a-z0-9-]{1,63}$/.test(text)) {
          callback(new Error('使用小写字母、数字和连字符，并以字母开头'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  name: [{ required: true, message: '请输入专家名称', trigger: 'blur' }],
};

const hasFilters = computed(() => Boolean(keyword.value.trim() || statusFilter.value !== 'ALL'));
const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return rows.value.slice(start, start + pageSize.value);
});

const viewerDisplay = computed(() => {
  const agent = viewerAgent.value;
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

const viewerCapabilityLabels = computed(() => {
  const agent = viewerAgent.value;
  if (!agent) return [] as string[];
  return buildCapabilityLabels(viewerDisplay.value.toolScope, agent.capabilities);
});

const CATEGORY_LABELS: Record<OfficialAgentCategory, string> = {
  common: '常用',
  productivity: '工作提效',
  content: '内容营销',
  sales: '销售增长',
  expertise: '专业知识',
  analytics: '数据分析',
};

const TOOL_SCOPE_LABELS: Record<string, string> = {
  enterprise_knowledge: '企业资料 / 知识库',
  web_search: '联网检索',
  web_fetch: '网页阅读',
  tabular_analyze: '表格分析',
  delegate_official_agent: '团队协作',
  delegate: '团队协作',
};

const TOOL_SCOPE_OPTIONS = [
  { value: 'enterprise_knowledge', label: TOOL_SCOPE_LABELS.enterprise_knowledge },
  { value: 'web_search', label: TOOL_SCOPE_LABELS.web_search },
  { value: 'web_fetch', label: TOOL_SCOPE_LABELS.web_fetch },
  { value: 'tabular_analyze', label: TOOL_SCOPE_LABELS.tabular_analyze },
  { value: 'delegate_official_agent', label: TOOL_SCOPE_LABELS.delegate_official_agent },
] as const;

const advancedOpen = ref<string[]>([]);

function kindLabel(kind: OfficialAgentKind) {
  return kind === 'KNOWLEDGE' ? '资料型' : '通用型';
}

function categoryLabel(category: OfficialAgentCategory | null | undefined) {
  if (!category) return '未设置';
  return CATEGORY_LABELS[category] ?? category;
}

function toolScopeLabel(tool: string) {
  return TOOL_SCOPE_LABELS[tool] ?? tool;
}



function onAvatarError(id: string) {
  brokenAvatarIds[id] = true;
}

function buildCapabilityLabels(toolScope: string[], stored: string[]) {
  const labels: string[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const text = label.trim();
    if (!text || seen.has(text) || labels.length >= 8) return;
    seen.add(text);
    labels.push(text);
  };
  for (const tool of [
    'enterprise_knowledge',
    'web_search',
    'web_fetch',
    'tabular_analyze',
    'delegate_official_agent',
    'delegate',
  ]) {
    if (toolScope.includes(tool)) push(toolScopeLabel(tool));
  }
  for (const label of stored) push(label);
  return labels;
}

function statusLabel(status: OfficialAgentStatus) {
  const labels: Record<OfficialAgentStatus, string> = {
    DRAFT: '未发布',
    PUBLISHED: '已发布',
    OFFLINE: '已下架',
  };
  return labels[status];
}

function statusType(status: OfficialAgentStatus): TagProps['type'] {
  if (status === 'PUBLISHED') return 'success';
  if (status === 'OFFLINE') return 'info';
  return 'warning';
}

function formatDate(value: string | null) {
  return formatAgentDateTime(value);
}


function canSelectOffline(row: OfficialAgentRow) {
  return row.status === 'PUBLISHED';
}

function onSelectionChange(rowsSelected: OfficialAgentRow[]) {
  selectedRows.value = rowsSelected;
}

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

function splitLines(value: string) {
  return [...new Set(value.split('\n').map((line) => line.trim()).filter(Boolean))];
}

function rowClassName({ row }: { row: OfficialAgentRow }) {
  return row.id === highlightedId.value ? 'agent-row-highlight' : '';
}

function focusCreatedAgent(id: string) {
  keyword.value = '';
  statusFilter.value = 'ALL';
  currentPage.value = 1;
  highlightedId.value = id;
  window.clearTimeout(highlightTimer);
  highlightTimer = window.setTimeout(() => {
    if (highlightedId.value === id) highlightedId.value = '';
  }, 4500);
}

async function load() {
  const sequence = ++requestSequence;
  loading.value = true;
  try {
    const result = await adminOfficialAgentApi.list({
      keyword: keyword.value.trim(),
      status: statusFilter.value === 'ALL' ? '' : statusFilter.value,
    });
    if (sequence === requestSequence) {
      rows.value = result.items;
      statusCounts.value = result.statusCounts;
    }
  } catch (error) {
    if (sequence === requestSequence) {
      ElMessage.error(error instanceof Error ? error.message : '加载官方专家失败');
    }
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

function onSearchInput() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(onSearchNow, 350);
}

function onSearchNow() {
  window.clearTimeout(searchTimer);
  currentPage.value = 1;
  void load();
}

function onReset() {
  keyword.value = '';
  statusFilter.value = 'ALL';
  onSearchNow();
}

function resetEditor() {
  editingId.value = '';
  formAvatarUrl.value = null;
  clearIconDraft();
  form.key = '';
  form.kind = 'GENERAL';
  form.name = '';
  form.summary = '';
  form.openingQuestionsText = '';
  form.systemPrompt = '';
  form.toolScope = [];
  form.category = '';
  form.capabilitiesText = '';
  form.linkedSkillIds = [];
  form.expertRole = '';
  form.workflowText = '';
  form.deliverablesText = '';
  baseDefinition.value = {};
  retainedSkillOptions.value = [];
  void nextTick(() => formRef.value?.clearValidate());
}

async function loadEnabledSkills() {
  try {
    enabledSkillOptions.value = await adminOfficialSkillApi.enabledOptions();
  } catch {
    ElMessage.warning('技能选项加载失败，已有关联保留，请稍后重新打开重试');
  }
}

function openCreate() {
  void loadEnabledSkills();
  resetEditor();
  editorBaseline=editorFields();
  editorOpen.value = true;
}

function openEdit(row: OfficialAgentRow) {
  void loadEnabledSkills();
  resetEditor();
  editingId.value = row.id;
  formAvatarUrl.value = row.avatarUrl;
  form.key = row.key;
  form.kind = row.kind;
  form.name = row.draft.name;
  form.summary = row.draft.summary;
  form.openingQuestionsText = row.draft.openingQuestions.join('\n');
  form.systemPrompt = row.draft.systemPrompt;
  form.toolScope = [...row.draft.toolScope];
  form.category = (row.category ?? '') as typeof form.category;
  form.capabilitiesText = Array.isArray(row.capabilities) ? row.capabilities.join('\n') : '';
  form.linkedSkillIds = Array.isArray(row.linkedSkillIds) ? [...row.linkedSkillIds] : [];
  retainedSkillOptions.value = (row.linkedSkills ?? []).map(skill => ({ ...skill, category: skill.category as OfficialSkillOption['category'] }));
  baseDefinition.value = JSON.parse(JSON.stringify(row.draft.expertDefinition ?? {})) as ExpertDefinition;
  form.expertRole = baseDefinition.value.profile?.role || row.draft.name;
  form.workflowText = (baseDefinition.value.workflow ?? []).join('\n');
  form.deliverablesText = (baseDefinition.value.deliverables ?? []).join('\n');
  editorBaseline=editorFields();
  editorOpen.value = true;
}

function replaceRow(next: OfficialAgentRow) {
  const index = rows.value.findIndex((row) => row.id === next.id);
  if (index >= 0) rows.value[index] = next;
  if (editingId.value === next.id && editorOpen.value) {
    formAvatarUrl.value = next.avatarUrl;
  }
}

async function revealEditorField(prop: string | null) {
  if (prop === 'key' && !advancedOpen.value.includes('advanced')) {
    advancedOpen.value = [...advancedOpen.value, 'advanced'];
  }
  await nextTick();
  if (prop) formRef.value?.scrollToField?.(prop);
  await nextTick();
  const root = document.querySelector('.official-agent-editor .agent-form');
  const item =
    (prop && root?.querySelector(`.el-form-item[prop="${prop}"]`)) ||
    root?.querySelector('.el-form-item.is-error');
  const focusable = item?.querySelector('input, textarea, .el-input__inner, .el-textarea__inner');
  if (focusable instanceof HTMLElement) focusable.focus();
}

async function validateEditorForm(): Promise<boolean> {
  if (!formRef.value) return true;
  // Prefer callback form so invalidFields are available across Element Plus versions.
  return await new Promise<boolean>((resolve) => {
    void formRef.value!.validate((valid, fields) => {
      void (async () => {
        if (valid) {
          resolve(true);
          return;
        }
        const { lines, firstProp } = summarizeInvalidFields(fields as FormInvalidFields);
        await revealEditorField(firstProp);
        ElMessage.error(formatValidationToast(lines));
        resolve(false);
      })();
    });
  });
}

async function persistEditorDraft(): Promise<OfficialAgentRow | null> {
  const valid = await validateEditorForm();
  if (!valid) return null;
  const draft = {
    name: form.name.trim(),
    summary: form.summary.trim(),
    systemPrompt: form.systemPrompt.trim(),
    toolScope: [...form.toolScope],
    ...(form.category ? { category: form.category } : {}),
    capabilities: splitLines(form.capabilitiesText),
    linkedSkillIds: form.linkedSkillIds,
    expertDefinition: {
      ...baseDefinition.value,
      profile: { ...baseDefinition.value.profile, role: form.expertRole.trim(), mission: form.summary.trim() },
      workflow: splitLines(form.workflowText), deliverables: splitLines(form.deliverablesText),
    },
  };
  const wasNew = !editingId.value;
  let next: OfficialAgentRow | undefined;
  if (wasNew || editorFields() !== editorBaseline) {
    next = editingId.value
      ? await adminOfficialAgentApi.update(editingId.value, draft)
      : await adminOfficialAgentApi.create({
          ...draft,
          // Example questions are owned by 专家介绍 (starters); create with empty legacy mirror.
          openingQuestions: [],
          key: form.key.trim() || `expert-${crypto.randomUUID().slice(0, 12)}`,
          kind: form.kind,
        });
    editingId.value = next.id;
    editorBaseline = editorFields();
    replaceRow(next);
  }
  if (pendingIcon.value) {
    const body = new FormData();
    body.append('file', pendingIcon.value);
    next = await adminOfficialAgentApi.uploadAvatar(editingId.value, body);
  } else if (removeIcon.value) {
    next = await adminOfficialAgentApi.removeAvatar(editingId.value);
  }
  if (next) {
    replaceRow(next);
    if (viewerAgent.value?.id === next.id) viewerAgent.value = next;
    delete brokenAvatarIds[next.id];
  }
  clearIconDraft();
  if (wasNew && next) {
    focusCreatedAgent(next.id);
    await load();
    next = rows.value.find((row) => row.id === next!.id) ?? next;
  }
  const current = next ?? rows.value.find((row) => row.id === editingId.value) ?? null;
  if (current) form.openingQuestionsText = (current.draft.openingQuestions ?? []).join('\n');
  return current;
}

function collectPublishMissing(source: {
  name: string;
  summary: string;
  expertRole: string;
  systemPrompt: string;
  toolScope: string[];
} = form): string[] {
  const missing: string[] = [];
  if (!source.name.trim()) missing.push('专家名称');
  if (!source.summary.trim()) missing.push('一句话介绍');
  if (!source.expertRole.trim()) missing.push('角色定位');
  if (!source.systemPrompt.trim()) missing.push('专家指令');
  const allowed = new Set([
    'enterprise_knowledge',
    'web_search',
    'web_fetch',
    'tabular_analyze',
    'delegate_official_agent',
    'delegate',
  ]);
  if (source.toolScope.some((tool) => tool && !allowed.has(tool))) {
    missing.push('可用工具（存在无效标识）');
  }
  return missing;
}

function focusPublishMissingField(missing: string[]) {
  const map: Record<string, string> = {
    专家名称: 'name',
    一句话介绍: 'summary',
    角色定位: 'expertRole',
    专家指令: 'systemPrompt',
    '可用工具（存在无效标识）': 'toolScope',
  };
  void revealEditorField(map[missing[0] ?? ''] ?? 'name');
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

async function onSave() {
  if (saving.value || publishingFromEditor.value || iconValidating.value) return;
  saving.value = true;
  try {
    const wasNew = !editingId.value;
    const saved = await persistEditorDraft();
    if (!saved) return;
    if (wasNew) {
      ElMessage.success('已保存并生成专家。可继续编辑后使用「保存并发布」，或关闭后从列表发布。');
      // Keep editor open; editingId is set so发布按钮会出现。
    } else {
      editorOpen.value = false;
      ElMessage.success('已保存（未自动发布）');
    }
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function onSaveAndPublish() {
  if (!editingId.value) {
    ElMessage.warning('请先保存新建专家，再发布');
    return;
  }
  if (saving.value || publishingFromEditor.value || iconValidating.value) return;
  const missing = collectPublishMissing();
  if (missing.length) {
    ElMessage.error(formatPublishMissingToast(missing));
    focusPublishMissingField(missing);
    return;
  }
  const currentStatus =
    rows.value.find((row) => row.id === editingId.value)?.status || 'DRAFT';
  const offline = currentStatus === 'OFFLINE';
  try {
    await ElMessageBox.confirm(
      offline
        ? '该专家当前已下架。将先保存当前修改，再发布全部已保存待发布配置并重新上架。确定继续？'
        : '将先保存当前修改，再发布该专家全部已保存的待发布配置（不只是本弹窗字段）。确定？',
      offline ? '保存并重新上架' : '保存并发布',
      { type: 'warning', confirmButtonText: offline ? '保存并重新上架' : '保存并发布' },
    );
  } catch {
    return;
  }
  saving.value = true;
  let saved: OfficialAgentRow | null = null;
  try {
    saved = await persistEditorDraft();
    if (!saved) return;
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, '保存失败'));
    return;
  } finally {
    saving.value = false;
  }
  publishingFromEditor.value = true;
  try {
    const published = await adminOfficialAgentApi.publish(saved.id);
    replaceRow(published);
    await load();
    ElMessage.success('已保存并发布');
    editorOpen.value = false;
  } catch (error) {
    ElMessage.error(`修改已保存，发布失败：${apiErrorMessage(error, '请稍后重试')}`);
  } finally {
    publishingFromEditor.value = false;
  }
}

async function onPublish(row: OfficialAgentRow) {
  if (publishingId.value || saving.value) return;
  const def = row.draft.expertDefinition ?? {};
  const profile = def.profile && typeof def.profile === 'object' ? def.profile as { role?: string } : {};
  const missing = collectPublishMissing({
    name: row.draft.name || '',
    summary: row.draft.summary || '',
    expertRole: String(profile.role || ''),
    systemPrompt: row.draft.systemPrompt || '',
    toolScope: row.draft.toolScope || [],
  });
  if (missing.length) {
    ElMessage.error(formatPublishMissingToast(missing));
    openEdit(row);
    focusPublishMissingField(missing);
    return;
  }
  try {
    await ElMessageBox.confirm(
      '发布后终端将使用当前已保存的待发布配置。确定发布？',
      '发布官方专家',
      { type: 'warning', confirmButtonText: '发布' },
    );
  } catch {
    return;
  }
  publishingId.value = row.id;
  try {
    replaceRow(await adminOfficialAgentApi.publish(row.id));
    await load();
    ElMessage.success('已发布');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '发布失败');
  } finally {
    publishingId.value = '';
  }
}

async function onOffline(row: OfficialAgentRow) {
  try {
    await ElMessageBox.confirm(
      '下架后，所有企业都不能再启动该专家的受控会话，历史版本和授权记录会保留。确定下架？',
      '下架官方专家',
      { type: 'warning', confirmButtonText: '下架', confirmButtonClass: 'el-button--danger' },
    );
  } catch {
    return;
  }
  offlineId.value = row.id;
  try {
    replaceRow(await adminOfficialAgentApi.offline(row.id));
    ElMessage.success('已下架');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '下架失败');
  } finally {
    offlineId.value = '';
  }
}

async function onDelete(row: OfficialAgentRow) {
  const expertName = (row.draft.name || row.key || '').trim() || '未命名专家';
  try {
    // Safe VNodes only — never concatenate unsanitized HTML for the highlighted name.
    await ElMessageBox.confirm(
      h('span', { class: 'official-agent-delete-confirm' }, [
        '确定永久删除专家',
        h(
          'span',
          {
            class: 'official-agent-delete-confirm__name',
            style: {
              color: 'var(--el-color-primary)',
              fontWeight: '600',
            },
          },
          `「${expertName}」`,
        ),
        '吗？将删除该专家的配置、版本与授权记录；不会清除用户历史对话，共享技能也不会被删除。删除后不可恢复。',
      ]),
      '删除官方专家',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      },
    );
  } catch {
    return;
  }
  deletingId.value = row.id;
  try {
    await adminOfficialAgentApi.remove(row.id);
    rows.value = rows.value.filter((item) => item.id !== row.id);
    if (viewerAgent.value?.id === row.id) {
      viewerOpen.value = false;
      viewerAgent.value = null;
    }
    if (editingId.value === row.id) editorOpen.value = false;
    if (discoveryId.value === row.id) discoveryId.value = '';
    await load();
    ElMessage.success('已删除');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  } finally {
    deletingId.value = '';
  }
}




async function onBulkOffline() {
  const ids = selectedRows.value.map((row) => row.id);
  if (!ids.length) return;
  try {
    await ElMessageBox.confirm(
      `将下架 ${ids.length} 个已发布专家。下架后企业目录不可见，受控执行会被拒绝。确定？`,
      '批量下架官方专家',
      { type: 'warning', confirmButtonText: '下架', confirmButtonClass: 'el-button--danger' },
    );
  } catch {
    return;
  }
  bulkOfflineLoading.value = true;
  try {
    const result = await adminOfficialAgentApi.bulkOffline(ids);
    await load();
    selectedRows.value = [];
    tableRef.value?.clearSelection?.();
    ElMessage.success(
      `批量下架完成：下架 ${result.summary.offlined} · 跳过 ${result.summary.skipped} · 错误 ${result.summary.errors}`,
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量下架失败');
  } finally {
    bulkOfflineLoading.value = false;
  }
}





async function openAuditDrawer() {
  auditOpen.value = true;
  await loadAudit();
}

async function loadAudit() {
  auditLoading.value = true;
  try {
    // 用前缀筛出官方专家相关写操作；meta 中含 agentId/versionId/tenant，不含提示词正文。
    const result = await adminAuditApi.list({
      page: 1,
      pageSize: 100,
      actionPrefix: 'admin_',
    });
    auditRows.value = result.rows.filter((row) => row.action.includes('official_agent'));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载审计失败');
  } finally {
    auditLoading.value = false;
  }
}

function goFullAudit() {
  void router.push({ path: '/admin/audit', query: { actionPrefix: 'admin_' } });
}



async function onDiscoverySaved() {
  await load();
  if (!editingId.value) return;
  const row = rows.value.find((item) => item.id === editingId.value);
  if (row) form.openingQuestionsText = (row.draft.openingQuestions ?? []).join('\n');
}

async function onDiscoveryPublished() {
  await onDiscoverySaved();
}

async function openPublishRecords(row: OfficialAgentRow) {
  publishRecordsAgent.value = row;
  publishRecordsOpen.value = true;
  publishRecordsLoading.value = true;
  try {
    const detail = await adminOfficialAgentApi.detail(row.id);
    publishRecordsAgent.value = detail;
    publishRecords.value = [...(detail.versions ?? [])].sort(
      (a, b) => b.version - a.version,
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载发布记录失败');
    publishRecords.value = [];
  } finally {
    publishRecordsLoading.value = false;
  }
}

async function openViewer(row: OfficialAgentRow) {
  viewerOpen.value = true;
  viewerAgent.value = row;
  viewerDiscovery.value = null;
  viewerLoading.value = true;
  try {
    const detail = await adminOfficialAgentApi.detail(row.id);
    viewerAgent.value = detail;
    replaceRow(detail);
    try {
      const discovery = await adminOfficialAgentApi.discovery(row.id);
      viewerDiscovery.value = {
        introduction: discovery.discoveryDetail?.introduction ?? '',
        outputs: discovery.discoveryDetail?.outputs ?? [],
        materials: discovery.discoveryDetail?.materials ?? [],
        boundaries: discovery.discoveryDetail?.boundaries ?? [],
        starters: (discovery.discoveryDetail?.starters ?? []).map((item: { text?: string }) => ({
          text: String(item?.text ?? ''),
        })).filter((item: { text: string }) => item.text),
      };
    } catch {
      // Discovery optional for view; fall back to empty sections.
      viewerDiscovery.value = {
        introduction: '',
        outputs: [],
        materials: [],
        boundaries: [],
        starters: (detail.draft.openingQuestions ?? []).map((text: string) => ({ text })),
      };
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载专家详情失败');
  } finally {
    viewerLoading.value = false;
  }
}

onMounted(load);
onBeforeUnmount(() => {
  window.clearTimeout(searchTimer);
  window.clearTimeout(highlightTimer);
  requestSequence += 1;
});
</script>

<style scoped>
.viewer-longtext {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow: auto;
}
.field-req-hint { margin: 0 0 6px; }
.form-section-title {
  margin: 4px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.form-hint {
  margin-top: 6px;
  color: #8b909b;
  font-size: 12px;
  line-height: 18px;
}
.official-agents-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 15px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  /* Prevent the fixed-ops table from stretching the whole workspace; scroll stays local. */
  overflow-x: hidden;
}

.agent-table-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  /* Contain width so el-table can shrink inside flex/grid ancestors and scroll internally. */
  overflow: hidden;
}

.agent-table-wrap :deep(.el-table) {
  width: 100% !important;
}

.agent-table-wrap :deep(.el-table__inner-wrapper),
.agent-table-wrap :deep(.el-table__header-wrapper),
.agent-table-wrap :deep(.el-table__body-wrapper),
.agent-table-wrap :deep(.el-table__footer-wrapper) {
  /* Element Plus sync-scrolls header/body; ancestors must not force expand. */
  min-width: 0;
}

.agent-table-wrap :deep(.el-table__body-wrapper) {
  overflow-x: auto !important;
}

.page-intro,
.agent-toolbar,
.dialog-agent-summary,
.operation-buttons {
  align-items: center;
  display: flex;
}

.page-intro {
  justify-content: space-between;
  margin-bottom: 18px;
}

.page-intro h2 {
  color: #333946;
  font-size: 18px;
  margin: 0 0 6px;
}

.page-intro p {
  color: #667085;
  font-size: 13px;
  margin: 0;
}

.agent-toolbar {
  flex-wrap: wrap;
  gap: 10px;
}

.keyword-input {
  width: 260px;
}

.status-tabs {
  display: flex;
  flex-wrap: wrap;
  margin: 12px 0 14px;
}

.agent-id {
  color: #98a2b3;
  font-size: 12px;
  line-height: 16px;
  word-break: break-all;
}

:deep(.agent-row-highlight > td.el-table__cell) {
  background: #f3efff !important;
}

:deep(.agent-row-highlight:hover > td.el-table__cell) {
  background: #ebe4ff !important;
}

.status-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.publish-records-summary {
  margin: 0 0 12px;
  color: #667085;
  font-size: 13px;
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  flex-wrap: wrap;
}

.editor-footer .footer-hint {
  color: #667085;
  font-size: 12px;
  line-height: 18px;
}

.editor-footer .footer-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

.product-version-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}
.product-version-cell.inline {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.product-version-label {
  font-weight: 600;
}
.product-publish-seq {
  font-size: 12px;
}
.version-tip {
  margin-top: 16px;
}

.agent-identity {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.agent-identity-text {
  min-width: 0;
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

.editor-avatar-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  width: 100%;
}

.editor-avatar-actions {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 220px;
}

.editor-avatar-tip {
  line-height: 1.4;
}

.editor-avatar-preview {
  flex: none;
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

.viewer-source-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
  min-width: 0;
}

.viewer-source-row :deep(.el-radio-group) {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: nowrap;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
}

.viewer-source-label {
  color: #667085;
  font-size: 13px;
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

/* 操作列：表头与按钮组始终水平居中；按钮数量变化/换行时每行仍居中 */
.agent-table .operation-buttons,
.operation-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  align-content: center;
  gap: 4px;
  width: 100%;
  margin: 0;
  white-space: normal;
}

.operation-buttons :deep(.el-button.is-text),
.agent-table .operation-buttons :deep(.el-button.is-text) {
  padding-inline: 2px;
  margin: 0;
}

.operation-buttons :deep(.el-button + .el-button) {
  margin-left: 0;
}

/* 仅收紧专家列表操作列左右留白，不改全局 el-table；表头/单元格内容居中 */
:deep(.agent-ops-col.el-table__cell),
:deep(th.agent-ops-col),
:deep(.el-table__header th.agent-ops-col .cell),
:deep(.el-table__body td.agent-ops-col .cell) {
  padding-left: 6px;
  padding-right: 6px;
  text-align: center;
}

:deep(.el-table__body td.agent-ops-col .cell) {
  display: flex;
  justify-content: center;
  align-items: center;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.agent-form {
  margin-top: 20px;
}

.dialog-agent-summary {
  gap: 12px;
  margin-bottom: 16px;
}

.dialog-agent-summary span {
  color: #667085;
  font-size: 13px;
}



.version-select {
  width: 230px;
}

.version-detail {
  padding: 12px 20px;
  color: #667085;
  font-size: 13px;
  line-height: 1.7;
}

.version-detail pre {
  background: #f8fafc;
  color: #333946;
  font-family: inherit;
  margin: 8px 0 0;
  padding: 12px;
  white-space: pre-wrap;
}

@media (max-width: 768px) {
  .page-intro {
    align-items: stretch;
    flex-direction: column;
    gap: 12px;
  }

  .agent-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .keyword-input {
    width: 100%;
  }

  .pagination-row {
    justify-content: flex-start;
    overflow-x: auto;
  }
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}





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

.tenant-select {
  min-width: 260px;
  width: 320px;
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

/* 新建/编辑：EP align-center 视口水平垂直居中；小屏限高，仅 body 滚动，标题/底部按钮固定 */
.el-dialog.official-agent-editor {
  display: flex;
  flex-direction: column;
  margin: auto !important;
  max-height: calc(100dvh - 96px);
  max-width: calc(100vw - 32px);
}

.el-dialog.official-agent-editor.is-align-center {
  margin: auto !important;
}

.official-agent-editor .el-dialog__header,
.official-agent-editor .el-dialog__footer {
  flex-shrink: 0;
}

.official-agent-editor .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
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

.official-agent-audit .el-drawer__header {
  border-bottom: 1px solid #e4e7ed;
  gap: 12px;
  margin-bottom: 0;
  padding: 16px;
}

.official-agent-audit .el-drawer__body {
  padding: 12px 16px 16px;
}

@media (max-width: 768px) {
  .official-agent-dialog {
    width: calc(100vw - 32px) !important;
  }

  .el-dialog.official-agent-viewer,
  .el-dialog.official-agent-history,
  .el-dialog.official-agent-editor {
    margin: auto !important;
    max-height: calc(100dvh - 48px);
  }

  .el-dialog.official-agent-viewer.is-align-center,
  .el-dialog.official-agent-history.is-align-center,
  .el-dialog.official-agent-editor.is-align-center {
    margin: auto !important;
  }
}
</style>

<style>
.el-dialog.official-agent-dialog { border-radius: 10px; }
</style>
