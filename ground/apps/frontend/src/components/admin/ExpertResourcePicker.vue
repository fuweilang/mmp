<template>
  <div class="expert-resource-picker">
    <el-button class="expert-add-button" :disabled="disabled" @click="open = true"><Plus :size="14" />{{ title }}</el-button>
    <el-dialog v-model="open" :title="title" width="1080px" class="expert-resource-dialog" append-to-body :show-close="false" :close-on-click-modal="false">
      <div class="resource-modal-shell">
        <aside class="resource-modal-sidebar"><h3>{{ title }}</h3><div class="resource-modal-current"><Box :size="18" />平台技能</div></aside>
        <section class="resource-modal-main">
          <header class="resource-modal-heading"><strong>平台技能</strong><div><el-button text aria-label="刷新平台技能" :loading="loading" @click="emit('refresh')"><RefreshCw :size="16" /></el-button><el-button text aria-label="关闭技能选择" @click="open=false"><X :size="18" /></el-button></div></header>
          <el-input v-model="query" class="resource-modal-search" :disabled="disabled" clearable placeholder="搜索技能名称或简介"><template #prefix><Search :size="15" /></template></el-input>
          <el-alert v-if="error" :title="error" type="error" :closable="false" />
          <div v-loading="loading" class="resource-picker-list">
        <div v-for="resource in filtered" :key="resource.id" class="resource-picker-row" :aria-label="resource.name">
          <span class="resource-modal-glyph"><Box :size="22" /></span>
          <div class="resource-modal-copy"><strong>{{ resource.name }}</strong><p>{{ resource.summary }}</p><small v-if="!resource.selectable">{{ resource.status }}</small></div>
          <el-button v-if="resource.inspectable !== false" text class="resource-inspect" :aria-label="`查看技能 ${resource.name}`" :disabled="disabled" @click="emit('inspect',resource.id)"><Eye :size="16" /></el-button>
          <el-button v-if="modelValue.includes(resource.id)" class="resource-select" :disabled="disabled" :aria-label="`移除技能 ${resource.name}`" @click="toggle(resource.id,false)"><Check :size="15" />已添加</el-button>
          <el-button v-else class="resource-select" :disabled="disabled || !resource.selectable" @click="toggle(resource.id,true)"><Plus :size="15" />添加</el-button>
        </div>
        <p v-if="!loading && !filtered.length" class="resource-picker-empty">{{ resources.length ? '没有匹配的技能' : '暂无可选的平台技能' }}</p>
      </div>
        </section>
      </div>
    </el-dialog>
  </div>
</template>
<script lang="ts">
export interface EditorResource {
  id: string;
  name: string;
  summary: string;
  status: string;
  selectable: boolean;
  inspectable?: boolean;
}
</script>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { Box, Check, Eye, Plus, RefreshCw, Search, X } from 'lucide-vue-next';
const props = defineProps<{ modelValue: string[]; resources: EditorResource[]; title: string; resourceLabel: string; manageLabel: string; manageUrl: string; loading: boolean; error: string; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [string[]]; refresh: []; inspect: [string] }>();
const open = ref(false);
const query = ref('');
const filtered = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase();
  const missing = props.modelValue.filter(id => !props.resources.some(resource => resource.id===id)).map(id => ({id,name:'已失效技能',summary:'该技能已不可用，可移除后重新选择。',status:'不可用',selectable:false,inspectable:false}));
  return [...props.resources,...missing].filter(resource => !keyword || `${resource.name} ${resource.summary}`.toLocaleLowerCase().includes(keyword));
});
function toggle(id: string, selected: boolean) {
  emit('update:modelValue', selected ? [...new Set([...props.modelValue, id])] : props.modelValue.filter(value => value !== id));
}
</script>
<style scoped>
.resource-modal-shell{display:grid;grid-template-columns:200px minmax(0,1fr);height:min(700px,calc(100dvh - 20px));color:#26262b}.resource-modal-sidebar{background:#f0f0f4;padding:24px 16px}.resource-modal-sidebar h3{margin:0 0 28px;font-size:18px;font-weight:600}.resource-modal-current{display:flex;align-items:center;gap:10px;border-radius:12px;background:#e0e0e7;padding:12px 14px;font-size:14px}.resource-modal-main{display:flex;flex-direction:column;min-width:0;min-height:0;padding:18px 20px}.resource-modal-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;min-height:28px}.resource-modal-heading strong{font-size:14px}.resource-modal-heading>div{display:flex;gap:4px}.resource-modal-heading .el-button{margin:0;padding:5px;color:#55515f}.resource-modal-search{margin-bottom:10px}.resource-modal-search :deep(.el-input__wrapper){background:#f5f5f7;box-shadow:none!important;border-radius:10px}.resource-picker-list{flex:1;min-height:0;overflow:auto}.resource-picker-row{display:flex;align-items:center;gap:12px;min-height:84px;padding:14px 12px;border-bottom:1px solid #ededf0;border-radius:12px}.resource-picker-row:hover{background:#f4f4f6}.resource-modal-glyph{display:grid;place-items:center;flex-shrink:0;width:32px;height:32px;background:#7262ff;color:#fff;border-radius:9px}.resource-modal-copy{flex:1;min-width:0}.resource-modal-copy strong{font-size:15px;font-weight:500}.resource-modal-copy p{margin:4px 0 0;color:#9999a2;font-size:13px;overflow-wrap:anywhere;line-height:20px}.resource-modal-copy small{color:#a1a1aa;font-size:12px}.resource-select.el-button{display:flex;gap:5px;border:1px solid #ededf0;border-radius:12px;padding:5px 10px;height:30px;background:#fff;color:#3f3f46}.resource-inspect{color:#77717f;margin:0}.resource-picker-empty{padding:40px 12px;color:#9999a2;font-size:14px;text-align:center}@media(max-width:640px){.resource-modal-shell{grid-template-columns:120px minmax(0,1fr)}.resource-modal-sidebar{padding:20px 10px}.resource-modal-main{padding:16px 12px}.resource-modal-copy p{max-height:40px;overflow:hidden}}
</style>
<style>
.el-dialog.expert-resource-dialog{--el-color-primary:#6841ea;padding:0;border-radius:24px;max-width:calc(100vw - 32px);margin-top:max(10px,calc((100dvh - 700px)/2));overflow:hidden}.expert-resource-dialog>.el-dialog__header{display:none}.expert-resource-dialog>.el-dialog__body{padding:0}
</style>
