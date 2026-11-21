<template>
  <el-dialog :model-value="true" :title="title" width="560px" align-center append-to-body class="library-modal library-upload-modal" :close-on-click-modal="!running" :close-on-press-escape="!running" :show-close="false" :before-close="close">
    <template #header>
      <div class="library-upload-header">
        <div class="library-upload-heading">
          <h3 class="el-dialog__title">{{ title }}</h3>
          <p>{{ subtitle }}</p>
        </div>
        <el-button link class="library-upload-close" :disabled="running" aria-label="关闭" @click="close"><X :size="18" /></el-button>
      </div>
    </template>
    <slot :busy="running || locked" :count="rows.length" />
    <div class="library-upload-drop" @dragover.prevent @drop.prevent="drop">
      <p>将文件拖到这里，或选择文件</p>
      <div class="library-upload-actions">
        <el-button :disabled="running" @click="input?.click()">选择文件</el-button>
        <el-button v-if="canChooseFolder" :disabled="running" @click="chooseFolder">选择文件夹</el-button>
      </div>
      <input ref="input" hidden type="file" :multiple="multiple" :accept="accept" @change="choose" />
      <input v-if="canChooseFolder" ref="folderInput" hidden type="file" multiple webkitdirectory directory aria-label="选择文件夹" @change="chooseFolderFiles" />
    </div>
    <p class="library-upload-note">{{ note }}</p>
    <div v-if="error" class="library-upload-warning" role="alert">{{ error }}</div>
    <p v-if="running" role="status" class="library-upload-note">上传期间请保持窗口打开；关闭页面不会撤销已发送的请求。</p>

    <section v-if="rows.length" class="library-upload-queue">
      <div class="library-upload-queue-head"><p>上传队列</p><span>待上传 {{ queuedCount }} 个文件</span></div>
      <ul class="library-upload-list" aria-label="上传队列">
        <li v-for="row in rows" :key="row.id">
          <div class="library-upload-row-main">
            <strong :title="row.displayPath || row.file.name">{{ row.displayPath || row.file.name }}</strong>
            <span class="library-upload-meta">{{ formatBytes(row.file.size) }}</span>
            <el-button v-if="row.status === 'queued'" link class="library-upload-remove" :aria-label="`移出 · ${row.displayPath || row.file.name}`" :disabled="running" @click="remove(row.id)"><X :size="14" /></el-button>
            <span v-else class="library-upload-status" :data-status="row.status">{{ label(row) }}</span>
          </div>
          <p v-if="row.message" class="library-upload-row-error">{{ row.message }}</p>
          <el-button v-if="row.status === 'failed'" size="small" :disabled="running" @click="start([row])">重试此文件</el-button>
        </li>
      </ul>
    </section>
    <template #footer>
      <div class="library-upload-footer">
        <span class="library-upload-count">待上传 {{ queuedCount }} 个文件</span>
        <div class="library-upload-footer-actions">
          <el-button :disabled="running" @click="close">关闭</el-button>
          <el-button v-if="rows.some(row => row.status === 'failed')" :disabled="running" @click="start(rows.filter(row => row.status === 'failed'))">重试失败项</el-button>
          <el-button type="primary" :loading="running" :disabled="running || !rows.some(row => row.status === 'queued')" @click="start(rows.filter(row => row.status === 'queued'))">开始上传</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { X } from 'lucide-vue-next';
import { formatBytes } from '../utils/format';
import '../styles/libraryDialogs.css';
import { runLibraryUploads, type UploadRow, type UploadLimits } from '../utils/libraryUploadQueue';
const props = withDefaults(defineProps<{
  title?: string; hint: string; accept: string; multiple?: boolean; simple?: boolean; folder?: boolean;
  loadLimits: () => Promise<UploadLimits>;
  prepare?: (files: readonly File[]) => Promise<void> | void;
  uploadFile: (file: File, progress: (ratio: number) => void, folderPath?: readonly string[]) => Promise<string | void>;
}>(), { title: '上传文件', multiple: true, folder: false });
const emit = defineEmits<{ close: []; complete: [successes: number] }>();
const input = ref<HTMLInputElement>(); const folderInput = ref<HTMLInputElement>(); const rows = ref<UploadRow[]>([]);
const running = ref(false), locked = ref(false), error = ref('');
const currentLimits = ref<UploadLimits>();
const canChooseFolder = computed(() => props.multiple && props.folder);
const queuedCount = computed(() => rows.value.filter(row => row.status === 'queued').length);
const subtitle = computed(() => props.multiple ? '每批最多 50 个' : '替换版本一次只选择一个文件。');
const note = computed(() => {
  const limit = currentLimits.value ? `单文件上限 ${formatBytes(currentLimits.value.maxFileBytes)}` : '';
  if (props.simple) {
    return `支持文档、PNG/JPEG/GIF/WebP/AVIF、MP4/WebM/MOV；单文件大小以上传限制为准。图片视频仅保存，不代表 AI 可读。${limit ? ` · ${limit}` : ''}`;
  }
  return `支持类型：${props.accept}。${limit ? `${limit}。` : '正在检查上传限制。'} ${props.hint} ${props.multiple ? '每批最多50个，逐个上传。' : '替换版本一次只选择一个文件。'}${canChooseFolder.value ? ' 可选择文件夹，最多 5 层。' : ''} 上传成功仅表示已保存，AI可用性以处理状态为准。`;
});
let alive = true;
onBeforeUnmount(() => { alive = false; });
function notify(message: string) { error.value = message; ElMessage.error(message); }
onMounted(() => { void props.loadLimits().then(value => { currentLimits.value = value; }).catch(cause => { notify(cause instanceof Error ? cause.message : '无法获取上传限制'); }); });
function close() { if (!running.value) emit('close'); }
function fileKey(displayPath: string, file: File) { return `${displayPath}\u0000${file.size}\u0000${file.lastModified}`; }
function add(files: File[]) {
  if (running.value) return;
  if (!props.multiple && (files.length > 1 || rows.value.length > 0)) { notify('替换一次只选一个文件；关闭后可重新选择。'); return; }
  const known = new Set(rows.value.map(row => fileKey(row.displayPath ?? row.file.name, row.file)));
  const unique = files.filter(file => { const key = fileKey(file.name, file); if (known.has(key)) return false; known.add(key); return true; });
  if (rows.value.length + unique.length > 50) { notify('每批最多50个文件，请分批上传。'); return; }
  rows.value.push(...unique.map(file => ({ id: crypto.randomUUID(), file, status: 'queued' as const })));
  error.value = '';
}
function addFolder(files: File[]) {
  if (running.value || !canChooseFolder.value) return;
  const entries: { file: File; folderPath: string[]; displayPath: string }[] = [];
  for (const file of files) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
    const parts = relative.split('/').filter(Boolean);
    if (parts.length < 2) continue;
    const name = parts[parts.length - 1]!;
    if (/^(?:\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(name) || parts.some(part => part.startsWith('._'))) continue;
    entries.push({ file, folderPath: parts.slice(0, -1), displayPath: parts.join('/') });
  }
  if (!entries.length) {
    notify(files.some(file => Boolean((file as File & { webkitRelativePath?: string }).webkitRelativePath)) ? '文件夹里没有可上传的文件。' : '请选择文件夹，而不是文件。');
    return;
  }
  if (new Set(entries.map(entry => entry.folderPath[0])).size !== 1) { notify('一次只能选择一个文件夹。'); return; }
  if (entries.some(entry => entry.folderPath.length > 5)) { notify('文件夹层级最多 5 层。'); return; }
  const known = new Set(rows.value.map(row => fileKey(row.displayPath ?? row.file.name, row.file)));
  const unique = entries.filter(entry => { const key = fileKey(entry.displayPath, entry.file); if (known.has(key)) return false; known.add(key); return true; });
  if (!unique.length) { error.value = ''; return; }
  if (rows.value.length + unique.length > 50) { notify('每批最多50个文件，请分批上传。'); return; }
  rows.value.push(...unique.map(entry => ({ id: crypto.randomUUID(), file: entry.file, folderPath: entry.folderPath, displayPath: entry.displayPath, status: 'queued' as const })));
  error.value = '';
}
function remove(id: string) { if (!running.value) rows.value = rows.value.filter(row => row.id !== id); }
function choose(event: Event) { const element = event.target as HTMLInputElement; add(Array.from(element.files ?? [])); element.value = ''; }
function chooseFolder() {
  if (running.value || !canChooseFolder.value) return;
  if (typeof HTMLInputElement === 'undefined' || !('webkitdirectory' in HTMLInputElement.prototype)) { notify('当前浏览器不支持选择文件夹。'); return; }
  folderInput.value?.click();
}
function chooseFolderFiles(event: Event) { const element = event.target as HTMLInputElement; addFolder(Array.from(element.files ?? [])); element.value = ''; }
function drop(event: DragEvent) {
  if (Array.from(event.dataTransfer?.items ?? []).some(item => item.webkitGetAsEntry?.()?.isDirectory)) { notify(canChooseFolder.value ? '拖拽文件夹暂不支持，请用「选择文件夹」。' : '暂不支持上传文件夹，请选择文件。'); return; }
  add(Array.from(event.dataTransfer?.files ?? []));
}
function label(row: UploadRow) {
  if (row.status === 'uploading') return row.progress === undefined ? '正在传输' : `正在传输 · 已传输${Math.round(row.progress * 100)}%${row.progress === 1 ? '，等待保存' : ''}`;
  return { queued: '等待上传', success: '上传成功', failed: '上传失败' }[row.status];
}
async function start(jobs: UploadRow[]) {
  if (running.value || !jobs.length) return;
  running.value = true; error.value = '';
  try {
    if (!locked.value) await props.prepare?.(jobs.map(row => row.file));
    const limits = await props.loadLimits(); currentLimits.value = limits; locked.value = true;
    const successes = await runLibraryUploads(jobs, limits, props.uploadFile, () => alive);
    if (alive) for (const row of jobs) if (row.status === 'failed' && row.message) ElMessage.error(`${row.displayPath ?? row.file.name}：${row.message}`);
    if (alive) emit('complete', successes);
    if (alive && rows.value.length > 0 && rows.value.every(row => row.status === 'success')) emit('close');
  } catch (cause) { notify(cause instanceof Error ? cause.message : '无法开始上传'); }
  finally { running.value = false; }
}
</script>
<style scoped>
.library-upload-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.library-upload-heading { display:flex; flex-direction:column; gap:4px; min-width:0; }
.library-upload-heading h3 { margin:0; color:var(--app-heading-color); font-size:17px; line-height:24px; font-weight:600; overflow-wrap:anywhere; }
.library-upload-heading .el-dialog__title { display:block; padding-right:0; }
.library-upload-heading p { margin:0; color:var(--el-text-color-secondary); font-size:12px; line-height:18px; }
.library-upload-close { flex:none; width:32px; height:32px; padding:0; }
.library-upload-drop { display:flex; flex-direction:column; align-items:center; gap:14px; padding:28px 20px; border:1px dashed color-mix(in srgb, var(--app-primary-color) 60%, #fff); border-radius:12px; background:var(--el-fill-color-light); text-align:center; }
.library-upload-drop:focus-within { border-color:var(--app-primary-color); }
.library-upload-drop p { margin:0; font-size:14px; font-weight:500; line-height:22px; }
.library-upload-actions { display:flex; justify-content:center; flex-wrap:wrap; gap:8px; }
.library-upload-note { margin:0; color:var(--el-text-color-secondary); font-size:12px; line-height:18px; }
.library-upload-warning { padding:10px 12px; border:1px solid #fecdca; border-radius:8px; background:#fef3f2; color:#b42318; font-size:12px; line-height:18px; overflow-wrap:anywhere; }
.library-upload-queue { display:flex; flex-direction:column; gap:8px; }
.library-upload-queue-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.library-upload-queue-head p { margin:0; font-size:13px; font-weight:600; }
.library-upload-queue-head span { color:var(--el-text-color-secondary); font-size:12px; }
.library-upload-list { display:flex; flex-direction:column; gap:6px; margin:0; padding:0; list-style:none; }
.library-upload-list li { display:flex; flex-direction:column; gap:6px; min-width:0; padding:10px 12px; border:1px solid var(--el-border-color-lighter); border-radius:8px; }
.library-upload-row-main { display:grid; grid-template-columns:minmax(0,1fr) auto auto; align-items:center; gap:8px; }
.library-upload-list strong { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; font-weight:500; }
.library-upload-meta, .library-upload-status { color:var(--el-text-color-secondary); font-size:12px; font-variant-numeric:tabular-nums; }
.library-upload-status[data-status='success'] { color:var(--el-color-success); }
.library-upload-status[data-status='failed'] { color:var(--el-color-danger); }
.library-upload-remove { width:24px; height:24px; padding:0; }
.library-upload-row-error { margin:0; color:var(--el-color-danger); font-size:12px; line-height:18px; overflow-wrap:anywhere; }
.library-upload-footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; width:100%; }
.library-upload-count { color:var(--el-text-color-secondary); font-size:12px; }
.library-upload-footer-actions { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-left:auto; }
</style>
