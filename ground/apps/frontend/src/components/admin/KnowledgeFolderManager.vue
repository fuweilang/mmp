<template>
  <section class="knowledge-folders" aria-label="知识库文件管理">
    <header class="folder-heading">
      <div class="folder-title">
        <nav v-if="selectedBase && !initialBaseId" class="folder-crumb" aria-label="知识库位置">
          <el-button plain @click="showFolders"><ArrowLeft :size="15"/>返回全部文件夹</el-button>
          <strong>{{ selectedBase.name }}</strong>
        </nav>
        <h2 v-else-if="selectedBase">{{ selectedBase.name }}</h2>
        <el-input v-if="!baseId" v-model="folderSearch" clearable placeholder="搜索文件夹 / 所属专家" class="folder-search" aria-label="搜索文件夹" />
      </div>
      <div class="folder-actions">
        <el-input v-if="baseId" v-model="fileSearch" clearable placeholder="搜索文件名" class="folder-search" aria-label="搜索文件" />
        <el-button v-if="!baseId && !embedded" type="primary" :loading="creating" @click="createFolder"><Plus :size="15"/>新建文件夹</el-button>
        <el-button v-if="selectedBase?.enabled" type="primary" :loading="uploading" @click="beginUpload"><Upload :size="15"/>上传文件</el-button>
        <el-button v-if="!embedded && !baseId" @click="settingsOpen=true">高级设置</el-button>
      </div>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <input ref="fileInput" type="file" multiple accept=".md,.markdown,.txt,.pdf,.docx,.pptx,.xlsx,.csv" aria-label="上传知识文件" class="hidden-input" @change="uploadFiles"/>
    <input ref="replaceInput" type="file" accept=".md,.markdown,.txt,.pdf,.docx,.pptx,.xlsx,.csv" aria-label="替换知识文件" class="hidden-input" @change="replaceFile"/>
    <template v-if="!baseId">
      <el-table :data="pagedBases" v-loading="loading" border class="folder-list" empty-text="暂无文件夹">
        <el-table-column label="文件夹名称" min-width="240"><template #default="{row}"><button type="button" class="folder-name" @click="openBase(row)"><Folder :size="19"/><span>{{ row.name }}</span></button></template></el-table-column>
        <el-table-column label="文件数量" width="110"><template #default="{row}">{{ row._count?.documents ?? '—' }} 个文件</template></el-table-column>
        <el-table-column label="所属专家" min-width="160"><template #default="{row}"><span :class="{muted:!row.ownerAgentId}">{{ row.ownerAgent?.name || (row.ownerAgentName ? `${row.ownerAgentName}（已删除）` : '未指定专家') }}</span></template></el-table-column>
        <el-table-column label="操作" width="220" align="center" class-name="folder-ops" label-class-name="folder-ops"><template #default="{row}">
          <el-button text type="primary" @click.stop="openBase(row)">查看</el-button>
          <el-button text type="primary" @click.stop="renameFolder(row)">重命名</el-button>
          <el-button text type="danger" @click.stop="removeFolder(row)">删除</el-button>
        </template></el-table-column>
      </el-table>
      <div v-if="filteredBases.length" class="pagination-row">
        <el-pagination v-model:current-page="folderPage" v-model:page-size="folderPageSize" background layout="total, sizes, prev, pager, next" :page-sizes="pageSizes" :total="filteredBases.length" />
      </div>
      <p class="folder-help">在专家配置里创建知识库后，这里会出现所属文件夹。删除专家不会删除文件。</p>
    </template>
    <template v-else>
      <el-alert v-if="selectedBase && !selectedBase.enabled" title="此文件夹已停用，文件仍保留。" type="info" :closable="false" />
      <el-table :data="pagedDocuments" v-loading="loading" border class="folder-file-list" empty-text="暂无文件，上传一份资料开始使用">
        <el-table-column label="文件名" min-width="240"><template #default="{row}"><button type="button" class="file-name" @click="preview(row)"><FileText :size="18"/><span>{{ row.title }}</span></button></template></el-table-column>
        <el-table-column label="状态" width="120"><template #default="{row}"><span :class="{muted:!availableKnowledgeFile(row)}">{{ knowledgeFileStatus(row) }}</span><div v-if="latestKnowledgeIndex(row)?.reasonCode" class="file-error">{{ reason(latestKnowledgeIndex(row)?.reasonCode || '') }}</div></template></el-table-column>
        <el-table-column label="分段" width="72" align="center"><template #default="{row}">{{ availableKnowledgeFile(row)?.index.chunkCount ?? '—' }}</template></el-table-column>
        <el-table-column label="更新时间" width="120"><template #default="{row}">{{ date(row.updatedAt || latestKnowledgeRevision(row)?.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" width="248" align="center" class-name="file-ops" label-class-name="file-ops"><template #default="{row}"><el-button text type="primary" @click="preview(row)">查看</el-button><el-button text type="primary" :disabled="uploading || !row.enabled" @click="beginReplace(row)">替换</el-button><el-button v-if="retryable(row)" text @click="retry(row)">重试</el-button><el-button text type="danger" @click="remove(row)">删除</el-button></template></el-table-column>
      </el-table>
      <div v-if="filteredDocuments.length" class="pagination-row">
        <el-pagination v-model:current-page="filePage" v-model:page-size="filePageSize" background layout="total, sizes, prev, pager, next" :page-sizes="pageSizes" :total="filteredDocuments.length" />
      </div>
      <p class="folder-help">文件处理成功后自动生效；更新处理中继续使用旧内容。支持 Markdown、PDF 等文件，单文件不超过 20 MiB。</p>
    </template>
    <KnowledgeFilePreview v-model="previewOpen" :document="previewDocument" :base-name="selectedBase?.name" />
    <el-dialog v-model="settingsOpen" class="knowledge-settings-dialog" title="知识库高级设置" width="1180px" align-center append-to-body destroy-on-close><KnowledgeCoreAdmin settings-only/><template #footer><el-button @click="settingsOpen=false">关闭</el-button></template></el-dialog>
  </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {ArrowLeft,FileText,Folder,Plus,Upload} from 'lucide-vue-next';
import {ElMessage,ElMessageBox} from 'element-plus';
import {adminKnowledgeCoreApi as api,type KnowledgeBase,type KnowledgeDocument} from '../../api/admin';
import {availableKnowledgeFile,knowledgeFileStatus,latestKnowledgeIndex,latestKnowledgeRevision} from '../../utils/knowledge-files';
import KnowledgeFilePreview from './KnowledgeFilePreview.vue';
import KnowledgeCoreAdmin from './KnowledgeCoreAdmin.vue';
const props=withDefaults(defineProps<{initialBaseId?:string;embedded?:boolean}>(),{initialBaseId:'',embedded:false});
const emit=defineEmits<{changed:[]}>();
const route=props.embedded?null:useRoute();
const router=props.embedded?null:useRouter();
const pageSizes=[10,20,50,100];
const bases=ref<KnowledgeBase[]>([]),documents=ref<KnowledgeDocument[]>([]),baseId=ref(props.embedded?props.initialBaseId:String(route?.params.baseId||'')),folderSearch=ref(''),fileSearch=ref(''),folderPage=ref(1),filePage=ref(1),folderPageSize=ref(20),filePageSize=ref(20),error=ref(''),loading=ref(false),uploading=ref(false),settingsOpen=ref(false);
const fileInput=ref<HTMLInputElement>(),replaceInput=ref<HTMLInputElement>(),replaceTarget=ref<KnowledgeDocument>(),previewOpen=ref(false),previewDocument=ref<KnowledgeDocument>(),creating=ref(false);
const selectedBase=computed(()=>bases.value.find(b=>b.id===baseId.value));
const filteredBases=computed(()=>bases.value.filter(b=>`${b.name} ${b.ownerAgent?.name||b.ownerAgentName||''}`.toLowerCase().includes(folderSearch.value.toLowerCase())));
const filteredDocuments=computed(()=>documents.value.filter(d=>`${d.title} ${latestKnowledgeRevision(d)?.originalName||''}`.toLowerCase().includes(fileSearch.value.toLowerCase())));
const pagedBases=computed(()=>filteredBases.value.slice((folderPage.value-1)*folderPageSize.value,folderPage.value*folderPageSize.value));
const pagedDocuments=computed(()=>filteredDocuments.value.slice((filePage.value-1)*filePageSize.value,filePage.value*filePageSize.value));
watch(folderSearch,()=>{folderPage.value=1;});
watch(fileSearch,()=>{filePage.value=1;});
watch(folderPageSize,()=>{folderPage.value=1;});
watch(filePageSize,()=>{filePage.value=1;});
let alive=true,request=0,timer:ReturnType<typeof setTimeout>|undefined;
function reason(code:string){return ({EMBEDDING_SERVICE_UNCONFIGURED:'尚未配置可用语义服务，请到高级设置配置',PROFILE_DISABLED:'语义服务已停用',PROVIDER_CREDENTIALS_MISSING:'语义服务凭据尚未配置',PDF_TEXT_UNAVAILABLE:'PDF 未提取到文字，请转换后重新上传',KNOWLEDGE_BASE_IN_USE:'仍有专家引用此文件夹，请先在专家配置中改用其他知识库或关闭知识检索，再删除',KNOWLEDGE_BASE_IMMUTABLE:'此文件夹已有文档版本（版本不可变），不能彻底删除；请改为停用'} as Record<string,string>)[code]||code;}
function message(e:unknown){return reason(e instanceof Error?e.message:'操作失败，请重试');}
function date(value?:string){return value?new Date(value).toLocaleDateString('zh-CN'):'—';}
function preview(document:KnowledgeDocument){previewDocument.value=document;previewOpen.value=true;}
function stopPoll(){if(timer)clearTimeout(timer);timer=undefined;}
function schedule(){stopPoll();if(!alive||!baseId.value||!documents.value.some(d=>!['READY','FAILED','CANCELLED','PARTIAL','DOWNLOAD_ONLY'].includes(latestKnowledgeIndex(d)?.status||'')))return;timer=setTimeout(()=>void loadDocuments(false),2000);}
async function loadDocuments(showLoading=true){const id=baseId.value;if(!id)return;const version=++request;if(showLoading)loading.value=true;try{const rows=await api.documents(id);if(!alive||version!==request||id!==baseId.value)return;documents.value=rows;error.value='';schedule();}catch(e){if(alive&&version===request)error.value=message(e);}finally{if(alive&&version===request)loading.value=false;}}
async function reload(){loading.value=true;error.value='';try{bases.value=await api.bases();if(baseId.value)await loadDocuments();}catch(e){error.value=message(e);}finally{if(alive)loading.value=false;}}
async function enter(id:string){baseId.value=id;documents.value=[];fileSearch.value='';filePage.value=1;error.value='';const base=bases.value.find(b=>b.id===id);if(!base||base.enabled)await loadDocuments();}
async function openBase(base:KnowledgeBase){if(router){if(route?.params.baseId!==base.id)await router.push(`/admin/official-knowledge/${base.id}`);return;}await enter(base.id);}
function showFolders(){if(router){if(route?.params.baseId)void router.push('/admin/official-knowledge');return;}request++;stopPoll();baseId.value='';documents.value=[];filePage.value=1;error.value='';void reload();}
if(route)watch(()=>String(route.params.baseId||''),(id)=>{if(id===baseId.value)return;if(!id){request++;stopPoll();baseId.value='';documents.value=[];filePage.value=1;error.value='';void reload();return;}void enter(id);});
async function createFolder(){try{const {value}=await ElMessageBox.prompt('文件夹名称','新建文件夹',{inputValidator:v=>!!v?.trim()||'请填写名称',confirmButtonText:'创建',cancelButtonText:'取消'});creating.value=true;const base=await api.createBase(value.trim());await reload();ElMessage.success('已创建');await openBase(base);}catch(e){if(e!=='cancel'&&e!=='close')error.value=message(e);}finally{creating.value=false;}}
async function renameFolder(base:KnowledgeBase){try{const {value}=await ElMessageBox.prompt('文件夹名称','重命名',{inputValue:base.name,inputValidator:v=>!!v.trim()||'请填写名称'});await api.updateBase(base.id,{name:value.trim()});await reload();emit('changed');ElMessage.success('已重命名');}catch(e){if(e!=='cancel'&&e!=='close')error.value=message(e);}}
function escapeHtml(value:string){return value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));}
async function removeFolder(base:KnowledgeBase){const count=base._count?.documents??0;const name=`<span style="color:var(--el-color-primary)">${escapeHtml(base.name)}</span>`;try{await ElMessageBox.confirm(`将永久删除文件夹「${name}」及其中 ${count} 个文件、分段和索引，此操作不可恢复。仍有专家引用该文件夹时会删除失败。`,`删除“${base.name}”？`,{type:'warning',confirmButtonText:'删除文件夹',cancelButtonText:'取消',confirmButtonClass:'el-button--danger',dangerouslyUseHTMLString:true});await api.deleteBase(base.id);if(baseId.value===base.id)showFolders();else await reload();emit('changed');ElMessage.success('文件夹已删除');}catch(e){if(e!=='cancel'&&e!=='close')error.value=message(e);}}
function beginUpload(){fileInput.value?.click();}
function beginReplace(document:KnowledgeDocument){replaceTarget.value=document;replaceInput.value?.click();}
async function sendFiles(files:File[],documentId?:string){if(uploading.value||!baseId.value)return;const id=baseId.value;uploading.value=true;error.value='';try{for(const file of files){if(file.size>20*1024*1024)throw new Error(`${file.name} 超过 20 MiB`);if(!/\.(md|markdown|txt|pdf|docx|pptx|xlsx|csv)$/i.test(file.name))throw new Error(`${file.name} 的格式暂不支持`);const body=new FormData();body.set('file',file);body.set('idempotencyKey',crypto.randomUUID());if(documentId)body.set('documentId',documentId);await api.upload(id,body);}ElMessage.success('文件已上传，系统正在自动处理');if(alive&&id===baseId.value)await loadDocuments(false);emit('changed');}catch(e){error.value=message(e);}finally{if(alive)uploading.value=false;}}
function uploadFiles(event:Event){const input=event.target as HTMLInputElement;const files=Array.from(input.files||[]);input.value='';if(files.length)void sendFiles(files);}
function replaceFile(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0],target=replaceTarget.value;input.value='';if(file&&target)void sendFiles([file],target.id);}
function retryable(document:KnowledgeDocument){return ['FAILED','CANCELLED'].includes(latestKnowledgeIndex(document)?.job?.status||'');}
async function retry(document:KnowledgeDocument){const job=latestKnowledgeIndex(document)?.job;if(!job)return;try{await api.jobAction(job.id,'retry');await loadDocuments(false);}catch(e){error.value=message(e);}}
async function remove(document:KnowledgeDocument){try{const usage=await api.usage(document.id);await ElMessageBox.confirm(`删除后，所有引用此文件的专家都不能再调用。${usage.length?'影响专家：'+usage.map(e=>e.name).join('、')+'。':''}`,`删除“${document.title}”？`,{type:'warning',confirmButtonText:'删除文件',cancelButtonText:'取消'});await api.deleteDocument(document.id);await loadDocuments(false);emit('changed');ElMessage.success('文件已删除，所有专家的访问已撤销');}catch(e){if(e!=='cancel'&&e!=='close')error.value=message(e);}}
onMounted(reload);onBeforeUnmount(()=>{alive=false;request++;stopPoll();});
defineExpose({reload});
</script>
<style scoped>
.knowledge-folders{display:grid;gap:12px;min-width:0}.folder-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px}.folder-title{display:flex;align-items:center;gap:12px;min-width:0;flex:1 1 auto}.folder-heading h2{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:600;line-height:32px}.folder-crumb{display:flex;align-items:center;gap:10px;min-width:0}.folder-crumb :deep(.el-button){flex:0 0 auto}.folder-crumb :deep(svg){margin-right:4px}.folder-crumb strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:600;line-height:32px}.folder-help{color:var(--el-text-color-secondary);font-size:13px;line-height:1.7;margin:0}.folder-actions{display:flex;gap:8px;align-items:center;flex:0 0 auto}.folder-actions svg{margin-right:4px}.folder-search{width:240px}.folder-list.el-table,.folder-file-list.el-table{font-size:13px}.folder-list :deep(.el-table__cell),.folder-file-list :deep(.el-table__cell),.folder-list :deep(.el-button),.folder-file-list :deep(.el-button),.file-name{font-size:13px}.folder-list :deep(th.el-table__cell){background:var(--el-fill-color-light);font-weight:500}.folder-list :deep(td.el-table__cell){padding:14px 0}.folder-name,.file-name{display:flex;align-items:center;gap:10px;border:0;padding:0;background:transparent;color:var(--el-text-color-primary);font:inherit;cursor:pointer;text-align:left}.folder-name svg,.file-name svg{color:var(--el-color-primary);flex-shrink:0}.folder-name:hover,.file-name:hover{color:var(--el-color-primary)}.file-name{overflow-wrap:anywhere}.folder-list :deep(.el-button+.el-button),.folder-file-list :deep(.el-button+.el-button){margin-left:6px}.folder-list :deep(.folder-ops .cell),.folder-file-list :deep(.file-ops .cell){white-space:nowrap}.folder-list :deep(.folder-ops .el-button),.folder-file-list :deep(.file-ops .el-button){padding-left:6px;padding-right:6px}.pagination-row{display:flex;justify-content:flex-end}.muted{color:var(--el-text-color-secondary)}.file-error{font-size:12px;color:var(--el-color-danger);overflow-wrap:anywhere}.hidden-input{display:none}
</style>
<style>
.el-overlay-dialog:has(.knowledge-settings-dialog){display:flex;align-items:center;justify-content:center;box-sizing:border-box}
.el-dialog.knowledge-settings-dialog{display:flex;flex:0 0 auto;flex-direction:column;align-self:center;width:var(--el-dialog-width,1180px);max-width:calc(100vw - 80px);max-height:calc(100vh - 80px);max-height:calc(100dvh - 80px);margin:auto !important;box-sizing:border-box}
.knowledge-settings-dialog .el-dialog__header,.knowledge-settings-dialog .el-dialog__footer{flex:0 0 auto}
.knowledge-settings-dialog .el-dialog__body{min-height:0;overflow-y:auto}
</style>
