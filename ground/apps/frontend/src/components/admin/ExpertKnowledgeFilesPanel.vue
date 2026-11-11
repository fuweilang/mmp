<template>
  <section class="expert-knowledge-panel" aria-label="专家知识文件">
    <div class="knowledge-section-title"><span>所属知识库</span><button v-if="!ownedBase" type="button" :disabled="disabled || creating" @click="createOwned"><Plus :size="14"/>新建知识库</button><button v-else type="button" :disabled="disabled" @click="manageOwn"><FolderOpen :size="14"/>管理文件</button></div>
    <p v-if="!ownedBase" class="knowledge-hint">按需创建，文件处理完成后自动供当前专家使用。</p>
    <template v-else><p class="knowledge-hint">{{ ownedBase.name }} · 可用文件自动使用</p><div v-for="file in ownedFiles" :key="file.id" class="knowledge-file"><FileText :size="16"/><div><button type="button" class="knowledge-file-name" @click="preview(file,ownedBase.name)">{{ file.title }}</button><small>{{ knowledgeFileStatus(file) }}</small></div><span class="knowledge-auto">{{ availableKnowledgeFile(file)?'自动使用':'完成后自动使用' }}</span></div><p v-if="!ownedFiles.length" class="knowledge-hint">暂无文件，可进入文件夹上传。</p></template>
    <div class="knowledge-section-title"><span>引用其他专家的文件</span><button type="button" :disabled="disabled || loading" @click="openPicker"><Plus :size="14"/>选择文件</button></div>
    <div v-for="row in selectedRows" :key="row.document.id" class="knowledge-file"><FileText :size="16"/><div><button type="button" class="knowledge-file-name" @click="preview(row.document,row.base.name)">{{ row.document.title }}</button><small>来自 {{ row.base.name }} · {{ knowledgeFileStatus(row.document) }}</small></div><button type="button" class="knowledge-unlink" :disabled="disabled || saving" :aria-label="`取消引用${row.document.title}`" @click="unlink(row.document.id)">取消引用</button></div>
    <p v-if="!selectedRows.length && !loading" class="knowledge-hint">暂未引用其他文件。</p>
    <div v-for="id in unknownBindings" :key="id" class="knowledge-file"><span class="knowledge-hint">暂不可用的文件引用</span><button type="button" class="knowledge-unlink" :disabled="disabled || saving" @click="emit('update:modelValue',modelValue.filter(value=>value!==id))">取消引用</button></div>
    <p v-if="error" class="knowledge-error" role="alert">{{ error }} <button type="button" @click="refresh">重试加载</button></p>
  </section>
  <el-dialog v-model="pickerOpen" title="选择知识文件" width="880px" align-center append-to-body :close-on-click-modal="false" destroy-on-close>
    <div class="knowledge-picker" v-loading="loading || saving">
      <div class="knowledge-picker-heading"><button v-if="pickerBase" type="button" class="knowledge-back" @click="pickerBaseId=''">全部文件夹</button><span v-if="pickerBase">/ {{ pickerBase.name }}</span><span class="knowledge-selected-count">已选 {{ draftDocumentIds.length }} 个文件</span></div>
      <el-input v-model="search" clearable :placeholder="pickerBase?'搜索文件名':'搜索文件夹'" :aria-label="pickerBase?'搜索文件名':'搜索文件夹'" />
      <el-table v-if="!pickerBase" :data="filteredCatalog" class="knowledge-folder-list" empty-text="暂无知识库文件夹" @row-click="enterFolder">
        <el-table-column label="文件夹名称" min-width="250"><template #default="{row}"><span class="knowledge-folder-name"><Folder :size="18"/>{{ row.base.name }}</span></template></el-table-column><el-table-column label="文件数量" width="100"><template #default="{row}">{{ row.documents.length }} 个文件</template></el-table-column><el-table-column label="所属专家" min-width="150"><template #default="{row}">{{ row.base.ownerAgent?.name || row.base.ownerAgentName || '已有资料' }}{{ row.base.ownerAgentName && !row.base.ownerAgentId?'（已删除）':'' }}</template></el-table-column><el-table-column width="55"><template #default="{row}"><el-button text aria-label="进入文件夹" @click.stop="enterFolder(row)"><ChevronRight :size="17"/></el-button></template></el-table-column>
      </el-table>
      <div v-else class="knowledge-picker-files">
        <div v-for="file in filteredPickerFiles" :key="file.id" class="knowledge-choice"><el-checkbox :model-value="isOwned(pickerBase) ? !!availableKnowledgeFile(file) : draftDocumentIds.includes(file.id)" :disabled="isOwned(pickerBase) || !canSelect(file)" :aria-label="`选择${file.title}`" @change="(checked: unknown)=>toggleFile(file.id,!!checked)"/><FileText :size="18"/><span><strong>{{ file.title }}</strong><small>{{ isOwned(pickerBase)?'所属知识库 · 自动使用':knowledgeFileStatus(file) }}</small></span><el-button text @click.prevent="preview(file,pickerBase.name)">查看</el-button></div>
        <el-empty v-if="!filteredPickerFiles.length" description="暂无文件"/>
      </div>
      <p class="knowledge-hint">新文件处理完成后才可选；选择的是原文件引用，更新成功后自动同步。</p><p v-if="pickerError" class="knowledge-error" role="alert">{{ pickerError }}</p>
    </div>
    <template #footer><el-button :disabled="saving" @click="pickerOpen=false">取消</el-button><el-button type="primary" :loading="saving" @click="confirmSelection">确认选择</el-button></template>
  </el-dialog>
  <el-dialog v-model="manageOpen" :title="ownedBase?.name || '所属知识库'" width="1150px" align-center append-to-body destroy-on-close @closed="afterManage"><KnowledgeFolderManager v-if="manageOpen && ownedBase" :initial-base-id="ownedBase.id" embedded @changed="refresh"/><template #footer><el-button @click="manageOpen=false">完成</el-button></template></el-dialog>
  <KnowledgeFilePreview v-model="previewOpen" :document="previewDocument" :base-name="previewBaseName"/>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {ChevronRight,FileText,Folder,FolderOpen,Plus} from 'lucide-vue-next';
import {ElMessage} from 'element-plus';
import {adminKnowledgeCoreApi as api,type KnowledgeBase,type KnowledgeDocument,type KnowledgeRelease,type KnowledgeProfile} from '../../api/admin';
import {availableKnowledgeFile,knowledgeFileStatus,selectedKnowledgeFiles,sameKnowledgeIndexes} from '../../utils/knowledge-files';
import KnowledgeFilePreview from './KnowledgeFilePreview.vue';
import KnowledgeFolderManager from './KnowledgeFolderManager.vue';
const props=withDefaults(defineProps<{modelValue:string[];disabled?:boolean;expertId?:string;expertName?:string}>(),{disabled:false,expertId:'',expertName:''});
const emit=defineEmits<{'update:modelValue':[string[]];changed:[];blockers:[string[]]}>();
type Entry={base:KnowledgeBase;documents:KnowledgeDocument[];releases:KnowledgeRelease[]};
const catalog=ref<Entry[]>([]),profiles=ref<KnowledgeProfile[]>([]),loading=ref(false),saving=ref(false),creating=ref(false),error=ref(''),pickerError=ref(''),pickerOpen=ref(false),manageOpen=ref(false),pickerBaseId=ref(''),search=ref(''),draftDocumentIds=ref<string[]>([]);
const previewOpen=ref(false),previewDocument=ref<KnowledgeDocument>(),previewBaseName=ref('');
let alive=true,generation=0;
const ownedBase=computed(()=>catalog.value.find(e=>e.base.ownerAgentId===props.expertId && !!props.expertId)?.base);
const ownedFiles=computed(()=>catalog.value.find(e=>e.base.id===ownedBase.value?.id)?.documents||[]);
const selectedRows=computed(()=>catalog.value.filter(e=>e.base.id!==ownedBase.value?.id).flatMap(entry=>{const ids=new Set(selectedKnowledgeFiles(entry.documents,entry.releases,props.modelValue));return entry.documents.filter(d=>ids.has(d.id)).map(document=>({document,base:entry.base}));}));
const unknownBindings=computed(()=>loading.value?[]:props.modelValue.filter(id=>!catalog.value.some(e=>e.releases.some(r=>r.id===id))));
const pickerEntry=computed(()=>catalog.value.find(e=>e.base.id===pickerBaseId.value));
const pickerBase=computed(()=>pickerEntry.value?.base);
const filteredCatalog=computed(()=>catalog.value.filter(e=>e.base.enabled&&`${e.base.name} ${e.base.ownerAgentName||''}`.toLowerCase().includes(search.value.toLowerCase())));
const filteredPickerFiles=computed(()=>(pickerEntry.value?.documents||[]).filter(d=>d.title.toLowerCase().includes(search.value.toLowerCase())));
function isOwned(base:KnowledgeBase){return !!props.expertId&&base.ownerAgentId===props.expertId;}
function canSelect(document:KnowledgeDocument){const available=availableKnowledgeFile(document);return !!available&&profiles.value.some(p=>p.enabled&&p.id===available.index.profileId);}
function preview(document:KnowledgeDocument,base:string){previewDocument.value=document;previewBaseName.value=base;previewOpen.value=true;}
async function refresh(){const request=++generation;loading.value=true;error.value='';try{const [bases,p]=await Promise.all([api.bases(),api.profiles()]);const entries=await Promise.all(bases.map(async base=>({base,documents:base.enabled?await api.documents(base.id):[],releases:base.enabled?await api.releases(base.id):[]})));if(!alive||request!==generation)return;profiles.value=p;catalog.value=entries;}catch(e){if(alive&&request===generation)error.value=e instanceof Error?e.message:'知识库加载失败';}finally{if(alive&&request===generation)loading.value=false;}}
async function createOwned(){if(props.disabled||creating.value)return;if(!props.expertId){ElMessage.info('请先填写专家信息并保存草稿，再创建所属知识库');return;}creating.value=true;try{const base=await api.createBase(props.expertName.trim()||'专家知识库',props.expertId);await refresh();if(!catalog.value.some(e=>e.base.id===base.id))catalog.value.push({base,documents:[],releases:[]});manageOpen.value=true;emit('changed');}catch(e){error.value=e instanceof Error?e.message:'创建失败';}finally{creating.value=false;}}
function manageOwn(){manageOpen.value=true;}
async function afterManage(){await refresh();emit('changed');}
async function openPicker(){pickerBaseId.value='';search.value='';pickerError.value='';await refresh();if(error.value)return;draftDocumentIds.value=selectedRows.value.map(row=>row.document.id);pickerOpen.value=true;}
function enterFolder(entry:Entry){pickerBaseId.value=entry.base.id;search.value='';}
function toggleFile(id:string,checked:boolean){draftDocumentIds.value=checked?[...new Set([...draftDocumentIds.value,id])]:draftDocumentIds.value.filter(value=>value!==id);}
async function saveFiles(documentIds:string[]){if(props.disabled||saving.value)return;saving.value=true;pickerError.value='';try{const next:string[]=props.modelValue.filter(id=>!catalog.value.some(e=>e.releases.some(r=>r.id===id)));for(const entry of catalog.value){if(isOwned(entry.base))continue;const selected=entry.documents.filter(d=>documentIds.includes(d.id));if(!selected.length)continue;const indexes=selected.map(d=>availableKnowledgeFile(d)?.index.id);if(indexes.some(id=>!id))throw new Error('部分文件尚未处理成功，请刷新后重试');const ids=indexes as string[];const release=entry.releases.find(r=>sameKnowledgeIndexes(r,ids))||await api.release(entry.base.id,ids);if(!entry.releases.some(r=>r.id===release.id))entry.releases.push(release);next.push(release.id);}if(next.length>20)throw new Error('最多引用 20 个文件夹中的资料');if(!alive)return;emit('update:modelValue',next);emit('changed');pickerOpen.value=false;}catch(e){pickerError.value=e instanceof Error?e.message:'文件选择保存失败';error.value=pickerError.value;}finally{if(alive)saving.value=false;}}
function confirmSelection(){void saveFiles(draftDocumentIds.value);}
function unlink(id:string){void saveFiles(selectedRows.value.map(row=>row.document.id).filter(value=>value!==id));}
onMounted(()=>{emit('blockers',[]);void refresh();});onBeforeUnmount(()=>{alive=false;generation++;});
defineExpose({refresh});
</script>
<style scoped>
.expert-knowledge-panel{display:grid;gap:9px;min-width:0}.knowledge-section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;font-size:12px;color:#777582}.knowledge-section-title button,.knowledge-unlink,.knowledge-error button,.knowledge-back{display:inline-flex;align-items:center;gap:4px;background:transparent;border:0;padding:0;color:#7654ef;font:inherit;cursor:pointer;font-size:12px}.knowledge-section-title button:disabled,.knowledge-unlink:disabled{opacity:.5;cursor:default}.knowledge-hint{font-size:12px;line-height:1.7;color:#9997a3;margin:0}.knowledge-file{display:flex;align-items:center;gap:8px;border-bottom:1px solid #efedf4;padding:9px 0;min-width:0}.knowledge-file>svg{color:#8a7cc2;flex-shrink:0}.knowledge-file>div{display:grid;gap:3px;flex:1;min-width:0}.knowledge-file-name{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:none;border:0;padding:0;text-align:left;color:#393743;font:inherit;font-size:13px;cursor:pointer}.knowledge-file small,.knowledge-auto{font-size:11px;line-height:1.5;color:#9997a3}.knowledge-auto{flex-shrink:0}.knowledge-error{font-size:12px;line-height:1.7;color:#b43f47;margin:0}.knowledge-picker{display:grid;gap:16px;min-width:0}.knowledge-picker-heading{display:flex;gap:9px;align-items:center;color:#7b7788;font-size:13px}.knowledge-selected-count{margin-left:auto;font-size:12px}.knowledge-folder-name{display:flex;align-items:center;gap:10px}.knowledge-folder-name svg{color:var(--el-color-primary)}.knowledge-folder-list :deep(.el-table__row){cursor:pointer}.knowledge-folder-list :deep(td){padding:14px 0}.knowledge-picker-files{max-height:50vh;overflow:auto}.knowledge-choice{display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--el-border-color-light);padding:14px 0}.knowledge-choice>span{flex:1;display:grid;gap:4px;min-width:0}.knowledge-choice strong{font-weight:500;overflow-wrap:anywhere}.knowledge-choice small{color:var(--el-text-color-secondary);font-size:12px}.knowledge-choice>svg{color:var(--el-color-primary);flex-shrink:0}
</style>
