<template>
  <el-dialog
    :model-value="true"
    :title="dialogTitle"
    width="680px"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    class="catalog-discovery-dialog"
    @update:model-value="onDialogChange"
  >
    <el-alert
      type="info"
      :closable="false"
      :title="kind === 'expert'
        ? '只编辑专家公开介绍，不修改角色指令、工具或技能。「保存修改」仅存草稿；「保存并发布」会发布该专家全部待发布修改。'
        : '启用技能保存后对外生效；不修改技能包正文、版本或启用状态。'"
    />
    <el-alert v-if="error" :title="error" type="error" :closable="false">
      <el-button text @click="load">重新加载</el-button>
    </el-alert>
    <el-form
      v-loading="loading"
      label-position="top"
      :disabled="loading || busy || !!error"
      class="discovery-form"
    >
      <el-form-item :label="labels.introduction">
        <el-input
          v-model="introduction"
          type="textarea"
          :rows="4"
          maxlength="2000"
          show-word-limit
          :placeholder="labels.introductionPlaceholder"
        />
      </el-form-item>

      <el-form-item :label="labels.starters">
        <div class="starters">
          <div v-for="(starter, index) in starters" :key="index" class="starter">
            <el-input
              v-if="kind === 'skill'"
              v-model="starter.label"
              maxlength="40"
              :placeholder="labels.starterLabelPlaceholder"
            />
            <el-input
              v-model="starter.text"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 6 }"
              maxlength="500"
              show-word-limit
              :placeholder="labels.starterTextPlaceholder"
            />
            <div class="starter-actions">
              <el-button text :disabled="index === 0" @click="moveStarter(index, -1)">上移</el-button>
              <el-button text :disabled="index === starters.length - 1" @click="moveStarter(index, 1)">下移</el-button>
              <el-button text @click="starters.splice(index, 1)">删除</el-button>
            </div>
          </div>
          <el-button v-if="starters.length < 3" @click="starters.push(kind === 'skill' ? { label: '', text: '' } : { text: '' })">
            {{ labels.addStarter }}
          </el-button>
        </div>
        <div class="hint">{{ labels.starterHint }}</div>
      </el-form-item>

      <el-collapse v-model="moreOpen">
        <el-collapse-item :title="labels.moreSection" name="more">
          <el-form-item v-for="field in listFields" :key="field.key" :label="field.label">
            <el-input
              v-model="lists[field.key]"
              type="textarea"
              :rows="2"
              :placeholder="field.placeholder"
            />
          </el-form-item>
        </el-collapse-item>
      </el-collapse>
    </el-form>
    <template #footer>
      <div class="footer-row">
        <span v-if="kind === 'expert'" class="footer-hint">「保存并发布」会发布该专家全部已保存待发布修改，不只是本弹窗。</span>
        <div class="footer-actions">
          <el-button :disabled="busy" @click="emit('close')">取消</el-button>
          <el-button
            v-if="kind === 'expert'"
            :loading="saving && !publishing"
            :disabled="busy || loading || !!error"
            @click="save('save')"
          >
            保存修改
          </el-button>
          <el-button
            type="primary"
            :loading="kind === 'expert' ? publishing || (saving && publishing) : saving"
            :disabled="busy || loading || !!error"
            @click="kind === 'expert' ? save('saveAndPublish') : save('save')"
          >
            {{ kind === 'expert' ? '保存并发布' : '保存公开详情' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { adminHttp } from '../api/http';
import { adminOfficialAgentApi } from '../api/admin';

const props = defineProps<{ kind: 'expert' | 'skill'; resourceId: string; agentStatus?: 'DRAFT' | 'PUBLISHED' | 'OFFLINE' | '' }>();
const emit = defineEmits<{ close: []; saved: []; published: [] }>();
function onDialogChange(value: boolean) {
  if (!value) emit('close');
}

interface Detail {
  schemaVersion: 1;
  displayRevision: number;
  introduction: string;
  outputs: string[];
  materials: string[];
  boundaries: string[];
  starters: Array<{ label?: string; text: string }>;
}
interface Resource {
  id: string;
  name: string;
  updatedAt: string;
  discoveryDetail: Detail;
}

const expertLabels = {
  introduction: '详细说明',
  introductionPlaceholder: '说明适合谁、能解决什么问题；与主配置的简短用途摘要区分开，不要粘贴私有指令',
  starters: '推荐提问',
  starterLabelPlaceholder: '短标签，例如：写周报',
  starterTextPlaceholder: '完整推荐提问正文；终端点击后预填输入框，不会自动发送',
  addStarter: '添加推荐提问',
  starterHint: '最多 3 条，仅完整正文。终端点击后预填输入框并绑定专家，不会自动发送。',
  moreSection: '更多说明',
  outputs: '你能得到什么',
  outputsPlaceholder: '每行一项具体交付物，最多 5 项；留空则终端不显示',
  materials: '建议提供的信息',
  materialsPlaceholder: '每行一项建议材料，选填，不是启动门槛；留空则隐藏',
  boundaries: '不适合处理什么',
  boundariesPlaceholder: '每行一项不适用场景，最多 5 项；留空则隐藏',
} as const;

const skillLabels = {
  introduction: '详细介绍（可选，公开内容）',
  introductionPlaceholder: '说明能解决什么问题；不要粘贴私有指令或敏感信息',
  starters: '开场白（可选，最多3条）',
  starterLabelPlaceholder: '短标签',
  starterTextPlaceholder: '点击只预填草稿，不会自动发送',
  addStarter: '添加开场白',
  starterHint: '未填写的部分不会在终端显示。',
  moreSection: '更多介绍',
  outputs: '典型产出',
  outputsPlaceholder: '每行一项，最多5项，每项300字；留空则隐藏',
  materials: '所需材料',
  materialsPlaceholder: '每行一项，最多5项，每项300字；留空则隐藏',
  boundaries: '适用边界',
  boundariesPlaceholder: '每行一项，最多5项，每项300字；留空则隐藏',
} as const;

const labels = computed(() => (props.kind === 'expert' ? expertLabels : skillLabels));
const dialogTitle = computed(() =>
  props.kind === 'expert'
    ? `编辑专家介绍 · ${name.value || '加载中'}`
    : `广场详情 · ${name.value || '加载中'}`,
);

const listFields = computed(() =>
  (
    [
      { key: 'outputs' as const, label: labels.value.outputs, placeholder: labels.value.outputsPlaceholder },
      { key: 'materials' as const, label: labels.value.materials, placeholder: labels.value.materialsPlaceholder },
      { key: 'boundaries' as const, label: labels.value.boundaries, placeholder: labels.value.boundariesPlaceholder },
    ]
  ),
);

const name = ref('');
const introduction = ref('');
const stamp = ref('');
const revision = ref(0);
const error = ref('');
const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const busy = computed(() => saving.value || publishing.value);
const moreOpen = ref<string[]>([]);
const lists = reactive({ outputs: '', materials: '', boundaries: '' });
const starters = ref<Detail['starters']>([]);
const base = `/official-${props.kind === 'expert' ? 'agents' : 'skills'}/${encodeURIComponent(props.resourceId)}/discovery`;
let sequence = 0;
let alive = true;
const toLines = (text: string) => text.split('\n').map((v) => v.trim()).filter(Boolean);

function moveStarter(index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= starters.value.length) return;
  const next = starters.value.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  starters.value = next;
}

async function load() {
  const seq = ++sequence;
  loading.value = true;
  error.value = '';
  try {
    const value = await adminHttp<Resource>(base);
    if (!alive || seq !== sequence) return;
    name.value = value.name;
    stamp.value = value.updatedAt;
    const d = value.discoveryDetail;
    revision.value = d.displayRevision;
    introduction.value = d.introduction;
    for (const field of listFields.value) lists[field.key] = d[field.key].join('\n');
    starters.value = d.starters.map((v) =>
      props.kind === 'expert'
        ? { text: v.text || '' }
        : { label: v.label || '', text: v.text || '' },
    );
  } catch (e) {
    if (alive && seq === sequence) error.value = e instanceof Error ? e.message : '读取失败';
  } finally {
    if (alive && seq === sequence) loading.value = false;
  }
}

async function saveDiscoveryOnly() {
  for (const field of listFields.value) {
    const values = toLines(lists[field.key]);
    if (values.length > 5 || values.some((v) => v.length > 300)) {
      ElMessage.warning('每组最多5项，每项300字');
      throw new Error('VALIDATION');
    }
  }
  if (props.kind === 'expert') {
    if (starters.value.some((v) => !String(v.text || '').trim())) {
      ElMessage.warning('请填写推荐提问正文，或删除空项');
      throw new Error('VALIDATION');
    }
  } else if (starters.value.some((v) => !String(v.label || '').trim() || !String(v.text || '').trim())) {
    ElMessage.warning('请填写开场白标签和正文，或移除空项');
    throw new Error('VALIDATION');
  }
  await adminHttp(base, {
    method: 'PUT',
    body: JSON.stringify({
      expectedUpdatedAt: stamp.value,
      discoveryDetail: {
        schemaVersion: 1,
        displayRevision: revision.value,
        introduction: introduction.value,
        outputs: toLines(lists.outputs),
        materials: toLines(lists.materials),
        boundaries: toLines(lists.boundaries),
        // Always send starters (including []) so cleared examples do not resurrect via openingQuestions fallback.
        starters: props.kind === 'expert'
          ? starters.value.map((v) => ({ text: String(v.text || '').trim() }))
          : starters.value,
      },
    }),
  });
}

async function confirmPublishIfNeeded() {
  if (props.kind !== 'expert') return;
  const offline = props.agentStatus === 'OFFLINE';
  await ElMessageBox.confirm(
    offline
      ? '该专家当前已下架。「保存并发布」会先保存介绍，再发布该专家全部已保存待发布修改并重新上架。确定继续？'
      : '将先保存本页介绍，再发布该专家全部已保存的待发布修改（不只是本弹窗字段）。确定？',
    offline ? '保存并重新上架' : '保存并发布',
    { type: 'warning', confirmButtonText: offline ? '保存并重新上架' : '保存并发布' },
  );
}

async function save(mode: 'save' | 'saveAndPublish' = 'save') {
  if (busy.value || loading.value || error.value) return;
  if (mode === 'saveAndPublish' && props.kind === 'expert') {
    try {
      await confirmPublishIfNeeded();
    } catch {
      return;
    }
  }
  saving.value = true;
  try {
    await saveDiscoveryOnly();
    emit('saved');
    if (mode === 'save') {
      ElMessage.success(
        props.kind === 'expert' ? '专家介绍已保存；发布后终端才会更新' : '公开详情已保存',
      );
      emit('close');
      return;
    }
    // Expert only: save succeeded — now use the regular publish API.
    publishing.value = true;
    try {
      await adminOfficialAgentApi.publish(props.resourceId);
      ElMessage.success('已保存并发布');
      emit('published');
      emit('close');
    } catch (e) {
      ElMessage.error(
        e instanceof Error ? `修改已保存，发布失败：${e.message}` : '修改已保存，发布失败',
      );
      // Keep dialog open for retry; data already saved.
    } finally {
      publishing.value = false;
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'VALIDATION') return;
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
onUnmounted(() => {
  alive = false;
  sequence += 1;
});
</script>

<style scoped>
.discovery-form {
  margin-top: 16px;
}
.starters {
  display: grid;
  gap: 12px;
  width: 100%;
}
.starter {
  display: grid;
  gap: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 12px;
}
.starter-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.hint {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
}
.footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  flex-wrap: wrap;
}
.footer-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
}
.footer-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
</style>
<style>
.catalog-discovery-dialog .el-dialog__body {
  max-height: 68vh;
  overflow: auto;
}
.catalog-discovery-dialog {
  max-width: calc(100vw - 32px);
}
.el-dialog.catalog-discovery-dialog {
  display: flex;
  flex-direction: column;
  margin: auto !important;
  max-height: calc(100dvh - 96px);
}
.el-dialog.catalog-discovery-dialog.is-align-center {
  margin: auto !important;
}
.catalog-discovery-dialog .el-dialog__header,
.catalog-discovery-dialog .el-dialog__footer {
  flex-shrink: 0;
}
.catalog-discovery-dialog .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
</style>
