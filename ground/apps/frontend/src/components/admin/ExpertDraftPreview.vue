<template>
  <section class="expert-preview-panel" aria-label="专家试聊预览">
    <div class="expert-panel-heading">
      <h2>预览</h2>
      <div v-if="launchUrl" class="expert-preview-header-actions">
        <el-tooltip content="开启新会话"><el-button text aria-label="重新试聊" :disabled="resetting" @click="restart"><RotateCcw :size="15" /></el-button></el-tooltip>
      </div>
    </div>
    <div v-if="!resetting && (error || bridgeError || expired)" class="expert-preview-notices">
      <el-alert v-if="bridgeError" :title="bridgeError" type="error" :closable="false" />
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-alert v-if="expired" title="本次试聊已到期，下一次发送将自动重新开始。" type="info" :closable="false" />
    </div>
    <div class="expert-preview-stage">
    <div v-if="launchUrl" v-show="hasTranscript" class="expert-preview-viewport"><iframe ref="previewFrame" :key="launchUrl" :src="launchUrl" title="专家草稿试聊" class="expert-preview-frame" /></div>
    <div v-if="!hasTranscript && !outgoing" class="expert-preview-empty">
      <div class="expert-preview-profile">
        <div class="expert-preview-avatar"><img v-if="avatarUrl" :src="avatarUrl" alt="" /><UserRound v-else :size="27" /></div>
        <h3>{{ name || '未命名专家' }}</h3><p>{{ summary }}</p>
        <div v-if="starters.length" class="expert-preview-divider">试一试</div>
        <button v-for="starter in starters" :key="starter" type="button" class="expert-preview-starter" @click="chooseStarter(starter)">{{ starter }}<ChevronRight :size="18" /></button>
      </div>
    </div>
    <div v-if="outgoing" class="expert-preview-outgoing" aria-label="已发送的问题">
      <div class="expert-preview-user-bubble">{{ outgoing.text }}</div>
      <div v-if="!stopped" class="expert-preview-assistant-wait" role="status" aria-label="正在回复">
        <div class="expert-preview-byline"><span class="expert-preview-reply-avatar"><img v-if="avatarUrl" :src="avatarUrl" alt="" /><UserRound v-else :size="18" /></span><strong>{{ name || '未命名专家' }}</strong></div>
        <span class="expert-preview-waiting" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
    </div>
    </div>
    <div class="expert-preview-launch">
      <div class="expert-preview-composer-start">
        <el-input ref="questionInput" v-model="question" aria-label="预览问题" type="textarea" :rows="3" resize="none" placeholder="问我任何问题..." :readonly="!!pending" @keydown.enter.exact="onQuestionEnter" />
        <div class="expert-composer-controls">
          <span class="expert-composer-scope">使用左侧当前配置</span>
          <button v-if="canStop || cancelRequestId" type="button" class="expert-composer-send" aria-label="停止生成" :disabled="!!cancelRequestId" @click="stopGeneration"><Square :size="13" fill="currentColor" /></button>
          <button v-else type="button" class="expert-composer-send" aria-label="保存并试聊" title="发送试聊问题" :disabled="disabled || !!pending || !question.trim()" @click="submitQuestion"><LoaderCircle v-if="pending" :size="18" class="expert-spin" /><ArrowUp v-else :size="18" /></button>
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
const emit = defineEmits<{ preview: [question?: string, requestId?: string]; invalidate: [] }>();
const question = ref('');
const questionInput = ref<{focus:()=>void}>();
const previewFrame = ref<HTMLIFrameElement>();
const bridgeError = ref(''), readyUrl = ref(''), cancelRequestId = ref('');
const running = ref(false);
const stopped=ref(false), resetting=ref(false);
const canStop=computed(()=>!stopped.value && (!!pending.value || running.value));
let cancelWait:Promise<void>|undefined, cancelDone:(()=>void)|undefined, cancelTimer:ReturnType<typeof setTimeout>|undefined, disposed=false;
const hasTranscript = ref(false), userCount = ref(0);
const outgoing = ref<{text:string;afterUserCount:number}|null>(null);
const pending = ref<{requestId:string;text:string;dispatched:boolean} | null>(null);
let initializationTimer: ReturnType<typeof setTimeout> | undefined;
function clearInitializationTimer() { if (initializationTimer) clearTimeout(initializationTimer); }
function releasePending() {
  clearInitializationTimer();
  if (pending.value && !question.value) question.value=pending.value.text;
  pending.value=null;outgoing.value=null;
}
async function restart() {
  if(resetting.value) return;
  const stopping=requestStop();resetting.value=true;stopped.value=true;running.value=false;
  clearInitializationTimer();question.value='';pending.value=null;outgoing.value=null;
  hasTranscript.value=false;userCount.value=0;bridgeError.value='';
  // Reset switches session identity even if the old transport never acknowledges cancellation.
  cancelTimer=setTimeout(()=>finishStop(),1500);
  await stopping;
  if(cancelTimer) clearTimeout(cancelTimer);
  if(!disposed) {readyUrl.value='';emit('preview');}
}
function chooseStarter(text:string) {
  if (props.disabled || pending.value || running.value) return;
  question.value=text;submitQuestion();
}
function onQuestionEnter(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault(); submitQuestion();
}
function submitQuestion() {
  if (props.disabled || pending.value || cancelRequestId.value || (running.value && !stopped.value) || !question.value.trim()) return;
  if (question.value.length>16000) {bridgeError.value='试聊问题最多16000字，请缩短后发送。';return;}
  bridgeError.value='';
  stopped.value=false;resetting.value=false;
  const requestId=crypto.randomUUID();
  pending.value={requestId,text:question.value,dispatched:false};
  outgoing.value={text:question.value,afterUserCount:userCount.value};
  const text=question.value;question.value='';
  clearInitializationTimer();
  initializationTimer=setTimeout(()=>{
    if (!pending.value) return;
    releasePending();
    bridgeError.value='试聊尚未就绪，问题已保留，请稍后重新发送。';
    emit('invalidate');
  },30000);
  emit('preview',text,requestId);
}
function sendApprovedQuestion() {
  const request=pending.value;
  if (!request || request.dispatched || props.busy || props.stale || !props.launchUrl || readyUrl.value!==props.launchUrl || props.approvedRequestId!==request.requestId) return;
  const launch=new URL(props.launchUrl);
  // Once handed off, the ordinary session admission owns success/failure.
  // Do not time out locally and offer a second send while the first may be admitted.
  clearInitializationTimer();
  request.dispatched=true;
  previewFrame.value?.contentWindow?.postMessage({type:'mmp.expert-preview.submit',agentId:launch.searchParams.get('expertId'),previewId:launch.searchParams.get('expertPreview'),requestId:request.requestId,text:request.text,profile:{name:props.name,avatarUrl:props.avatarUrl}},launch.origin);
}
function finishStop(failed=false) {
  if(cancelTimer) clearTimeout(cancelTimer);
  cancelRequestId.value='';running.value=failed && !resetting.value;
  if(failed && !resetting.value) stopped.value=false;
  const done=cancelDone;cancelDone=undefined;cancelWait=undefined;done?.();
  if(failed && !resetting.value) bridgeError.value='停止生成失败，请稍后重试。';
}
function requestStop():Promise<void> {
  if(cancelWait) return cancelWait;
  if ((!running.value && !pending.value?.dispatched) || !props.launchUrl || readyUrl.value!==props.launchUrl) return Promise.resolve();
  const launch=new URL(props.launchUrl);
  bridgeError.value='';
  cancelRequestId.value=crypto.randomUUID();
  cancelWait=new Promise(resolve=>{cancelDone=resolve;});
  previewFrame.value?.contentWindow?.postMessage({type:'mmp.expert-preview.cancel',agentId:launch.searchParams.get('expertId'),previewId:launch.searchParams.get('expertPreview'),requestId:cancelRequestId.value},launch.origin);
  return cancelWait;
}
function stopGeneration() {
  if(!canStop.value || cancelRequestId.value) return;
  void requestStop();
  stopped.value=true;running.value=false;clearInitializationTimer();pending.value=null;
}
function onPreviewMessage(event: MessageEvent) {
  if (!props.launchUrl || event.source!==previewFrame.value?.contentWindow) return;
  const launch = new URL(props.launchUrl);
  if (event.origin!==launch.origin || !event.data || typeof event.data!=='object') return;
  const message = event.data;
  if (message.agentId!==launch.searchParams.get('expertId') || message.previewId!==launch.searchParams.get('expertPreview')) return;
  if(cancelRequestId.value && message.requestId===cancelRequestId.value && (message.type==='mmp.expert-preview.accepted' || message.type==='mmp.expert-preview.error')) {
    finishStop(message.type==='mmp.expert-preview.error');return;
  }
  if(resetting.value) return;
  if (message.type==='mmp.expert-preview.unavailable') {
    releasePending();hasTranscript.value=false;
    bridgeError.value='试聊暂时无法启动，问题已保留，请重新发送。';
    emit('invalidate');return;
  }
  if (message.type==='mmp.expert-preview.ready') {
    if (readyUrl.value===props.launchUrl && pending.value?.dispatched) {
      releasePending();
      bridgeError.value='试聊已重新连接，请先检查对话记录，确认问题是否已发送。';
    }
    readyUrl.value=props.launchUrl; sendApprovedQuestion(); return;
  }
  if (message.type==='mmp.expert-preview.content' && typeof message.hasMessages==='boolean' && Number.isInteger(message.userCount) && message.userCount>=0) {
    hasTranscript.value=message.hasMessages;
    userCount.value=message.userCount;
    if (outgoing.value && message.userCount>outgoing.value.afterUserCount) outgoing.value=null;
    return;
  }
  if (message.type==='mmp.expert-preview.state' && typeof message.running==='boolean') {
    running.value=message.running && !stopped.value;
    return;
  }
  const request=pending.value;
  if (!request || !request.dispatched || message.requestId!==request.requestId) return;
  if (message.type==='mmp.expert-preview.accepted') {
    clearInitializationTimer(); pending.value=null;
  } else if (message.type==='mmp.expert-preview.error') {
    releasePending();
    bridgeError.value=typeof message.message==='string' ? message.message.slice(0,500) : '试聊发送失败，问题已保留，请重试。';
  }
}
watch(()=>props.launchUrl,()=>{finishStop();resetting.value=false;readyUrl.value='';running.value=false;hasTranscript.value=false;userCount.value=0;if(outgoing.value)outgoing.value.afterUserCount=0;if(pending.value)pending.value.dispatched=false;});
watch(()=>[props.approvedRequestId,props.busy,props.stale],sendApprovedQuestion);
watch(()=>props.error,error=>{if(error && pending.value)releasePending();});
watch(()=>props.rejectedRequestId,id=>{if(id && pending.value?.requestId===id)releasePending();});
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
const expired = computed(() => !!props.launchUrl && Date.parse(props.expiresAt) <= now.value);
onMounted(() => { window.addEventListener('message',onPreviewMessage); timer = setInterval(() => { now.value = Date.now(); }, 15000); });
onBeforeUnmount(() => { disposed=true;finishStop();window.removeEventListener('message',onPreviewMessage); if (timer) clearInterval(timer); clearInitializationTimer(); });
</script>
