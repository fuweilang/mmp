<template>
  <el-dialog :model-value="true" :title="title" width="640px" align-center append-to-body class="library-modal" :close-on-click-modal="!running" :close-on-press-escape="!running" :show-close="!running" :before-close="close">
    <slot :busy="running || locked" :count="rows.length" />
    <div class="library-upload-drop" @dragover.prevent @drop.prevent="drop">
      <p>将文件拖到这里，或选择文件</p>
      <el-button :disabled="running" @click="input?.click()">选择{{ multiple ? '多个文件' : '文件' }}</el-button>
      <input ref="input" hidden type="file" :multiple="multiple" :accept="accept" @change="choose" />
    </div>
    <p class="library-upload-note">支持类型：{{ accept }}。{{ currentLimits ? `单文件上限 ${formatBytes(currentLimits.maxFileBytes)}。` : '正在检查上传限制。' }} {{ hint }} {{ multiple ? '每批最多50个，逐个上传。' : '替换版本一次只选择一个文件。' }} 上传成功仅表示已保存，AI可用性以处理状态为准。</p>
    <p v-if="running" role="status">上传期间请保持窗口打开；关闭页面不会撤销已发送的请求。</p>
    <p v-if="error" class="library-upload-error" role="alert">{{ error }}</p>
    <ul class="library-upload-list" aria-label="上传队列">
      <li v-for="row in rows" :key="row.id">
        <div><strong>{{ row.file.name }}</strong><span>{{ formatBytes(row.file.size) }}</span></div>
        <span role="status">{{ label(row) }}</span>
        <p v-if="row.message" :class="{ 'library-upload-error': row.status === 'failed' }">{{ row.message }}</p>
        <el-button v-if="row.status === 'failed'" size="small" :disabled="running" @click="start([row])">重试此文件</el-button>
      </li>
    </ul>
    <template #footer>
      <el-button :disabled="running" @click="close">关闭</el-button>
      <el-button v-if="rows.some(row => row.status === 'failed')" :disabled="running" @click="start(rows.filter(row => row.status === 'failed'))">重试失败项</el-button>
      <el-button type="primary" :loading="running" :disabled="running || !rows.some(row => row.status === 'queued')" @click="start(rows.filter(row => row.status === 'queued'))">开始上传</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { formatBytes } from '../utils/format';
import '../styles/libraryDialogs.css';
import { runLibraryUploads, type UploadRow, type UploadLimits } from '../utils/libraryUploadQueue';
const props = withDefaults(defineProps<{
  title?: string; hint: string; accept: string; multiple?: boolean;
  loadLimits: () => Promise<UploadLimits>;
  prepare?: (files: readonly File[]) => Promise<void> | void;
  uploadFile: (file: File, progress: (ratio: number) => void) => Promise<string | void>;
}>(), { title: '上传资料', multiple: true });
const emit = defineEmits<{ close: []; complete: [successes: number] }>();
const input = ref<HTMLInputElement>(); const rows = ref<UploadRow[]>([]);
const running = ref(false), locked = ref(false), error = ref('');
const currentLimits = ref<UploadLimits>();
let alive = true;
onBeforeUnmount(() => { alive = false; });
onMounted(() => { void props.loadLimits().then(value => { currentLimits.value = value; }).catch(cause => { error.value = cause instanceof Error ? cause.message : '无法获取上传限制'; }); });
function close() { if (!running.value) emit('close'); }
function add(files: File[]) {
  if (running.value) return;
  if (!props.multiple && (files.length > 1 || rows.value.length > 0)) { error.value = '替换一次只选一个文件；关闭后可重新选择。'; return; }
  const unique = files.filter(file => !rows.value.some(row => row.file.name === file.name && row.file.size === file.size && row.file.lastModified === file.lastModified));
  if (rows.value.length + unique.length > 50) { error.value = '每批最多50个文件，请分批上传。'; return; }
  rows.value.push(...unique.map(file => ({ id: crypto.randomUUID(), file, status: 'queued' as const })));
  error.value = '';
}
function choose(event: Event) { const element = event.target as HTMLInputElement; add(Array.from(element.files ?? [])); element.value = ''; }
function drop(event: DragEvent) {
  if (Array.from(event.dataTransfer?.items ?? []).some(item => item.webkitGetAsEntry?.()?.isDirectory)) { error.value = '暂不支持上传文件夹，请选择文件。'; return; }
  add(Array.from(event.dataTransfer?.files ?? []));
}
function label(row: UploadRow) {
  if (row.status === 'uploading') return row.progress === undefined ? '上传中' : `上传中 · 已传输${Math.round(row.progress * 100)}%${row.progress === 1 ? '，等待保存' : ''}`;
  return { queued: '等待上传', success: '上传成功', failed: '上传失败' }[row.status];
}
async function start(jobs: UploadRow[]) {
  if (running.value || !jobs.length) return;
  running.value = true; error.value = '';
  try {
    if (!locked.value) await props.prepare?.(jobs.map(row => row.file));
    const limits = await props.loadLimits(); currentLimits.value = limits; locked.value = true;
    const successes = await runLibraryUploads(jobs, limits, props.uploadFile, () => alive);
    if (alive) emit('complete', successes);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '无法开始上传'; }
  finally { running.value = false; }
}
</script>
<style scoped>
.library-upload-drop { border:1px dashed var(--el-border-color); border-radius:12px; background:var(--el-fill-color-light); text-align:center; padding:24px 16px; }
.library-upload-drop p { margin:0 0 12px; }
.library-upload-note { font-size:12px; line-height:1.6; color:var(--el-text-color-secondary); }
.library-upload-error { color:var(--el-color-danger); overflow-wrap:anywhere; }
.library-upload-list { list-style:none; padding:0; margin:12px 0 0; }
.library-upload-list li { padding:12px 0; border-bottom:1px solid var(--el-border-color-lighter); font-size:13px; }
.library-upload-list li > div { display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; }
.library-upload-list strong { font-weight:500; overflow-wrap:anywhere; min-width:0; }
.library-upload-list p { margin:4px 0; font-size:12px; overflow-wrap:anywhere; }
</style>
