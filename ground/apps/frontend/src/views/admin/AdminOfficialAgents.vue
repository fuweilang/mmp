<template>
  <section class="official-agents-page">
    <div class="page-intro">
      <div>
        <h2>专家配置</h2>
        <p>维护官方专家草稿、发布与企业授权。</p>
      </div>
      <div class="header-actions">
        <el-button @click="openAuditDrawer">运营审计</el-button>
        <el-button @click="openImport">导入资产</el-button>
        <el-button type="primary" @click="openCreate">新建专家</el-button>
      </div>
    </div>

    <div class="agent-toolbar">
      <el-input
        v-model="keyword"
        class="keyword-input"
        clearable
        placeholder="搜索名称、标识或简介"
        :prefix-icon="Search"
        @input="onSearchInput"
        @clear="onSearchNow"
        @keyup.enter="onSearchNow"
      />
      <el-select
        v-model="statusFilter"
        class="status-select"
        clearable
        placeholder="全部状态"
        @change="onSearchNow"
        @clear="onSearchNow"
      >
        <el-option label="草稿" value="DRAFT" />
        <el-option label="已发布" value="PUBLISHED" />
        <el-option label="已下架" value="OFFLINE" />
      </el-select>
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

    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="pagedRows"
      border
      class="agent-table"
      row-key="id"
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
          <el-tag size="small" :type="statusType(row.status)">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="activeGrantCount" label="已开通企业" width="110" align="center" />
      <el-table-column label="创建时间" min-width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" min-width="170">
        <template #default="{ row }">{{ formatDate(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="410" fixed="right" align="center">
        <template #default="{ row }">
          <div class="operation-buttons">
            <el-button text type="primary" @click="openViewer(row)">查看</el-button>
            <el-button text type="primary" @click="discoveryId = row.id">广场详情</el-button>
            <el-button text type="primary" @click="openEdit(row)">编辑草稿</el-button>
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
            <el-button text type="primary" @click="openGrants(row)">企业授权</el-button>
          </div>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="hasFilters ? '没有符合条件的专家' : '还没有官方专家'">
          <el-button v-if="!hasFilters" type="primary" @click="openCreate">新建专家</el-button>
        </el-empty>
      </template>
    </el-table>

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
      :title="editingId ? '编辑专家草稿' : '新建官方专家'"
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
      <el-alert
        v-if="editingId"
        type="warning"
        :closable="false"
        title="此处只编辑草稿。保存后如需对外生效，请再点发布。"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" class="agent-form" :disabled="saving">
        <el-form-item label="图标">
          <CatalogIconEditor v-model="pendingIcon" v-model:removed="removeIcon" :current-url="formAvatarUrl" :disabled="saving" @validating="iconValidating=$event" />
          <div class="muted">图标属于独立展示信息，保存图标不发布或启用专家；专家正文仍需按原规则发布。</div>
        </el-form-item>
        <el-form-item label="标识" prop="key">
          <el-input
            v-model="form.key"
            :disabled="Boolean(editingId)"
            maxlength="64"
            placeholder="可留空自动生成，例如 copy-polish-master"
          />
        </el-form-item>
        <el-form-item label="类型" prop="kind">
          <el-radio-group v-model="form.kind" :disabled="Boolean(editingId)">
            <el-radio value="GENERAL">通用型</el-radio>
            <el-radio value="KNOWLEDGE">资料型</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="80" show-word-limit />
        </el-form-item>
        <el-form-item label="用途" prop="summary">
          <el-input
            v-model="form.summary"
            type="textarea"
            :rows="3"
            maxlength="1000"
            show-word-limit
            placeholder="用于广场卡片和详情展示"
          />
        </el-form-item>
        <el-form-item label="开场问题" prop="openingQuestionsText">
          <el-input
            v-model="form.openingQuestionsText"
            type="textarea"
            :rows="4"
            placeholder="每行一个，最多 8 个"
          />
        </el-form-item>
        <el-form-item label="角色定位" prop="expertRole">
          <el-input v-model="form.expertRole" placeholder="例如：负责关账计划与财务报告复核的财务负责人" maxlength="200" />
        </el-form-item>
        <el-form-item label="工作流程">
          <el-input v-model="form.workflowText" type="textarea" :rows="3" placeholder="每行一步；可留空，沿用角色指令中的流程" />
        </el-form-item>
        <el-form-item label="交付标准">
          <el-input v-model="form.deliverablesText" type="textarea" :rows="3" placeholder="每行一项交付物或验收标准" />
        </el-form-item>
        <el-form-item label="角色指令" prop="systemPrompt">
          <el-input
            v-model="form.systemPrompt"
            type="textarea"
            :rows="8"
            maxlength="50000"
            placeholder="仅平台 Admin 可见，不会进入公开目录"
          />
        </el-form-item>
        <el-form-item label="工具范围" prop="toolScopeText">
          <el-input
            v-model="form.toolScopeText"
            type="textarea"
            :rows="3"
            placeholder="每行一个工具标识；通用型可留空，资料检索使用 enterprise_knowledge"
          />
        </el-form-item>
        <el-form-item label="广场分类" prop="category">
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
            placeholder="每行一个中文能力标签；工具能力由 toolScope 自动派生"
          />
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
          <div class="form-hint">可不关联技能。新会话按已发布专家版本冻结启用技能摘要；正文仍按需加载，不自动授予工具权限。</div>
          <ul v-if="selectedSkillPreviews.length" class="linked-skill-previews">
            <li v-for="skill in selectedSkillPreviews" :key="skill.id"><strong>{{ skill.name }}</strong><span>{{ skill.summary }}</span></li>
          </ul>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="saving" @click="editorOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="iconValidating" @click="onSave">保存草稿</el-button>
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
          title="只读查看当前草稿内容；本弹窗不会改动任何配置。"
        />

        <el-descriptions :column="1" border class="viewer-descriptions" size="small">
          <el-descriptions-item label="名称">{{ viewerDisplay.name || '—' }}</el-descriptions-item>
          <el-descriptions-item label="简介">{{ viewerDisplay.summary || '—' }}</el-descriptions-item>
          <el-descriptions-item label="广场分类">{{ categoryLabel(viewerAgent.category) }}</el-descriptions-item>
          <el-descriptions-item label="能力标签">
            <div v-if="viewerCapabilityLabels.length" class="viewer-chip-row">
              <el-tag
                v-for="label in viewerCapabilityLabels"
                :key="label"
                size="small"
                effect="plain"
              >
                {{ label }}
              </el-tag>
            </div>
            <span v-else class="muted">未设置</span>
          </el-descriptions-item>
          <el-descriptions-item label="工具 / 知识库范围">
            <div v-if="viewerDisplay.toolScope.length" class="viewer-chip-row">
              <el-tag
                v-for="tool in viewerDisplay.toolScope"
                :key="tool"
                size="small"
                effect="plain"
                type="info"
              >
                {{ toolScopeLabel(tool) }}
              </el-tag>
            </div>
            <span v-else class="muted">未声明工具（通用对话）</span>
          </el-descriptions-item>
          <el-descriptions-item label="开场问题">
            <ol v-if="viewerDisplay.openingQuestions.length" class="viewer-questions">
              <li v-for="(question, index) in viewerDisplay.openingQuestions" :key="`${index}-${question}`">
                {{ question }}
              </li>
            </ol>
            <span v-else class="muted">未设置</span>
          </el-descriptions-item>
          <el-descriptions-item label="角色定位">{{ viewerDefinition.profile?.role || viewerDisplay.name }}</el-descriptions-item>
          <el-descriptions-item v-if="viewerDefinition.workflow?.length" label="工作流程"><ol><li v-for="step in viewerDefinition.workflow" :key="step">{{ step }}</li></ol></el-descriptions-item>
          <el-descriptions-item v-if="viewerDefinition.deliverables?.length" label="交付标准"><ul><li v-for="item in viewerDefinition.deliverables" :key="item">{{ item }}</li></ul></el-descriptions-item>
          <el-descriptions-item label="关联技能">
            <ul v-if="viewerAgent.linkedSkills?.length" class="linked-skill-previews"><li v-for="skill in viewerAgent.linkedSkills" :key="skill.id"><strong>{{ skill.name }} · r{{ skill.packageRevision }}{{ skill.enabledAt ? '' : ' · 已停用' }}</strong><span>{{ skill.summary }}</span></li></ul>
            <span v-else class="muted">未关联技能（有效配置）</span>
          </el-descriptions-item>
          <el-descriptions-item v-if="viewerDefinition.source?.repository" label="来源 / 许可">
            {{ viewerDefinition.source.repository }} · {{ viewerDefinition.license?.spdx || '待确认' }}
            <div class="agent-key">{{ viewerDefinition.source.ref }}</div>
          </el-descriptions-item>
          <el-descriptions-item v-if="viewerDefinition.adaptation?.notes?.length" label="宿主适配"><ul><li v-for="note in viewerDefinition.adaptation.notes" :key="note">{{ note }}</li></ul></el-descriptions-item>
          <el-descriptions-item label="角色指令">
            <pre class="viewer-prompt">{{ viewerDisplay.systemPrompt || '—' }}</pre>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatDate(viewerAgent.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ formatDate(viewerAgent.updatedAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="已开通企业">
            {{ viewerAgent.activeGrantCount }}
          </el-descriptions-item>
        </el-descriptions>
      </template>
      </div>
      <template #footer>
        <el-button @click="viewerOpen = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="grantsOpen"
      title="企业授权"
      width="880px"
      class="official-agent-dialog"
      align-center
      append-to-body
      :close-on-click-modal="false"
    >
      <template v-if="selectedAgent">
        <div class="dialog-agent-summary">
          <strong>{{ selectedAgent.draft.name }}</strong>
          <span>{{ statusLabel(selectedAgent.status) }}</span>
        </div>
        <el-alert
          v-if="selectedAgent.status !== 'PUBLISHED'"
          type="warning"
          :closable="false"
          title="专家未处于已发布状态，不能新开通；已有撤销记录仍可查看。"
        />
        <el-form v-else class="grant-form" inline @submit.prevent>
          <el-form-item label="试点企业">
            <el-select
              v-model="grantForm.tenantIds"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              class="tenant-select"
              placeholder="可多选企业"
            >
              <el-option
                v-for="tenant in availableEnterprises"
                :key="tenant.id"
                :label="tenant.name"
                :value="tenant.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="grantSaving" @click="onGrant">批量开通</el-button>
          </el-form-item>
        </el-form>
        <div v-if="selectedAgent.status === 'PUBLISHED'" class="bulk-revoke-row">
          <el-select
            v-model="revokeTenantIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            class="tenant-select"
            placeholder="选择已开通企业批量撤销"
          >
            <el-option
              v-for="grant in activeGrants"
              :key="grant.id"
              :label="grant.tenant.name"
              :value="grant.tenant.id"
            />
          </el-select>
          <el-button
            type="danger"
            plain
            :disabled="!revokeTenantIds.length"
            :loading="bulkRevokeLoading"
            @click="onBulkRevoke"
          >
            批量撤销（{{ revokeTenantIds.length }}）
          </el-button>
        </div>

        <el-table :data="selectedAgent.grants" border class="grant-table">
          <el-table-column label="企业" min-width="150">
            <template #default="{ row }">
              <div>{{ row.tenant.name }}</div>
              <div class="agent-key">{{ row.tenant.slug }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.status === 'ACTIVE' ? 'success' : 'info'">
                {{ row.status === 'ACTIVE' ? '已开通' : '已撤销' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" align="center">
            <template #default="{ row }">
              <div v-if="row.status === 'ACTIVE'" class="operation-buttons">
                <el-button
                  text
                  type="danger"
                  :loading="revokingId === row.id"
                  @click="onRevoke(row)"
                >
                  撤销
                </el-button>
              </div>
              <span v-else class="muted">{{ formatDate(row.revokedAt) }}</span>
            </template>
          </el-table-column>
          <template #empty><el-empty description="尚未开通试点企业" /></template>
        </el-table>
      </template>
      <template #footer><el-button @click="grantsOpen = false">关闭</el-button></template>
    </el-dialog>


    <el-dialog
      v-model="importOpen"
      title="从资产包导入草稿"
      width="820px"
      class="official-agent-dialog"
      align-center
      append-to-body
      :close-on-click-modal="false"
    >
      <el-alert
        type="info"
        :closable="false"
        title="按 key 幂等导入草稿：不存在则创建；任何同 key 已有记录均保留，不覆盖管理员内容。不会自动发布。"
      />
      <div class="import-toolbar">
        <el-button text type="primary" @click="selectAllImportKeys">全选</el-button>
        <el-button text @click="importKeys = []">清空</el-button>
        <span class="muted">已选 {{ importKeys.length }} / {{ assetCatalog.length }}</span>
      </div>
      <el-table
        :data="assetCatalog"
        border
        height="360"
        row-key="key"
        @selection-change="onImportSelectionChange"
        ref="importTableRef"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="key" label="标识" min-width="140" />
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column label="批次" width="80">
          <template #default="{ row }">{{ row.batch || '—' }}</template>
        </el-table-column>
        <el-table-column label="现有状态" width="120">
          <template #default="{ row }">
            <span v-if="!row.existing" class="muted">未导入</span>
            <el-tag v-else size="small" :type="statusType(row.existing.status)">
              {{ statusLabel(row.existing.status) }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-alert
        v-if="importResult"
        class="import-result"
        :closable="false"
        type="success"
        :title="`导入完成：创建 ${importResult.summary.created} · 更新 ${importResult.summary.updated} · 补空 ${importResult.summary.filled} · 跳过 ${importResult.summary.skipped} · 错误 ${importResult.summary.errors}`"
      />
      <el-table v-if="importResult" :data="importResult.results" border class="import-result-table" max-height="220">
        <el-table-column prop="key" label="key" min-width="140" />
        <el-table-column prop="action" label="结果" width="100" />
        <el-table-column prop="reason" label="说明" min-width="180" />
      </el-table>
      <template #footer>
        <el-button :disabled="importing" @click="importOpen = false">关闭</el-button>
        <el-button type="primary" :loading="importing" :disabled="!importKeys.length" @click="onImport">
          导入所选
        </el-button>
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
    <CatalogDiscoveryEditor v-if="discoveryId" kind="expert" :resource-id="discoveryId" @close="discoveryId=''" @saved="load" />
  </section>
</template>

<script setup lang="ts">
import CatalogDiscoveryEditor from '../../components/CatalogDiscoveryEditor.vue';
const discoveryId=ref('');
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type TagProps } from 'element-plus';
import { Search, UserRound } from 'lucide-vue-next';
import CatalogIconEditor from '../../components/CatalogIconEditor.vue';
import { AuditActionLabel } from '@mammoth/shared';
import {
  adminAuditApi,
  adminEnterpriseApi,
  adminOfficialAgentApi,
  adminOfficialSkillApi,
  type AdminAuditRow,
  type AdminEnterpriseRow,
  type OfficialAgentAssetCatalogItem,
  type OfficialAgentCategory,
  type OfficialAgentGrant,
  type OfficialAgentImportResult,
  type OfficialAgentKind,
  type OfficialAgentRow,
  type ExpertDefinition,
  type OfficialAgentStatus,
  type OfficialSkillOption,
} from '../../api/admin';
import { formatAgentDateTime } from './official-agent-version-presentation';

const router = useRouter();

const rows = ref<OfficialAgentRow[]>([]);
const enterprises = ref<AdminEnterpriseRow[]>([]);
const loading = ref(false);
const keyword = ref('');
const statusFilter = ref<OfficialAgentStatus | ''>('');
const currentPage = ref(1);
const pageSize = ref(10);
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
const grantsOpen = ref(false);
const viewerOpen = ref(false);
const viewerLoading = ref(false);
const brokenAvatarIds = reactive<Record<string, boolean>>({});
const selectedAgent = ref<OfficialAgentRow | null>(null);
const viewerAgent = ref<OfficialAgentRow | null>(null);
const grantSaving = ref(false);
const revokingId = ref('');
const formRef = ref<FormInstance>();
const tableRef = ref();
const selectedRows = ref<OfficialAgentRow[]>([]);
const bulkOfflineLoading = ref(false);
const importOpen = ref(false);
const importing = ref(false);
const assetCatalog = ref<OfficialAgentAssetCatalogItem[]>([]);
const importKeys = ref<string[]>([]);
const importResult = ref<OfficialAgentImportResult | null>(null);
const importTableRef = ref();
const revokeTenantIds = ref<string[]>([]);
const bulkRevokeLoading = ref(false);
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
  toolScopeText: '',
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

const grantForm = reactive({ tenantIds: [] as string[], versionId: '' });

const rules: FormRules = {
  key: [
    { pattern: /^[a-z][a-z0-9-]{1,63}$/, message: '使用小写字母、数字和连字符，并以字母开头', trigger: 'blur' },
  ],
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  summary: [{ required: true, whitespace: true, message: '请输入用途', trigger: 'blur' }],
  expertRole: [{ required: true, whitespace: true, message: '请输入角色定位', trigger: 'blur' }],
  systemPrompt: [{ required: true, message: '请输入执行提示词', trigger: 'blur' }],
};

const hasFilters = computed(() => Boolean(keyword.value.trim() || statusFilter.value));
const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return rows.value.slice(start, start + pageSize.value);
});
const availableEnterprises = computed(() => enterprises.value.filter(
  (tenant) => tenant.type === 'ENTERPRISE' && tenant.status === 'active',
));
const activeGrants = computed(() =>
  (selectedAgent.value?.grants ?? []).filter((grant) => grant.status === 'ACTIVE'),
);

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
    DRAFT: '草稿',
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

async function load() {
  const sequence = ++requestSequence;
  loading.value = true;
  try {
    const result = await adminOfficialAgentApi.list({
      keyword: keyword.value.trim(),
      status: statusFilter.value,
    });
    if (sequence === requestSequence) rows.value = result;
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
  statusFilter.value = '';
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
  form.toolScopeText = '';
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
  form.toolScopeText = row.draft.toolScope.join('\n');
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
  if (selectedAgent.value?.id === next.id) selectedAgent.value = next;
  if (editingId.value === next.id && editorOpen.value) {
    formAvatarUrl.value = next.avatarUrl;
  }
}

async function onSave() {
  if(saving.value || iconValidating.value)return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    const draft = {
      name: form.name.trim(),
      summary: form.summary.trim(),
      openingQuestions: splitLines(form.openingQuestionsText),
      systemPrompt: form.systemPrompt.trim(),
      toolScope: splitLines(form.toolScopeText),
      ...(form.category ? { category: form.category } : {}),
      capabilities: splitLines(form.capabilitiesText),
      linkedSkillIds: form.linkedSkillIds,
      expertDefinition: {
        ...baseDefinition.value,
        profile: { ...baseDefinition.value.profile, role: form.expertRole.trim(), mission: form.summary.trim() },
        workflow: splitLines(form.workflowText), deliverables: splitLines(form.deliverablesText),
      },
    };
    const wasNew=!editingId.value;
    let next:OfficialAgentRow|undefined;
    if(wasNew || editorFields()!==editorBaseline){
      next=editingId.value?await adminOfficialAgentApi.update(editingId.value,draft):await adminOfficialAgentApi.create({...draft,key:form.key.trim()||`expert-${crypto.randomUUID().slice(0,12)}`,kind:form.kind});
      editingId.value=next.id;editorBaseline=editorFields();replaceRow(next);
    }
    if(pendingIcon.value){const body=new FormData();body.append('file',pendingIcon.value);next=await adminOfficialAgentApi.uploadAvatar(editingId.value,body);}
    else if(removeIcon.value){next=await adminOfficialAgentApi.removeAvatar(editingId.value);}
    if(next){replaceRow(next);if(viewerAgent.value?.id===next.id)viewerAgent.value=next;delete brokenAvatarIds[next.id];}
    clearIconDraft();
    if(wasNew)await load();
    editorOpen.value=false;
    ElMessage.success('已保存（未自动发布或启用）');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onPublish(row: OfficialAgentRow) {
  try {
    await ElMessageBox.confirm(
      '将当前草稿发布上线。已开通企业仍沿用各自授权配置。确定发布？',
      '发布官方专家',
      { type: 'warning', confirmButtonText: '发布' },
    );
  } catch {
    return;
  }
  publishingId.value = row.id;
  try {
    replaceRow(await adminOfficialAgentApi.publish(row.id));
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

async function openGrants(row: OfficialAgentRow) {
  selectedAgent.value = row;
  grantForm.tenantIds = [];
  grantForm.versionId = row.onlineVersion?.id ?? '';
  revokeTenantIds.value = [];
  grantsOpen.value = true;
  try {
    enterprises.value = await adminEnterpriseApi.list();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载企业列表失败');
  }
}


async function onGrant() {
  const agent = selectedAgent.value;
  if (!agent || !grantForm.tenantIds.length || !grantForm.versionId) {
    ElMessage.warning('请选择试点企业');
    return;
  }
  grantSaving.value = true;
  try {
    if (grantForm.tenantIds.length === 1) {
      replaceRow(await adminOfficialAgentApi.grant(agent.id, {
        tenantId: grantForm.tenantIds[0],
        versionId: grantForm.versionId,
      }));
      ElMessage.success('企业授权已保存');
    } else {
      const result = await adminOfficialAgentApi.bulkGrant(agent.id, {
        tenantIds: grantForm.tenantIds,
        versionId: grantForm.versionId,
      });
      replaceRow(result.agent);
      ElMessage.success(
        `批量开通完成：新增 ${result.summary.granted} · 恢复 ${result.summary.reactivated} · 升级 ${result.summary.upgraded} · 跳过 ${result.summary.skipped} · 错误 ${result.summary.errors}`,
      );
    }
    grantForm.tenantIds = [];
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '开通失败');
  } finally {
    grantSaving.value = false;
  }
}

async function onBulkRevoke() {
  const agent = selectedAgent.value;
  if (!agent || !revokeTenantIds.value.length) return;
  try {
    await ElMessageBox.confirm(
      `将撤销 ${revokeTenantIds.value.length} 家企业的授权，后续会话启动会被拒绝。确定？`,
      '批量撤销企业授权',
      { type: 'warning', confirmButtonText: '撤销', confirmButtonClass: 'el-button--danger' },
    );
  } catch {
    return;
  }
  bulkRevokeLoading.value = true;
  try {
    const result = await adminOfficialAgentApi.bulkRevoke(agent.id, {
      tenantIds: revokeTenantIds.value,
    });
    replaceRow(result.agent);
    revokeTenantIds.value = [];
    ElMessage.success(
      `批量撤销完成：撤销 ${result.summary.revoked} · 跳过 ${result.summary.skipped} · 错误 ${result.summary.errors}`,
    );
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '批量撤销失败');
  } finally {
    bulkRevokeLoading.value = false;
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

async function openImport() {
  importOpen.value = true;
  importResult.value = null;
  importKeys.value = [];
  try {
    assetCatalog.value = await adminOfficialAgentApi.assetCatalog();
    await nextTick();
    importTableRef.value?.clearSelection?.();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载资产目录失败');
  }
}

function onImportSelectionChange(rowsSelected: OfficialAgentAssetCatalogItem[]) {
  importKeys.value = rowsSelected.map((row) => row.key);
}

function selectAllImportKeys() {
  importTableRef.value?.toggleAllSelection?.();
}

async function onImport() {
  if (!importKeys.value.length) {
    ElMessage.warning('请选择要导入的资产');
    return;
  }
  importing.value = true;
  try {
    importResult.value = await adminOfficialAgentApi.importAssets({ keys: importKeys.value });
    await load();
    assetCatalog.value = await adminOfficialAgentApi.assetCatalog();
    ElMessage.success('资产导入完成（仅草稿，未自动发布）');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导入失败');
  } finally {
    importing.value = false;
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


async function onRevoke(grant: OfficialAgentGrant) {
  const agent = selectedAgent.value;
  if (!agent) return;
  try {
    await ElMessageBox.confirm(
      `撤销后，「${grant.tenant.name}」的后续会话启动和执行请求将被拒绝。确定撤销？`,
      '撤销企业授权',
      { type: 'warning', confirmButtonText: '撤销', confirmButtonClass: 'el-button--danger' },
    );
  } catch {
    return;
  }
  revokingId.value = grant.id;
  try {
    replaceRow(await adminOfficialAgentApi.revoke(agent.id, grant.tenant.id));
    ElMessage.success('已撤销企业授权');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '撤销失败');
  } finally {
    revokingId.value = '';
  }
}


async function openViewer(row: OfficialAgentRow) {
  viewerOpen.value = true;
  viewerAgent.value = row;
  viewerLoading.value = true;
  try {
    // Refresh from Admin detail; query-only, no mutation.
    const detail = await adminOfficialAgentApi.detail(row.id);
    viewerAgent.value = detail;
    replaceRow(detail);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载专家详情失败');
  } finally {
    viewerLoading.value = false;
  }
}

onMounted(load);
onBeforeUnmount(() => {
  window.clearTimeout(searchTimer);
  requestSequence += 1;
});
</script>

<style scoped>
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
  box-sizing: border-box;
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

.status-select {
  width: 140px;
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

.agent-table,
.grant-table {
  margin-top: 18px;
  width: 100%;
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

.operation-buttons {
  flex-wrap: wrap;
  gap: 2px 4px;
  justify-content: center;
  white-space: nowrap;
}

.operation-buttons :deep(.el-button.is-text) {
  padding-inline: 4px;
}

.operation-buttons :deep(.el-button + .el-button) {
  margin-left: 0;
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

.grant-form {
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 12px;
}

.tenant-select {
  width: 210px;
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

  .keyword-input,
  .status-select {
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

.bulk-revoke-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 12px;
}

.import-toolbar {
  align-items: center;
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.import-result {
  margin-top: 14px;
}

.import-result-table {
  margin-top: 10px;
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

.official-agent-editor {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 48px);
}

.official-agent-editor .el-dialog__header,
.official-agent-editor .el-dialog__footer {
  flex-shrink: 0;
}

.official-agent-editor .el-dialog__body {
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
  .el-dialog.official-agent-history {
    margin: 24px auto !important;
    max-height: calc(100dvh - 48px);
  }

  .el-dialog.official-agent-viewer.is-align-center,
  .el-dialog.official-agent-history.is-align-center {
    margin: 24px auto !important;
  }
}
</style>

<style>
.el-dialog.official-agent-dialog { display: flex; flex-direction: column; border-radius: 10px; max-height: calc(100dvh - 48px); }
.el-dialog.official-agent-dialog.is-align-center { margin: 0 auto !important; }
.official-agent-dialog .el-dialog__header, .official-agent-dialog .el-dialog__footer { flex-shrink: 0; }
.official-agent-dialog .el-dialog__body { min-height: 0; overflow-y: auto; }
</style>
