<template>
  <section class="expert-preview-panel" aria-label="专家试聊预览">
    <div class="expert-panel-heading">
      <h2>预览</h2>
      <div v-if="launchUrl" class="expert-preview-header-actions">
        <el-tooltip content="清空当前对话，使用左侧最新配置重新测试"><el-button text aria-label="重新试聊" :loading="busy" :disabled="disabled || running || !!pending" @click="emit('preview')"><RotateCcw :size="15" /></el-button></el-tooltip>
      </div>
    </div>
    <div v-if="error || bridgeError || (launchUrl && stale) || expired" class="expert-preview-notices">
      <el-alert v-if="bridgeError" :title="bridgeError" type="error" :closable="false" />
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-alert v-if="launchUrl && stale" title="左侧配置已修改，下一次发送将使用最新配置开始新的试聊。" type="info" :closable="false" />
      <el-alert v-if="expired" title="本次试聊已到期，下一次发送将自动重新开始。" type="info" :closable="false" />
    </div>
    <div v-if="launchUrl" class="expert-preview-viewport"><iframe ref="previewFrame" :key="launchUrl" :src="launchUrl" title="专家草稿试聊" class="expert-preview-frame" /></div>
    <div v-else class="expert-preview-empty">
      <div class="expert-preview-profile">
        <div class="expert-preview-avatar"><img v-if="avatarUrl" :src="avatarUrl" alt="" /><UserRound v-else :size="27" /></div>
        <h3>{{ name || '未命名专家' }}</h3><p>{{ summary }}</p>
        <div v-if="starters.length" class="expert-preview-divider">试一试</div>
        <button v-for="starter in starters" :key="starter" type="button" class="expert-preview-starter" @click="chooseStarter(starter)">{{ starter }}<ChevronRight :size="18" /></button>
      </div>
    </div>
    <div class="expert-preview-launch">
      <div class="expert-preview-composer-start">
        <el-input ref="questionInput" v-model="question" aria-label="预览问题" type="textarea" :rows="3" resize="none" placeholder="问我任何问题..." :disabled="busy || !!pending" @keydown.enter.exact="onQuestionEnter" />
        <div class="expert-composer-controls">
          <span class="expert-composer-scope">使用左侧当前配置</span>
          <button v-if="running" type="button" class="expert-composer-send" aria-label="停止生成" :disabled="!!cancelRequestId" @click="stopGeneration"><Square :size="13" fill="currentColor" /></button>
          <button v-else type="button" class="expert-composer-send" aria-label="保存并试聊" title="发送试聊问题" :disabled="disabled || busy || !!pending || !question.trim()" @click="submitQuestion"><LoaderCircle v-if="busy || pending" :size="18" class="expert-spin" /><ArrowUp v-else :size="18" /></button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowUp, ChevronRight, LoaderCircle, RotateCcw, Square, UserRound } from 'lucide-vue-next';
const props = withDefaults(defineProps<{
  name: string; summary: string; starters?: string[]; avatarUrl: string | null;
  launchUrl: string; expiresAt: string; busy: boolean; disabled: boolean; stale: boolean; error: string;
  approvedRequestId?: string; rejectedRequestId?: string;
}>(), { starters: () => [], approvedRequestId: '', rejectedRequestId: '' });
const emit = defineEmits<{ preview: [question?: string, requestId?: string] }>();
const question = ref('');
const questionInput = ref<{focus:()=>void}>();
const previewFrame = ref<HTMLIFrameElement>();
const bridgeError = ref(''), readyUrl = ref(''), cancelRequestId = ref('');
const running = ref(false);
const pending = ref<{requestId:string;text:string;dispatched:boolean} | null>(null);
let initializationTimer: ReturnType<typeof setTimeout> | undefined;
function clearInitializationTimer() { if (initializationTimer) clearTimeout(initializationTimer); }
function chooseStarter(text:string) { question.value=text; questionInput.value?.focus(); }
function onQuestionEnter(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault(); submitQuestion();
}
function submitQuestion() {
  if (props.disabled || props.busy || pending.value || running.value || !question.value.trim()) return;
  if (question.value.length>16000) {bridgeError.value='试聊问题最多16000字，请缩短后发送。';return;}
  bridgeError.value='';
  const requestId=crypto.randomUUID();
  pending.value={requestId,text:question.value,dispatched:false};
  clearInitializationTimer();
  initializationTimer=setTimeout(()=>{
    if (!pending.value) return;
    pending.value=null;
    bridgeError.value='试聊尚未就绪，问题已保留，请稍后重新发送。';
  },30000);
  emit('preview',question.value,requestId);
}
function sendApprovedQuestion() {
  const request=pending.value;
  if (!request || request.dispatched || props.busy || props.stale || !props.launchUrl || readyUrl.value!==props.launchUrl || props.approvedRequestId!==request.requestId) return;
  const launch=new URL(props.launchUrl);
  // Once handed off, the ordinary session admission owns success/failure.
  // Do not time out locally and offer a second send while the first may be admitted.
  clearInitializationTimer();
  request.dispatched=true;
  previewFrame.value?.contentWindow?.postMessage({type:'mmp.expert-preview.submit',agentId:launch.searchParams.get('expertId'),previewId:launch.searchParams.get('expertPreview'),requestId:request.requestId,text:request.text},launch.origin);
}
function stopGeneration() {
  if (!running.value || cancelRequestId.value || !props.launchUrl || readyUrl.value!==props.launchUrl) return;
  const launch=new URL(props.launchUrl);
  cancelRequestId.value=crypto.randomUUID();
  previewFrame.value?.contentWindow?.postMessage({type:'mmp.expert-preview.cancel',agentId:launch.searchParams.get('expertId'),previewId:launch.searchParams.get('expertPreview'),requestId:cancelRequestId.value},launch.origin);
}
function onPreviewMessage(event: MessageEvent) {
  if (!props.launchUrl || event.source!==previewFrame.value?.contentWindow) return;
  const launch = new URL(props.launchUrl);
  if (event.origin!==launch.origin || !event.data || typeof event.data!=='object') return;
  const message = event.data;
  if (message.agentId!==launch.searchParams.get('expertId') || message.previewId!==launch.searchParams.get('expertPreview')) return;
  if (message.type==='mmp.expert-preview.ready') { readyUrl.value=props.launchUrl; sendApprovedQuestion(); return; }
  if (message.type==='mmp.expert-preview.state' && typeof message.running==='boolean') {
    running.value=message.running;
    if (!message.running) cancelRequestId.value='';
    return;
  }
  if (message.type==='mmp.expert-preview.error' && message.requestId===cancelRequestId.value) {
    cancelRequestId.value='';bridgeError.value='停止生成失败，请稍后重试。';return;
  }
  const request=pending.value;
  if (!request || !request.dispatched || message.requestId!==request.requestId) return;
  if (message.type==='mmp.expert-preview.accepted') {
    clearInitializationTimer(); question.value=''; pending.value=null;
  } else if (message.type==='mmp.expert-preview.error') {
    clearInitializationTimer(); pending.value=null;
    bridgeError.value=typeof message.message==='string' ? message.message.slice(0,500) : '试聊发送失败，问题已保留，请重试。';
  }
}
watch(()=>props.launchUrl,()=>{readyUrl.value='';running.value=false;cancelRequestId.value='';if(pending.value)pending.value.dispatched=false;});
watch(()=>[props.approvedRequestId,props.busy,props.stale],sendApprovedQuestion);
watch(()=>props.error,error=>{if(error && pending.value){clearInitializationTimer();pending.value=null;}});
watch(()=>props.rejectedRequestId,id=>{if(id && pending.value?.requestId===id){clearInitializationTimer();pending.value=null;}});
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
const expired = computed(() => !!props.launchUrl && Date.parse(props.expiresAt) <= now.value);
onMounted(() => { window.addEventListener('message',onPreviewMessage); timer = setInterval(() => { now.value = Date.now(); }, 15000); });
onBeforeUnmount(() => { window.removeEventListener('message',onPreviewMessage); if (timer) clearInterval(timer); clearInitializationTimer(); });
</script>
