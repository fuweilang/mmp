<template>
  <div class="execution-editor">
    <div class="expert-panel-heading expert-capabilities-heading">
      <h2>能力</h2>
      <el-popover v-model:visible="modelMenuOpen" trigger="click" placement="bottom-end" :width="280" :show-arrow="false" popper-class="expert-model-menu">
        <template #reference>
          <el-button text class="expert-model-picker" :disabled="disabled" aria-label="选择模型"><Sparkles :size="15" /><span>{{ selectedModelName }}</span><ChevronDown :size="14" /></el-button>
        </template>
        <div role="group" aria-label="聊天模型" class="expert-model-options">
          <button type="button" class="expert-model-option" :disabled="disabled" :aria-pressed="modelValue.generationModel.mode === 'AUTO'" @click="chooseModel()">
            <Sparkles :size="18" /><span>自动选择模型</span><Check v-if="modelValue.generationModel.mode === 'AUTO'" :size="16" class="expert-model-check" />
          </button>
          <p class="expert-model-group-label">平台模型</p>
          <button v-for="model in models" :key="model.id" type="button" class="expert-model-option" :disabled="disabled || !model.enabled || !model.providerEnabled || !model.providerConfigured" :aria-pressed="modelValue.generationModel.mode === 'FIXED' && modelValue.generationModel.modelId === model.id" :title="model.providerName" @click="chooseModel(model.id)">
            <span class="expert-model-glyph" :data-provider="model.providerName"><Sparkles :size="18" /></span><span>{{ model.displayName }}</span><Check v-if="modelValue.generationModel.mode === 'FIXED' && modelValue.generationModel.modelId === model.id" :size="16" class="expert-model-check" />
          </button>
          <p v-if="!loading && !models.length" class="expert-model-empty">暂无平台模型</p>
        </div>
      </el-popover>
    </div>
    <div class="expert-capabilities-scroll">
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-collapse v-model="capabilitySections" class="expert-capability-sections">
        <el-collapse-item name="skills">
          <template #title><span>技能</span><CircleHelp :size="13" class="expert-help-icon" /></template>
          <slot name="skills" />
        </el-collapse-item>
        <el-collapse-item name="knowledge">
          <template #title><span>知识库</span><el-tooltip content="添加已有知识库，或创建知识库并上传资料。"><CircleHelp :size="13" class="expert-help-icon" /></el-tooltip></template>
          <template v-if="modelValue.route === 'KNOWLEDGE_CORE'">
            <ExpertKnowledgePanel :model-value="modelValue.releaseIds" :expert-id="expertId" :expert-name="expertName" :disabled="disabled" @update:model-value="selectKnowledge" @changed="knowledgeChanged" @blockers="knowledgeOperations=$event" />
            <p v-if="modelValue.releaseIds.length && modelValue.retrievalPolicy === 'OFF'" class="muted">已绑定知识库，但资料检索已关闭，试聊不会使用库中资料。</p>

          </template>
          <template v-else>
            <el-button class="expert-add-button" :disabled="disabled" @click="routeChanged('KNOWLEDGE_CORE')">使用平台知识库</el-button>
          </template>
        </el-collapse-item>
      </el-collapse>
      <div class="expert-advanced-heading">高级</div>
      <el-collapse v-model="advancedSections" class="expert-advanced-sections">
        <slot name="advanced" />

      </el-collapse>
      <el-alert v-if="blockers.length" :title="`试聊 / 发布前请处理：${blockers.join('；')}`" type="warning" :closable="false" />
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { createExpertEditorResources, expertEditorResourcesKey } from './expert-editor-resources';
import { Check, ChevronDown, CircleHelp, Sparkles } from 'lucide-vue-next';
import ExpertKnowledgePanel from './ExpertKnowledgePanel.vue';
import { expertDependencyBlockers } from '../../utils/knowledge-admin';
import { type ExpertExecutionConfig, type KnowledgeProfile, type KnowledgeRelease, type AdminLlmModelRow } from '../../api/admin';
const resources=inject(expertEditorResourcesKey,undefined) ?? createExpertEditorResources();
const props = defineProps<{
    modelValue: ExpertExecutionConfig;
    disabled?: boolean;
    expertId?: string;
    expertName?: string;
    toolScope: string[];
    skills: Array<{
        enabled: boolean;
        packageRevision: number;
    }>;
}>();
const emit = defineEmits<{
    knowledgeChanged: [];
    'update:modelValue': [
        ExpertExecutionConfig
    ];
    blockers: [
        string[]
    ];
}>();
const loading = ref(false), error = ref(''), loaded = ref(false), profiles = ref<KnowledgeProfile[]>([]), releases = ref<Array<KnowledgeRelease & {
    baseName: string;
}>>([]), models = ref<Array<AdminLlmModelRow & {
    providerName: string;
    providerEnabled: boolean;
    providerConfigured: boolean;
}>>([]), health = ref<Record<string, boolean>>({});
const knowledgeOperations = ref<string[]>([]);
const capabilitySections = ref(['skills', 'knowledge']);
const advancedSections = ref<string[]>([]);
const modelMenuOpen = ref(false);
defineExpose({revealOpening:()=>{if(!advancedSections.value.includes('starters')) advancedSections.value.push('starters');}});
const selectedModelName = computed(() => {
    const generationModel = props.modelValue.generationModel;
    if (generationModel.mode === 'AUTO') return '自动选择模型';
    return models.value.find(model => model.id === generationModel.modelId)?.displayName || '指定模型';
});
const reranks = computed(() => profiles.value.filter(p => p.enabled && p.task === 'RERANK'));
const readyIndexProfiles = ref<Record<string, string>>({});
function applyResources(data:Awaited<ReturnType<typeof resources.load>>) {
    profiles.value=data.profiles;health.value=data.health;
    models.value=data.providers.flatMap(provider=>provider.models.map(m=>({...m,providerName:provider.displayName,providerEnabled:provider.enabled,providerConfigured:provider.hasApiKey})));
    releases.value=data.catalog.filter(entry=>entry.base.enabled).flatMap(x=>x.releases.map(r=>({...r,baseName:x.base.name})));
    readyIndexProfiles.value=Object.fromEntries(data.catalog.filter(entry=>entry.base.enabled).flatMap(x=>x.documents.filter(d=>d.enabled).flatMap(d=>d.revisions.flatMap(r=>r.indexes.filter(i=>i.status==='READY' && data.health[i.profileId]).map(i=>[i.id,i.profileId])))));
    loaded.value=true;
}
const initialResources=resources.peek();
if(initialResources) applyResources(initialResources);
const blockers = computed(() => [...expertDependencyBlockers(props.modelValue, {
    loaded: loaded.value && !error.value, error: error.value, releaseIndexIds: Object.fromEntries(releases.value.map(r => [r.id, r.items.map(i => i.indexRevisionId)])),
    readyIndexProfiles: readyIndexProfiles.value, availableReranks: reranks.value.filter(p => health.value[p.id]).map(p => p.id),
    models: models.value, skills: props.skills, toolScope: props.toolScope,
}), ...knowledgeOperations.value]);
watch(blockers, v => emit('blockers', v), { immediate: true });
function chooseModel(modelId?:string) {
    if (props.disabled) return;
    set({generationModel:modelId ? {mode:'FIXED',modelId} : {mode:'AUTO'}});
    modelMenuOpen.value=false;
}
function set(value: Partial<ExpertExecutionConfig>) { emit('update:modelValue', { ...props.modelValue, ...value }); }
function selectKnowledge(releaseIds:string[]) {
    set({releaseIds,retrievalPolicy:releaseIds.length ? props.modelValue.retrievalPolicy==='OFF'?'REQUIRED':props.modelValue.retrievalPolicy : 'OFF'});
}
function knowledgeChanged() {
    resources.invalidate();
    emit('knowledgeChanged');
    void load(true);
}
function routeChanged(route: 'LEGACY' | 'KNOWLEDGE_CORE') {
    knowledgeOperations.value=[];
    set({ route, releaseIds: [], retrievalPolicy: 'OFF', rerankProfileId: undefined });
}
let loadRequest=0;
async function load(force=false) {
    const request=++loadRequest;
    loading.value = true;
    error.value = '';
    try {
        const data=await resources.load(force);
        if(request===loadRequest) applyResources(data);
    }
    catch (e) {
        if(request===loadRequest) error.value = e instanceof Error ? e.message : '发布依赖加载失败';
    }
    finally {
        if(request===loadRequest) loading.value = false;
    }
}
onMounted(()=>load());
</script>
