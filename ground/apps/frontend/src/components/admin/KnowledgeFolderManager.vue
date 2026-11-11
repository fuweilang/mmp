<template>
  <section class="knowledge-folders" aria-label="知识库文件管理">
    <header class="folder-heading">
      <div><button v-if="baseId && !initialBaseId" type="button" class="folder-back" @click="showFolders"><ArrowLeft :size="16"/>全部文件夹</button><h2>{{ selectedBase?.name || '猛犸知识库' }}</h2><p>{{ selectedBase ? '上传后自动处理，完成后专家即可使用' : '按专家归置文件，支持跨专家引用' }}</p></div>
      <div class="folder-actions"><el-button v-if="selectedBase?.enabled" type="primary" :loading="uploading" @click="beginUpload"><Upload :size="15"/>上传文件</el-button><el-button v-if="!embedded" text @click="settingsOpen=true">高级设置</el-button></div>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <input ref="fileInput" type="file" multiple accept=".md,.markdown,.txt,.pdf,.docx,.pptx,.xlsx,.csv" aria-label="上传知识文件" class="hidden-input" @change="uploadFiles"/>
    <input ref="replaceInput" type="file" accept=".md,.markdown,.txt,.pdf,.docx,.pptx,.xlsx,.csv" aria-label="替换知识文件" class="hidden-input" @change="replaceFile"/>
    <template v-if="!baseId">
      <el-input v-model="folderSearch" clearable placeholder="搜索文件夹 / 所属专家" class="folder-search" aria-label="搜索文件夹" />
      <el-table :data="filteredBases" v-loading="loading" class="folder-list" @row-click="openBase" empty-text="暂无知识库，请在专家配置里按需创建">
        <el-table-column label="文件夹名称" min-width="240"><template #default="{row}"><span class="folder-name"><Folder :size="19"/><span>{{ row.name }}</span></span></template></el-table-column>
        <el-table-column label="文件数量" width="110"><template #default="{row}">{{ row._count?.documents ?? '—' }} 个文件</template></el-table-column>
        <el-table-column label="所属专家" min-width="160"><template #default="{row}"><span :class="{muted:!row.ownerAgentId}">{{ row.ownerAgent?.name || (row.ownerAgentName ? `${row.ownerAgentName}（已删除）` : '已有资料') }}</span></template></el-table-column>
        <el-table-column width="70"><template #default="{row}"><el-button text aria-label="进入文件夹" @click.stop="openBase(row)"><ChevronRight :size="17"/></el-button></template></el-table-column>
      </el-table>
      <p class="folder-help">在专家配置里创建知识库后，这里会出现所属文件夹。删除专家不会删除文件。</p>
    </template>
    <template v-else>
      <el-alert v-if="selectedBase && !selectedBase.enabled" title="此文件夹已停用，文件仍保留。" type="info" :closable="false" />
      <el-input v-model="fileSearch" clearable placeholder="搜索文件名" class="folder-search" aria-label="搜索文件" />
      <el-table :data="filteredDocuments" v-loading="loading" class="folder-file-list" empty-text="暂无文件，上传一份资料开始使用">
        <el-table-column label="文件名" min-width="230"><template #default="{row}"><button type="button" class="file-name" @click="preview(row)"><FileText :size="18"/><span>{{ row.title }}</span></button></template></el-table-column>
        <el-table-column label="状态" min-width="170"><template #default="{row}"><span :class="{muted:!availableKnowledgeFile(row)}">{{ knowledgeFileStatus(row) }}</span><div v-if="latestKnowledgeIndex(row)?.reasonCode" class="file-error">{{ reason(latestKnowledgeIndex(row)?.reasonCode || '') }}</div></template></el-table-column>
        <el-table-column label="分段" width="80"><template #default="{row}">{{ availableKnowledgeFile(row)?.index.chunkCount ?? '—' }}</template></el-table-column>
        <el-table-column label="更新时间" width="115"><template #default="{row}">{{ date(row.updatedAt || latestKnowledgeRevision(row)?.createdAt) }}</template></el-table-column>
        <el-table-column label="操作" min-width="210"><template #default="{row}"><el-button text @click="preview(row)">查看</el-button><el-button text :disabled="uploading || !row.enabled" @click="beginReplace(row)">替换</el-button><el-button v-if="retryable(row)" text @click="retry(row)">重试</el-button><el-button text type="danger" @click="remove(row)">删除</el-button></template></el-table-column>
      </el-table>
      <p class="folder-help">文件处理成功后自动生效；更新处理中继续使用旧内容。支持 Markdown、PDF 等文件，单文件不超过 20 MiB。</p>
    </template>
    <KnowledgeFilePreview v-model="previewOpen" :document="previewDocument" :base-name="selectedBase?.name" />
    <el-dialog v-model="settingsOpen" title="知识库高级设置" width="1180px" align-center append-to-body destroy-on-close><KnowledgeCoreAdmin settings-only/><template #footer><el-button text @click="emit('legacy')">查看旧资料</el-button><el-button @click="settingsOpen=false">关闭</el-button></template></el-dialog>
  </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {ArrowLeft,ChevronRight,FileText,Folder,Upload} from 'lucide-vue-next';
import {ElMessage,ElMessageBox} from 'element-plus';
import {adminKnowledgeCoreApi as api,type KnowledgeBase,type KnowledgeDocument} from '../../api/admin';
import {availableKnowledgeFile,knowledgeFileStatus,latestKnowledgeIndex,latestKnowledgeRevision} from '../../utils/knowledge-files';
import KnowledgeFilePreview from './KnowledgeFilePreview.vue';
import KnowledgeCoreAdmin from './KnowledgeCoreAdmin.vue';
const props=withDefaults(defineProps<{initialBaseId?:string;embedded?:boolean}>(),{initialBaseId:'',embedded:false});
const emit=defineEmits<{changed:[];legacy:[]}>();
const bases=ref<KnowledgeBase[]>([]),documents=ref<KnowledgeDocument[]>([]),baseId=ref(props.initialBaseId),folderSearch=ref(''),fileSearch=ref(''),error=ref(''),loading=ref(false),uploading=ref(false),settingsOpen=ref(false);
const fileInput=ref<HTMLInputElement>(),replaceInput=ref<HTMLInputElement>(),replaceTarget=ref<KnowledgeDocument>(),previewOpen=ref(false),previewDocument=ref<KnowledgeDocument>();
const selectedBase=computed(()=>bases.value.find(b=>b.id===baseId.value));
const filteredBases=computed(()=>bases.value.filter(b=>`${b.name} ${b.ownerAgent?.name||b.ownerAgentName||''}`.toLowerCase().includes(folderSearch.value.toLowerCase())));
const filteredDocuments=computed(()=>documents.value.filter(d=>`${d.title} ${latestKnowledgeRevision(d)?.originalName||''}`.toLowerCase().includes(fileSearch.value.toLowerCase())));
let alive=true,request=0,timer:ReturnType<typeof setTimeout>|undefined;
function reason(code:string){return ({EMBEDDING_SERVICE_UNCONFIGURED:'尚未配置可用语义服务，请到高级设置配置',PROFILE_DISABLED:'语义服务已停用',PROVIDER_CREDENTIALS_MISSING:'语义服务凭据尚未配置',PDF_TEXT_UNAVAILABLE:'PDF 未提取到文字，请转换后重新上传'} as Record<string,string>)[code]||code;}
function message(e:unknown){return reason(e instanceof Error?e.message:'操作失败，请重试');}
function date(value?:string){return value?new Date(value).toLocaleDateString('zh-CN'):'—';}
function preview(document:KnowledgeDocument){previewDocument.value=document;previewOpen.value=true;}
function stopPoll(){if(timer)clearTimeout(timer);timer=undefined;}
function schedule(){stopPoll();if(!alive||!baseId.value||!documents.value.some(d=>!['READY','FAILED','CANCELLED','PARTIAL','DOWNLOAD_ONLY'].includes(latestKnowledgeIndex(d)?.status||'')))return;timer=setTimeout(()=>void loadDocuments(false),2000);}
async function loadDocuments(showLoading=true){const id=baseId.value;if(!id)return;const version=++request;if(showLoading)loading.value=true;try{const rows=await api.documents(id);if(!alive||version!==request||id!==baseId.value)return;documents.value=rows;error.value='';schedule();}catch(e){if(alive&&version===request)error.value=message(e);}finally{if(alive&&version===request)loading.value=false;}}
async function reload(){loading.value=true;error.value='';try{bases.value=await api.bases();if(baseId.value)await loadDocuments();}catch(e){error.value=message(e);}finally{if(alive)loading.value=false;}}
async function openBase(base:KnowledgeBase){baseId.value=base.id;documents.value=[];fileSearch.value='';error.value='';if(base.enabled)await loadDocuments();}
function showFolders(){request++;stopPoll();baseId.value='';documents.value=[];error.value='';void reload();}
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
.knowledge-folders{display:grid;gap:18px;min-width:0}.folder-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.folder-heading h2{margin:0 0 5px;font-size:20px;font-weight:600}.folder-heading p,.folder-help{color:var(--el-text-color-secondary);font-size:13px;line-height:1.7;margin:0}.folder-actions{display:flex;gap:12px;align-items:center}.folder-actions svg{margin-right:6px}.folder-search{max-width:340px}.folder-list :deep(.el-table__row){cursor:pointer}.folder-list :deep(th.el-table__cell){background:var(--el-fill-color-light);font-weight:500}.folder-list :deep(td.el-table__cell){padding:14px 0}.folder-name,.file-name{display:flex;align-items:center;gap:10px}.folder-name svg{color:var(--el-color-primary);flex-shrink:0}.file-name{border:0;padding:0;background:transparent;color:var(--el-text-color-primary);font:inherit;cursor:pointer;text-align:left;overflow-wrap:anywhere}.file-name svg{color:var(--el-color-primary);flex-shrink:0}.file-name:hover{color:var(--el-color-primary)}.folder-back{display:flex;align-items:center;gap:6px;padding:0;margin:0 0 12px;border:0;background:transparent;color:var(--el-text-color-secondary);cursor:pointer;font:inherit;font-size:13px}.folder-file-list :deep(.el-button+.el-button){margin-left:6px}.muted{color:var(--el-text-color-secondary)}.file-error{font-size:12px;color:var(--el-color-danger);overflow-wrap:anywhere}.hidden-input{display:none}
</style>
