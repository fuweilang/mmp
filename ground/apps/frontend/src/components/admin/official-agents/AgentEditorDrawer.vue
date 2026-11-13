<template>
  <el-dialog
    :model-value="modelValue"
    :title="editingId ? '编辑专家' : '新建官方专家'"
    fullscreen
    class="official-agent-dialog official-agent-editor expert-workspace"
    destroy-on-close
    :before-close="requestEditorClose"
    :close-on-press-escape="!editorBusy"
    :show-close="false"
    @update:model-value="onDialogModelValue"
    @closed="clearIconDraft"
    append-to-body
    :close-on-click-modal="false"
  >
    <template #header="{ titleId }">
      <div class="expert-workspace-header">
        <el-button class="expert-back-button" text aria-label="返回专家列表" :disabled="editorBusy || editorPreviewBusy" @click="requestEditorClose()"><ArrowLeft :size="20" /></el-button>
        <div class="expert-header-avatar" aria-hidden="true"><img v-if="editorAvatarUrl" :src="editorAvatarUrl" alt="" /><UserRound v-else :size="22" /></div>
        <div class="expert-workspace-identity">
          <h1 :id="titleId" class="expert-sr-only">{{ editingId ? '编辑专家' : '新建官方专家' }}</h1>
          <button type="button" class="expert-name-button" :disabled="editorBusy" @click="openMetadata"><span>{{ form.name || '未命名专家' }}</span><SquarePen :size="14" /></button>
          <p>{{ form.summary || '添加专家简介' }}</p>
        </div>
        <div class="expert-workspace-save">
          <span role="status">{{ editorDirty ? '有未保存修改' : editingId ? '草稿已保存' : '尚未保存草稿' }}</span>
          <el-button class="expert-document-button" :disabled="editorBusy || !editingId" @click="emit('discovery', editingId)"><FileText :size="14" />专家介绍</el-button>
          <el-button class="expert-save-button" type="primary" aria-label="保存草稿" :loading="saving && !editorPreviewBusy" :disabled="editorBusy || editorPreviewBusy || iconValidating" @click="onSave">保存</el-button>
          <el-dropdown trigger="click" :disabled="editorBusy || editorPreviewBusy" @command="onEditorCommand">
            <el-button text class="expert-more-button" aria-label="更多专家操作" :disabled="editorBusy"><EllipsisVertical :size="20" /></el-button>
            <template #dropdown><el-dropdown-menu><el-dropdown-item command="details">编辑专家信息</el-dropdown-item><el-dropdown-item v-if="editingId" command="publish" :disabled="editorBusy || iconValidating || !!executionBlockers.length">保存并发布</el-dropdown-item></el-dropdown-menu></template>
          </el-dropdown>
        </div>
      </div>
    </template>
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="agent-form expert-workspace-grid" :disabled="editorBusy" @submit.prevent>
      <section class="expert-personalization-panel" aria-label="个性化配置">
        <div class="expert-panel-heading"><h2>个性化</h2><el-tooltip content="描述专家的角色、工作方式和回答要求。"><CircleHelp :size="13" class="expert-help-icon" /></el-tooltip></div>
        <el-form-item label="专家指令" prop="systemPrompt" class="expert-prompt-field">
          <el-input v-model="form.systemPrompt" aria-label="专家指令" type="textarea" :rows="18" resize="none" maxlength="60000" show-word-limit placeholder="描述智能体的设定以及工作方式。" />
        </el-form-item>
        <el-dialog v-model="metadataOpen" title="编辑专家" width="388px" class="expert-metadata-dialog" align-center append-to-body :close-on-click-modal="false" :close-on-press-escape="!editorBusy" :show-close="!editorBusy">
      <el-form-item label="专家头像" class="expert-metadata-avatar">
        <CatalogIconEditor profile="expert" v-model="pendingIcon" v-model:removed="removeIcon" :current-url="formAvatarUrl" :disabled="editorBusy || editorPreviewBusy" @validating="iconValidating=$event" @preview-change="draftAvatarUrl=$event" />
      </el-form-item>
      <el-form-item label="名称" prop="name" required>
        <el-input v-model="form.name" aria-label="专家名称" maxlength="80" show-word-limit />
      </el-form-item>
      <el-form-item label="描述（选填）" prop="summary">
        <el-input
          v-model="form.summary"
          aria-label="一句话介绍"
          type="textarea"
          :rows="2"
          maxlength="1000"
          show-word-limit
          placeholder="用于广场卡片与详情首屏"
        />
      </el-form-item>
        <el-collapse v-model="metadataSections" class="expert-metadata-more">
          <el-collapse-item title="更多设置" name="more">
        <el-collapse v-model="identityOpen">
          <el-collapse-item title="分类与能力标签" name="identity">
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



          </el-collapse-item>
          <el-collapse-item title="角色、流程与交付要求" name="workflow">
      <el-form-item label="类型" prop="kind">
        <el-radio-group v-model="form.kind" :disabled="editorBusy || editorPreviewBusy || Boolean(editingId)">
          <el-radio value="GENERAL">通用型</el-radio>
          <el-radio value="KNOWLEDGE">资料型</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="角色定位" prop="expertRole">
        <div class="form-hint field-req-hint">发布必填；保存草稿可暂空。</div>
        <el-input v-model="form.expertRole" placeholder="例如：负责关账计划与财务报告复核的财务负责人" maxlength="200" />
      </el-form-item>
      <el-form-item label="流程">
        <el-input v-model="form.workflowText" type="textarea" :rows="3" placeholder="每行一步；可留空" />
      </el-form-item>
      <el-form-item label="交付标准">
        <el-input v-model="form.deliverablesText" type="textarea" :rows="3" placeholder="每行一项交付物或验收标准" />
      </el-form-item>

          </el-collapse-item>
        </el-collapse>
        <el-collapse v-model="advancedOpen">
          <el-collapse-item title="高级：自动标识" name="advanced">
            <el-form-item label="标识" prop="key"><el-input v-model="form.key" :disabled="editorBusy || editorPreviewBusy || Boolean(editingId)" maxlength="64" placeholder="可留空自动生成；创建后只读" /></el-form-item>
            <el-form-item v-if="form.toolScope.length" label="已有工具权限" prop="toolScope">
              <p class="form-hint">保留历史配置；取消勾选可移除已有权限。</p>
              <el-checkbox-group v-model="form.toolScope" class="expert-tool-options">
                <el-checkbox v-for="tool in existingToolOptions" :key="tool.value" :value="tool.value">{{ tool.label }}</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
          </el-collapse-item>
        </el-collapse>
          </el-collapse-item>
        </el-collapse>
        <template #footer><el-button type="primary" :disabled="editorBusy || iconValidating" @click="metadataOpen=false">确认</el-button></template>
        </el-dialog>
      </section>
      <section class="expert-capabilities-panel" aria-label="专家能力配置">
        <ExpertExecutionEditor v-if="open" ref="executionEditor" v-model="form.executionConfig" :expert-id="editingId" :expert-name="form.name" :disabled="editorBusy" :tool-scope="form.toolScope" :skills="executionSkillDependencies" @blockers="executionBlockers=$event" @knowledge-changed="editorKnowledgeRevision++">
          <template #skills>
            <div v-for="skill in selectedSkillPreviews" :key="skill.id" class="expert-selected-skill">
              <span class="expert-skill-glyph"><Box :size="14" /></span><span class="expert-skill-name">{{ skill.name }}</span>
              <el-button text :aria-label="`查看技能 ${skill.name}`" :disabled="editorBusy" @click="inspectSkill(skill.id)"><FileText :size="15" /></el-button>
              <el-button text :aria-label="`移除技能 ${skill.name}`" :disabled="editorBusy" @click="form.linkedSkillIds=form.linkedSkillIds.filter(id=>id!==skill.id)"><Trash2 :size="15" /></el-button>
            </div>
            <ExpertResourcePicker v-model="form.linkedSkillIds" :resources="skillResources" title="添加技能" resource-label="技能" manage-label="技能管理" manage-url="/admin/official-skills" :loading="skillLoading" :error="skillLoadError" :disabled="editorBusy" @refresh="loadEnabledSkills" @inspect="inspectSkill" />
          </template>
          <template #advanced>
            <el-collapse-item title="会话开始" name="starters">
              <el-form-item prop="openingQuestionsText" class="expert-starters-field">
                <ExpertConversationStarters v-model="form.openingQuestionsText" :disabled="editorBusy" />
              </el-form-item>
            </el-collapse-item>
          </template>
        </ExpertExecutionEditor>
      </section>
      <ExpertDraftPreview :name="form.name" :summary="form.summary" :starters="splitLines(form.openingQuestionsText)" :avatar-url="editorAvatarUrl" :launch-url="editorPreviewPath" :expires-at="editorPreviewExpiresAt" :approved-request-id="editorPreviewApprovedRequest" :rejected-request-id="editorPreviewRejectedRequest" :busy="editorPreviewBusy" :disabled="editorBusy || iconValidating || !!executionBlockers.length" :stale="editorPreviewStale" :error="editorPreviewError" @preview="onEditorPreview" @invalidate="invalidateEditorPreview" />
    </el-form>
  </el-dialog>

  <el-dialog v-model="skillDetailOpen" :title="skillDetail?.name || '技能内容'" width="720px" class="expert-skill-content-dialog" append-to-body>
    <div v-loading="skillDetailLoading">
      <el-alert v-if="skillDetailError" :title="skillDetailError" type="error" :closable="false" />
      <template v-if="skillDetail"><p>{{ skillDetail.summary }}</p><pre class="expert-resource-instruction">{{ skillDetail.instruction || '暂无技能正文' }}</pre></template>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { ArrowLeft, Box, CircleHelp, EllipsisVertical, FileText, SquarePen, Trash2, UserRound } from 'lucide-vue-next';
import CatalogIconEditor from '../../CatalogIconEditor.vue';
import ExpertExecutionEditor from '../ExpertExecutionEditor.vue';
import ExpertConversationStarters from '../ExpertConversationStarters.vue';
import ExpertDraftPreview from '../ExpertDraftPreview.vue';
import ExpertResourcePicker from '../ExpertResourcePicker.vue';
import {
  formatPublishMissingToast,
  formatValidationToast,
  summarizeInvalidFields,
  type FormInvalidFields,
} from '../../../utils/admin-official-agent-form-errors';
import {
  adminOfficialAgentApi,
  adminOfficialSkillApi,
  type ExpertDefinition,
  type OfficialAgentCategory,
  type OfficialAgentKind,
  type OfficialAgentRow,
  type OfficialAgentStatus,
  type OfficialSkillOption,
  type OfficialSkillRow,
} from '../../../api/admin';
import { collectPublishMissing, splitLines, TOOL_SCOPE_LABELS } from './agent-display';
import { agentWebUrl } from '../../../utils/agent';
import { editableExecutionConfig, previewHostLaunchUrl } from '../../../utils/knowledge-admin';

const props = defineProps<{
  modelValue: boolean;
  /** null = 新建；否则为被编辑的行快照。 */
  agent: OfficialAgentRow | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [row: OfficialAgentRow];
  created: [id: string];
  published: [row: OfficialAgentRow];
  discovery: [id: string];
}>();

const open = computed(() => props.modelValue);

const editorOpen = computed(() => props.modelValue);
const editingId = ref('');
const saving = ref(false);
const publishingFromEditor = ref(false);
const formAvatarUrl = ref<string | null>(null);
const pendingIcon = ref<File | null>(null);
const draftAvatarUrl = ref<string | null>(null);
const editorAvatarUrl = computed(() => removeIcon.value ? null : draftAvatarUrl.value || formAvatarUrl.value);
const removeIcon = ref(false);
const iconValidating = ref(false);
const editorBaseline = ref('');
const identityOpen = ref<string[]>([]);
const metadataOpen = ref(false);
const metadataSections = ref<string[]>([]);
const advancedOpen = ref<string[]>([]);
const executionBlockers = ref<string[]>([]);
const editorPreviewBusy = ref(false);
const editorPreviewPath = ref('');
const editorPreviewExpiresAt = ref('');
const editorPreviewError = ref('');
const editorPreviewBaseline = ref('');
const editorPreviewApprovedRequest = ref('');
const editorPreviewRejectedRequest = ref('');
let editorPreviewEpoch = 0;
const editorKnowledgeRevision = ref(0);
const formRef = ref<FormInstance>();
const executionEditor = ref<InstanceType<typeof ExpertExecutionEditor>>();
const baseDefinition = ref<ExpertDefinition>({});
const enabledSkillOptions = ref<OfficialSkillOption[]>([]);
const retainedSkillOptions = ref<OfficialSkillOption[]>([]);
const skillLoading = ref(false);
const skillLoadError = ref('');
const skillDetailOpen = ref(false);
const skillDetailLoading = ref(false);
const skillDetailError = ref('');
const skillDetail = ref<OfficialSkillRow | null>(null);
let skillDetailRequest = 0;
let queuedEditorPreview: { question: string; requestId: string } | undefined;

const form = reactive({
  executionConfig: editableExecutionConfig(),
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

const editorBusy = computed(() => saving.value || publishingFromEditor.value);
const editorDirty = computed(() => editorFields() !== editorBaseline.value || !!pendingIcon.value || removeIcon.value);
const editorPreviewStale = computed(() => !!editorPreviewPath.value && (editorPreviewFields() !== editorPreviewBaseline.value || !!pendingIcon.value || removeIcon.value));

const selectableSkillOptions = computed(() => [...enabledSkillOptions.value, ...retainedSkillOptions.value.filter(skill => !enabledSkillOptions.value.some(item => item.id === skill.id))]);
const selectedSkillPreviews = computed(() => selectableSkillOptions.value.filter(skill => form.linkedSkillIds.includes(skill.id)));
const skillResources = computed(() => selectableSkillOptions.value.map(skill => ({
  id: skill.id,
  name: skill.name,
  summary: skill.summary,
  status: skill.enabledAt ? '已启用' : '未启用',
  selectable: !!skill.enabledAt && skill.packageRevision > 0,
})));
const executionSkillDependencies = computed(() => form.linkedSkillIds.map(id => {
  const s = selectableSkillOptions.value.find(s => s.id === id);
  return { enabled: !!s?.enabledAt, packageRevision: s?.packageRevision ?? 0 };
}));

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
  openingQuestionsText: [{ validator: (_rule, value, callback) => {
    const lines = splitLines(String(value ?? ''));
    if (lines.length > 4) callback(new Error('开场白最多填写4条'));
    else if (lines.some(line => line.length > 500)) callback(new Error('每条开场白最多500字'));
    else callback();
  }, trigger: 'blur' }],
};

const existingToolOptions = computed(() => form.toolScope
  .map(value => ({ value, label: TOOL_SCOPE_LABELS[value] ?? `不可用工具 · ${value}` })));

function editorFields() {
  return JSON.stringify(form);
}

/** 保存结果同步给列表；同时把已保存头像回写到编辑器头部。 */
function applySaved(next: OfficialAgentRow) {
  formAvatarUrl.value = next.avatarUrl;
  emit('saved', next);
}

function editorPreviewFields() {
  return JSON.stringify([editorFields(), editorKnowledgeRevision.value]);
}

function openMetadata() {
  metadataSections.value = [];
  identityOpen.value = [];
  metadataOpen.value = true;
}

function onEditorCommand(command: string) {
  if (command === 'publish') void onSaveAndPublish();
  else openMetadata();
}

function invalidateEditorPreview() {
  editorPreviewEpoch++;
  editorPreviewPath.value = '';
  editorPreviewExpiresAt.value = '';
  editorPreviewBaseline.value = '';
  editorPreviewApprovedRequest.value = '';
}

async function requestEditorClose(done?: () => void) {
  if (editorBusy.value || editorPreviewBusy.value || iconValidating.value) return;
  if (editorDirty.value) {
    try { await ElMessageBox.confirm('当前修改尚未保存，离开会丢弃这些修改。', '离开专家编辑', { confirmButtonText: '放弃修改并离开', cancelButtonText: '继续编辑', type: 'warning' }); } catch { return; }
  }
  if (done) done(); else emit('update:modelValue', false);
}

async function onEditorPreview(question?: string, requestId?: string) {
  if (question === undefined) {
    queuedEditorPreview = undefined; invalidateEditorPreview(); editorPreviewError.value = ''; editorPreviewRejectedRequest.value = ''; return;
  }
  if (editorBusy.value || iconValidating.value || executionBlockers.value.length) return;
  if (editorPreviewBusy.value) {
    if (question && requestId) queuedEditorPreview = { question, requestId };
    return;
  }
  const epoch = editorPreviewEpoch;
  editorPreviewError.value = '';
  editorPreviewApprovedRequest.value = '';
  editorPreviewRejectedRequest.value = '';
  if (!form.systemPrompt.trim()) {
    editorPreviewRejectedRequest.value = requestId ?? '';
    editorPreviewError.value = '请先填写左侧专家指令，再发送试聊问题。';
    await revealEditorField('systemPrompt');
    return;
  }
  editorPreviewBusy.value = true;
  try {
    // Every question is approved against the current left-hand configuration.
    if (question && requestId && editorPreviewPath.value && !editorPreviewStale.value && Date.parse(editorPreviewExpiresAt.value) > Date.now()) {
      editorPreviewApprovedRequest.value = requestId;
      return;
    }
    const saved = await persistEditorDraft();
    if (epoch !== editorPreviewEpoch) return;
    if (!saved) return;
    if (editorDirty.value) {
      editorPreviewError.value = '配置在准备试聊时发生了变化，请重新发送以使用最新配置。';
      return;
    }
    const baseline = editorPreviewFields();
    const preview = await adminOfficialAgentApi.preview(saved.id);
    if (epoch !== editorPreviewEpoch) return;
    const path = new URL(previewHostLaunchUrl(preview, agentWebUrl));
    path.searchParams.set('expertEmbed', '1');
    editorPreviewPath.value = path.href; editorPreviewExpiresAt.value = preview.expiresAt; editorPreviewBaseline.value = baseline;
    if (editorPreviewFields() !== baseline || pendingIcon.value || removeIcon.value) {
      editorPreviewError.value = '配置在准备试聊时发生了变化，请重新发送以使用最新配置。';
      return;
    }
    editorPreviewApprovedRequest.value = requestId ?? '';
  } catch (error) {
    if (epoch === editorPreviewEpoch) editorPreviewError.value = apiErrorMessage(error, '试聊创建失败，请重试');
  } finally {
    if (requestId && editorPreviewApprovedRequest.value !== requestId) editorPreviewRejectedRequest.value = requestId;
    editorPreviewBusy.value = false;
    const queued = queuedEditorPreview; queuedEditorPreview = undefined;
    if (queued) void onEditorPreview(queued.question, queued.requestId);
  }
}

function warnUnsavedEditor(event: BeforeUnloadEvent) {
  if (open.value && editorDirty.value) { event.preventDefault(); event.returnValue = ''; }
}

function clearIconDraft() {
  draftAvatarUrl.value = null;
  pendingIcon.value = null;
  removeIcon.value = false;
  iconValidating.value = false;
}

async function inspectSkill(id: string) {
  const request = ++skillDetailRequest;
  skillDetailOpen.value = true;
  skillDetailLoading.value = true;
  skillDetailError.value = '';
  skillDetail.value = null;
  try { const detail = await adminOfficialSkillApi.detail(id); if (request === skillDetailRequest) skillDetail.value = detail; }
  catch (error) { if (request === skillDetailRequest) skillDetailError.value = apiErrorMessage(error, '技能内容加载失败'); }
  finally { if (request === skillDetailRequest) skillDetailLoading.value = false; }
}

async function loadEnabledSkills() {
  skillLoading.value = true;
  skillLoadError.value = '';
  try {
    const catalog = await adminOfficialSkillApi.list();
    const options = catalog.map(skill => ({ ...skill, category: skill.category as OfficialSkillOption['category'] }));
    enabledSkillOptions.value = options.filter(skill => !!skill.enabledAt && skill.packageRevision > 0);
    const unavailable = retainedSkillOptions.value.filter(skill => !options.some(option => option.id === skill.id)).map(skill => ({ ...skill, enabledAt: null, packageRevision: 0 }));
    retainedSkillOptions.value = [...options, ...unavailable];
  } catch (error) {
    skillLoadError.value = apiErrorMessage(error, '平台技能加载失败，请刷新重试');
  } finally { skillLoading.value = false; }
}

function resetEditor() {
  form.executionConfig = editableExecutionConfig({ route: 'KNOWLEDGE_CORE' });
  identityOpen.value = [];
  metadataSections.value = [];
  metadataOpen.value = false;
  advancedOpen.value = [];
  editorPreviewPath.value = ''; editorPreviewExpiresAt.value = ''; editorPreviewError.value = ''; editorPreviewBaseline.value = ''; editorPreviewApprovedRequest.value = '';
  executionBlockers.value = [];
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

function hydrateEditor(row: OfficialAgentRow) {
  editingId.value = row.id;
  formAvatarUrl.value = row.avatarUrl;
  form.key = row.key;
  form.kind = row.kind;
  form.name = row.draft.name;
  form.executionConfig = editableExecutionConfig(row.draft.executionConfig);
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
}

function initEditor() {
  void loadEnabledSkills();
  resetEditor();
  if (props.agent) hydrateEditor(props.agent);
  else metadataOpen.value = true;
  editorBaseline.value = editorFields();
}

async function revealEditorField(prop: string | null) {
  if (prop === 'openingQuestionsText') executionEditor.value?.revealOpening();
  if (prop && !['systemPrompt', 'openingQuestionsText'].includes(prop)) metadataOpen.value = true;
  if (prop && !['name', 'summary', 'systemPrompt', 'openingQuestionsText'].includes(prop)) metadataSections.value = ['more'];
  if (['category', 'capabilitiesText'].includes(prop ?? '') && !identityOpen.value.includes('identity')) identityOpen.value.push('identity');
  if (['kind', 'expertRole'].includes(prop ?? '') && !identityOpen.value.includes('workflow')) identityOpen.value.push('workflow');
  if (['key', 'toolScope'].includes(prop ?? '') && !advancedOpen.value.includes('advanced')) {
    advancedOpen.value = [...advancedOpen.value, 'advanced'];
  }
  await nextTick();
  if (prop) formRef.value?.scrollToField?.(prop);
  await nextTick();
  const root = metadataOpen.value ? document.querySelector('.expert-metadata-dialog') : document.querySelector('.official-agent-editor .agent-form');
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
  const submittedFields = editorFields();
  const openingQuestions = splitLines(form.openingQuestionsText);
  const previousDiscovery = baseDefinition.value.discoveryDetail;
  const discovery = previousDiscovery && typeof previousDiscovery === 'object' && !Array.isArray(previousDiscovery) ? previousDiscovery as Record<string, unknown> : {};
  const previousStarters = Array.isArray(discovery.starters) ? discovery.starters.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)) : [];
  const starters = openingQuestions.map(text => ({ ...previousStarters.find(item => item.text === text), text }));
  const draft = {
    openingQuestions,
    executionConfig: editableExecutionConfig(form.executionConfig),
    name: form.name.trim(),
    summary: form.summary.trim(),
    systemPrompt: form.systemPrompt.trim(),
    toolScope: [...form.toolScope],
    ...(form.category ? { category: form.category } : {}),
    capabilities: splitLines(form.capabilitiesText),
    linkedSkillIds: form.linkedSkillIds,
    expertDefinition: {
      ...baseDefinition.value,
      discoveryDetail: { ...discovery, starters },
      profile: { ...baseDefinition.value.profile, role: form.expertRole.trim(), mission: form.summary.trim() },
      workflow: splitLines(form.workflowText), deliverables: splitLines(form.deliverablesText),
    },
  };
  const wasNew = !editingId.value;
  let next: OfficialAgentRow | undefined;
  if (wasNew || editorFields() !== editorBaseline.value) {
    next = editingId.value
      ? await adminOfficialAgentApi.update(editingId.value, draft)
      : await adminOfficialAgentApi.create({
          ...draft,
          key: form.key.trim() || `expert-${crypto.randomUUID().slice(0, 12)}`,
          kind: form.kind,
        });
    editingId.value = next.id;
    editorBaseline.value = submittedFields;
    applySaved(next);
  }
  if (pendingIcon.value) {
    const body = new FormData();
    body.append('file', pendingIcon.value);
    next = await adminOfficialAgentApi.uploadAvatar(editingId.value, body);
  } else if (removeIcon.value) {
    next = await adminOfficialAgentApi.removeAvatar(editingId.value);
  }
  if (next) applySaved(next);
  clearIconDraft();
  if (wasNew && next) emit('created', next.id);
  const current = next
    ?? (props.agent && props.agent.id === editingId.value ? props.agent : null);
  const unchanged = editorFields() === submittedFields;
  if (unchanged && current) form.openingQuestionsText = (current.draft.openingQuestions ?? []).join('\n');
  editorBaseline.value = unchanged ? editorFields() : submittedFields;
  return current;
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
  if (saving.value || publishingFromEditor.value || editorPreviewBusy.value || iconValidating.value) return;
  saving.value = true;
  try {
    const wasNew = !editingId.value;
    const saved = await persistEditorDraft();
    if (!saved) return;
    if (wasNew) {
      ElMessage.success('已保存并生成专家。可继续编辑后使用「保存并发布」，或关闭后从列表发布。');
      // Keep editor open; editingId is set so发布按钮会出现。
    } else {
      ElMessage.success('草稿已保存（未自动发布）');
    }
  } catch (error) {
    ElMessage.error(apiErrorMessage(error, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function onSaveAndPublish() {
  if (executionBlockers.value.length) { ElMessage.error(executionBlockers.value.join('；')); return; }
  if (!editingId.value) {
    ElMessage.warning('请先保存新建专家，再发布');
    return;
  }
  if (saving.value || publishingFromEditor.value || editorPreviewBusy.value || iconValidating.value) return;
  const missing = collectPublishMissing(form);
  if (missing.length) {
    ElMessage.error(formatPublishMissingToast(missing));
    focusPublishMissingField(missing);
    return;
  }
  const currentStatus: OfficialAgentStatus = props.agent?.status || 'DRAFT';
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
    emit('published', published);
    ElMessage.success('已保存并发布');
    emit('update:modelValue', false);
  } catch (error) {
    ElMessage.error(`修改已保存，发布失败：${apiErrorMessage(error, '请稍后重试')}`);
  } finally {
    publishingFromEditor.value = false;
  }
}

function onDialogModelValue(value: boolean) {
  emit('update:modelValue', value);
}

function applyOpeningQuestions(text: string) {
  form.openingQuestionsText = text;
}

defineExpose({
  focusMissingField: (missing: string[]) => focusPublishMissingField(missing),
  applyOpeningQuestions,
  /** 供列表操作守卫使用（原页面级 `saving`）。 */
  isSaving: () => saving.value,
});

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) initEditor();
});

onMounted(() => {
  window.addEventListener('beforeunload', warnUnsavedEditor);
  if (props.modelValue) initEditor();
});

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', warnUnsavedEditor);
});
</script>

<style scoped>
.field-req-hint { margin: 0 0 6px; }

.form-hint {
  margin-top: 6px;
  color: #8b909b;
  font-size: 12px;
  line-height: 18px;
}

.agent-form {
  margin-top: 20px;
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

@media (max-width: 768px) {
  .official-agent-dialog {
    width: calc(100vw - 32px) !important;
  }

  .el-dialog.official-agent-editor {
    margin: auto !important;
    max-height: calc(100dvh - 48px);
  }

  .el-dialog.official-agent-editor.is-align-center {
    margin: auto !important;
  }
}

.el-dialog.official-agent-dialog { border-radius: 10px; }
</style>
