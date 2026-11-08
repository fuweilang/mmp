<template>
  <el-dialog :model-value="true" :title="`广场详情 · ${name || '加载中'}`" width="680px" align-center append-to-body destroy-on-close :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @update:model-value="onDialogChange" class="catalog-discovery-dialog">
    <el-alert type="info" :closable="false" :title="kind==='expert' ? '只编辑公开详情草稿，发布专家后才对外生效；不修改角色指令。' : '启用技能保存后对外生效；不修改技能包正文、版本或启用状态。'" />
    <el-alert v-if="error" :title="error" type="error" :closable="false"><el-button text @click="load">重新加载</el-button></el-alert>
    <el-form v-loading="loading" label-position="top" :disabled="loading || saving || !!error" class="discovery-form">
      <el-form-item label="详细介绍（可选，公开内容）"><el-input v-model="introduction" type="textarea" :rows="3" maxlength="2000" show-word-limit placeholder="说明能解决什么问题；不要粘贴私有指令或敏感信息" /></el-form-item>
      <el-form-item v-for="field in listFields" :key="field.key" :label="field.label"><el-input v-model="lists[field.key]" type="textarea" :rows="2" placeholder="每行一项，最多5项，每项300字；留空则隐藏" /></el-form-item>
      <el-form-item label="开场白（可选，最多3条）">
        <div class="starters"><div v-for="(starter,index) in starters" :key="index" class="starter"><el-input v-model="starter.label" maxlength="40" placeholder="短标签" /><el-input v-model="starter.text" type="textarea" :rows="2" maxlength="500" placeholder="点击只预填草稿，不会自动发送" /><el-button text @click="starters.splice(index,1)">移除</el-button></div><el-button v-if="starters.length<3" @click="starters.push({label:'',text:''})">添加开场白</el-button></div>
      </el-form-item>
      <el-collapse><el-collapse-item title="公开详情预览（仅文案，不执行任务）" name="preview"><p v-if="introduction">{{ introduction }}</p><section v-for="field in listFields" :key="field.key"><template v-if="toLines(lists[field.key]).length"><h4>{{ field.label }}</h4><ul><li v-for="line in toLines(lists[field.key])" :key="line">{{ line }}</li></ul></template></section><section v-if="starters.length"><h4>开场白</h4><p v-for="(starter,index) in starters" :key="index">{{ starter.label }} · {{ starter.text }}</p></section><p class="hint">未填写的部分不会在终端显示。名称、用途、图标与关联技能仍使用原配置。</p></el-collapse-item></el-collapse>
    </el-form>
    <template #footer><el-button :disabled="saving" @click="emit('close')">取消</el-button><el-button type="primary" :loading="saving" :disabled="loading || !!error" @click="save">{{ kind==='expert' ? '保存详情草稿' : '保存公开详情' }}</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import {onMounted,onUnmounted,reactive,ref} from 'vue';
import {ElMessage} from 'element-plus';
import {adminHttp} from '../api/http';
const props=defineProps<{kind:'expert'|'skill';resourceId:string}>();
const emit=defineEmits<{close:[];saved:[]}>();
function onDialogChange(value:boolean){if(!value)emit('close');}
interface Detail {schemaVersion:1;displayRevision:number;introduction:string;outputs:string[];materials:string[];boundaries:string[];starters:Array<{label:string;text:string}>}
interface Resource {id:string;name:string;updatedAt:string;discoveryDetail:Detail}
const listFields=[{key:'outputs',label:'典型产出'},{key:'materials',label:'所需材料'},{key:'boundaries',label:'适用边界'}] as const;
const name=ref(''),introduction=ref(''),stamp=ref(''),revision=ref(0),error=ref(''),loading=ref(false),saving=ref(false);
const lists=reactive({outputs:'',materials:'',boundaries:''}),starters=ref<Detail['starters']>([]);
const base=`/official-${props.kind==='expert'?'agents':'skills'}/${encodeURIComponent(props.resourceId)}/discovery`;
let sequence=0,alive=true;
const toLines=(text:string)=>text.split('\n').map(v=>v.trim()).filter(Boolean);
async function load(){const seq=++sequence;loading.value=true;error.value='';try{const value=await adminHttp<Resource>(base);if(!alive||seq!==sequence)return;name.value=value.name;stamp.value=value.updatedAt;const d=value.discoveryDetail;revision.value=d.displayRevision;introduction.value=d.introduction;for(const field of listFields)lists[field.key]=d[field.key].join('\n');starters.value=d.starters.map(v=>({...v}));}catch(e){if(alive&&seq===sequence)error.value=e instanceof Error?e.message:'读取失败';}finally{if(alive&&seq===sequence)loading.value=false;}}
async function save(){if(saving.value||loading.value||error.value)return;for(const field of listFields){const values=toLines(lists[field.key]);if(values.length>5||values.some(v=>v.length>300)){ElMessage.warning('每组最多5项，每项300字');return;}}if(starters.value.some(v=>!v.label.trim()||!v.text.trim())){ElMessage.warning('请填写开场白标签和正文，或移除空项');return;}saving.value=true;try{await adminHttp(base,{method:'PUT',body:JSON.stringify({expectedUpdatedAt:stamp.value,discoveryDetail:{schemaVersion:1,displayRevision:revision.value,introduction:introduction.value,outputs:toLines(lists.outputs),materials:toLines(lists.materials),boundaries:toLines(lists.boundaries),starters:starters.value}})});ElMessage.success(props.kind==='expert'?'详情草稿已保存，发布后公开':'公开详情已保存');emit('saved');emit('close');}catch(e){ElMessage.error(e instanceof Error?e.message:'保存失败');}finally{saving.value=false;}}
onMounted(load);onUnmounted(()=>{alive=false;sequence++;});
</script>
<style scoped>
.discovery-form{margin-top:16px}.starters{display:grid;gap:12px;width:100%}.starter{display:grid;gap:8px;border:1px solid var(--el-border-color);border-radius:8px;padding:12px}.hint{color:var(--el-text-color-secondary)}
</style>
<style>
.catalog-discovery-dialog .el-dialog__body{max-height:68vh;overflow:auto}.catalog-discovery-dialog{max-width:calc(100vw - 32px)}
</style>
