<template>
  <el-dialog :model-value="modelValue" :title="document?.title || '文件预览'" width="900px" align-center append-to-body destroy-on-close @update:model-value="emit('update:modelValue',$event)" @closed="invalidate">
    <div v-if="document" class="file-preview">
      <div class="file-meta"><span>{{ baseName }}</span><span>{{ knowledgeFileStatus(document) }}</span><span v-if="available">{{ available.index.chunkCount }} 个分段</span></div>
      <p v-if="usage.length" class="file-usage">使用专家：{{ usage.map(e=>e.name).join('、') }}</p>
      <el-alert v-if="latestKnowledgeIndex(document)?.id !== available?.index.id && available" title="新内容尚未处理成功，当前展示的仍是专家正在使用的内容。" type="info" :closable="false" />
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-tabs v-model="tab">
        <el-tab-pane label="知识分段" name="chunks">
          <div v-loading="loading" class="file-segments">
            <el-input v-if="available" v-model="query" clearable placeholder="搜索已加载的分段内容" aria-label="搜索分段内容" />
            <article v-for="chunk in filteredChunks" :key="chunk.id" class="file-segment"><small>分段 {{ chunk.ordinal+1 }}</small><pre>{{ chunk.text }}</pre></article>
            <el-empty v-if="!loading && !chunks.length" :description="available?'暂无分段':'文件仍在处理，完成后可查看分段'" />
            <el-button v-if="nextChunk!==null" :loading="loading" @click="loadChunks">加载更多分段</el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane label="原文件" name="original">
          <iframe v-if="revision?.parserFormat === '.pdf'" :src="api.originalUrl(document.id,revision.id,true)" class="file-pdf" title="PDF 原文件预览" />
          <div v-else v-loading="textLoading"><pre class="file-original">{{ originalText || (available?'正在加载原文…':'原文件已保存，可下载查看。') }}</pre><el-button v-if="nextText!==null" :loading="textLoading" @click="loadText">加载更多原文</el-button></div>
        </el-tab-pane>
      </el-tabs>
    </div>
    <template #footer><span class="preview-note">分段只读，修改内容请替换原文件</span><el-button @click="emit('update:modelValue',false)">关闭</el-button><a v-if="document && revision" :href="api.originalUrl(document.id,revision.id)" class="el-button el-button--primary">下载原文件</a></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed,ref,watch,onBeforeUnmount } from 'vue';
import { adminKnowledgeCoreApi as api,type KnowledgeDocument } from '../../api/admin';
import { availableKnowledgeFile,latestKnowledgeRevision,latestKnowledgeIndex,knowledgeFileStatus } from '../../utils/knowledge-files';
const props=defineProps<{modelValue:boolean;document?:KnowledgeDocument;baseName?:string}>();
const emit=defineEmits<{'update:modelValue':[boolean]}>();
type Chunk=Awaited<ReturnType<typeof api.chunks>>['chunks'][number];
const available=computed(()=>props.document&&availableKnowledgeFile(props.document));
const revision=computed(()=>available.value?.revision || (props.document&&latestKnowledgeRevision(props.document)));
const chunks=ref<Chunk[]>([]),originalText=ref(''),query=ref(''),tab=ref('chunks'),error=ref('');
const usage=ref<Array<{id:string;name:string}>>([]),loading=ref(false),textLoading=ref(false),nextChunk=ref<number|null>(0),nextText=ref<number|null>(0);
const filteredChunks=computed(()=>chunks.value.filter(c=>c.text.toLowerCase().includes(query.value.toLowerCase())));
let generation=0;
function invalidate(){generation++;loading.value=false;textLoading.value=false;}
async function loadChunks(){const d=props.document,a=available.value;if(!d||!a||loading.value||nextChunk.value===null)return;const request=generation;loading.value=true;try{const page=await api.chunks(d.id,a.revision.id,a.index.id,nextChunk.value);if(request!==generation)return;chunks.value.push(...page.chunks);nextChunk.value=page.nextOffset;}catch(e){if(request===generation)error.value=e instanceof Error?e.message:'分段加载失败';}finally{if(request===generation)loading.value=false;}}
async function loadText(){const d=props.document,a=available.value;if(!d||!a||textLoading.value||nextText.value===null)return;const request=generation;textLoading.value=true;try{const page=await api.extracted(d.id,a.revision.id,a.index.id,nextText.value);if(request!==generation)return;originalText.value+=page.text;nextText.value=page.nextOffset;}catch(e){if(request===generation)error.value=e instanceof Error?e.message:'原文加载失败';}finally{if(request===generation)textLoading.value=false;}}
watch(()=>[props.modelValue,props.document?.id] as const,async ([open])=>{invalidate();if(!open)return;chunks.value=[];originalText.value='';query.value='';tab.value='chunks';error.value='';usage.value=[];nextChunk.value=0;nextText.value=0;const request=generation;if(props.document)void api.usage(props.document.id).then(v=>{if(request===generation)usage.value=v;}).catch(()=>{});await loadChunks();},{immediate:true});
watch(tab,value=>{if(value==='original'&&!originalText.value&&revision.value?.parserFormat!=='.pdf')void loadText();});
onBeforeUnmount(invalidate);
</script>
<style scoped>
.file-preview{display:grid;gap:14px}.file-meta{display:flex;gap:18px;flex-wrap:wrap;color:var(--text-secondary,#777);font-size:13px}.file-usage{font-size:13px;color:var(--text-secondary,#777);margin:0}.file-segments{display:grid;gap:14px;max-height:60vh;overflow:auto;padding-right:6px}.file-segment{padding:14px 16px;border:1px solid var(--el-border-color-light);border-radius:8px}.file-segment small{color:var(--el-text-color-secondary);font-size:12px}.file-segment pre,.file-original{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.8;margin:10px 0 0}.file-original{max-height:60vh;overflow:auto}.file-pdf{display:block;width:100%;height:60vh;border:0}.preview-note{margin-right:auto;font-size:12px;color:var(--el-text-color-secondary)}
</style>
