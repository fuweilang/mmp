<template>
  <el-dialog :model-value="modelValue" :title="document?.title || '文件预览'" width="900px" align-center append-to-body destroy-on-close @update:model-value="emit('update:modelValue',$event)" @closed="invalidate">
    <div v-if="document" class="file-preview">
      <div class="file-meta"><span>{{ knowledgeFileStatus(document) }}</span><span v-if="available">{{ available.index.chunkCount }} 个分段</span><span v-if="baseName">{{ baseName }}</span><span v-if="usage.length">使用专家：{{ usage.map(e=>e.name).join('、') }}</span></div>
      <el-alert v-if="latestKnowledgeIndex(document)?.id !== available?.index.id && available" title="新内容尚未处理成功，当前展示的仍是专家正在使用的内容。" type="info" :closable="false" />
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-tabs v-model="tab">
        <el-tab-pane label="知识分段" name="chunks">
          <div class="chunk-pane">
            <p class="preview-note">分段只读，修改内容请替换原文件</p>
            <el-input v-if="available" v-model="query" clearable placeholder="搜索已加载的分段内容" aria-label="搜索分段内容" />
            <div v-loading="loading" class="file-segments">
              <article v-for="chunk in filteredChunks" :key="chunk.id" class="file-segment"><small>分段 {{ chunk.ordinal+1 }}</small><pre>{{ chunk.text }}</pre></article>
              <el-empty v-if="!loading && !chunks.length" :description="available?'暂无分段':'文件仍在处理，完成后可查看分段'" />
              <el-button v-if="nextChunk!==null" :loading="loading" @click="loadChunks">加载更多分段</el-button>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="原文件" name="original">
          <iframe v-if="revision?.parserFormat === '.pdf'" :src="api.originalUrl(document.id,revision.id,true)" class="file-pdf" title="PDF 原文件预览" />
          <img v-else-if="imageDocument && revision" :src="api.originalUrl(document.id,revision.id,true)" class="file-image" alt="图片原文件预览" />
          <div v-else v-loading="textLoading"><pre class="file-original">{{ originalText || originalMessage }}</pre><el-button v-if="available && nextText!==null" :loading="textLoading" @click="loadText">加载更多原文</el-button></div>
        </el-tab-pane>
      </el-tabs>
    </div>
    <template #footer><el-button v-if="allowProcessing && document" :disabled="!document.enabled || !!document.deletedAt || !latestKnowledgeRevision(document)" @click="emit('process',document)">处理设置</el-button><el-button @click="emit('update:modelValue',false)">关闭</el-button><a v-if="document && revision" :href="api.originalUrl(document.id,revision.id)" class="el-button el-button--primary">下载原文件</a></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed,ref,watch,onBeforeUnmount } from 'vue';
import { adminKnowledgeCoreApi as api,type KnowledgeDocument } from '../../api/admin';
import { availableKnowledgeFile,latestKnowledgeRevision,latestKnowledgeIndex,knowledgeFileStatus } from '../../utils/knowledge-files';
const props=defineProps<{modelValue:boolean;document?:KnowledgeDocument;baseName?:string;allowProcessing?:boolean}>();
const emit=defineEmits<{'update:modelValue':[boolean];process:[KnowledgeDocument]}>();
type Chunk=Awaited<ReturnType<typeof api.chunks>>['chunks'][number];
const available=computed(()=>props.document&&availableKnowledgeFile(props.document));
const revision=computed(()=>available.value?.revision || (props.document&&latestKnowledgeRevision(props.document)));
const chunks=ref<Chunk[]>([]),originalText=ref(''),query=ref(''),tab=ref('chunks'),error=ref('');
const usage=ref<Array<{id:string;name:string}>>([]),loading=ref(false),textLoading=ref(false),nextChunk=ref<number|null>(null),nextText=ref<number|null>(null);
const filteredChunks=computed(()=>chunks.value.filter(c=>c.text.toLowerCase().includes(query.value.toLowerCase())));
const imageDocument=computed(()=>['.png','.jpg','.jpeg','.webp','.gif'].includes(revision.value?.parserFormat?.toLowerCase()||''));
const plainText=computed(()=>['.md','.markdown','.txt','.csv'].includes(revision.value?.parserFormat?.toLowerCase()||''));
const originalMessage=computed(()=>{if(originalText.value)return '';if(textLoading.value)return '正在加载原文…';if(available.value||plainText.value)return error.value?'原文件已保存，可下载查看。':'正在加载原文…';return '原文件已保存，可下载查看。';});
let generation=0;
function invalidate(){generation++;loading.value=false;textLoading.value=false;}
async function loadChunks(){const d=props.document,a=available.value;if(!d||!a||loading.value||nextChunk.value===null)return;const request=generation;loading.value=true;try{const page=await api.chunks(d.id,a.revision.id,a.index.id,nextChunk.value);if(request!==generation)return;chunks.value.push(...page.chunks);nextChunk.value=page.nextOffset;}catch(e){if(request===generation)error.value=e instanceof Error?e.message:'分段加载失败';}finally{if(request===generation)loading.value=false;}}
async function loadText(){const d=props.document,rev=revision.value;if(!d||!rev||textLoading.value)return;const indexed=available.value;if(indexed){if(nextText.value===null)return;}else if(!plainText.value)return;const request=generation;textLoading.value=true;try{if(indexed){const page=await api.extracted(d.id,indexed.revision.id,indexed.index.id,nextText.value??0);if(request!==generation)return;originalText.value+=page.text;nextText.value=page.nextOffset;}else{const response=await fetch(api.originalUrl(d.id,rev.id),{credentials:'same-origin'});if(!response.ok)throw new Error('原文加载失败');const text=await response.text();if(request!==generation)return;originalText.value=text;nextText.value=null;}}catch(e){if(request===generation)error.value=e instanceof Error?e.message:'原文加载失败';}finally{if(request===generation)textLoading.value=false;}}
watch(()=>[props.modelValue,props.document?.id] as const,async ([open])=>{invalidate();if(!open)return;chunks.value=[];originalText.value='';query.value='';tab.value='chunks';error.value='';usage.value=[];nextChunk.value=available.value?0:null;nextText.value=available.value?0:null;const request=generation;if(props.document)void api.usage(props.document.id).then(v=>{if(request===generation)usage.value=v;}).catch(()=>{});await loadChunks();},{immediate:true});
watch(tab,value=>{if(value==='original'&&!originalText.value&&!imageDocument.value&&revision.value?.parserFormat!=='.pdf')void loadText();});
onBeforeUnmount(invalidate);
</script>
<style scoped>
.file-preview{display:grid;gap:14px}.file-meta,.preview-note{color:var(--el-text-color-secondary);font-size:13px}.file-meta{display:flex;gap:18px;flex-wrap:wrap}.preview-note{margin:0}.chunk-pane{display:grid;gap:12px}.file-segments{display:grid;gap:14px;max-height:52vh;overflow:auto;padding-right:6px}.file-segment{padding:14px 16px;border:1px solid var(--el-border-color-light);border-radius:8px}.file-segment small{color:var(--el-text-color-secondary);font-size:12px}.file-segment pre,.file-original{white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0 0;color:#333946;font:inherit;font-size:13px;line-height:1.7}.file-original{max-height:60vh;overflow:auto}.file-image{display:block;max-width:100%;max-height:60vh;object-fit:contain;margin:0 auto}.file-pdf{display:block;width:100%;height:60vh;border:0}
</style>
