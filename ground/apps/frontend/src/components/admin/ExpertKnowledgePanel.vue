<template>
  <section class="expert-knowledge-panel" aria-label="专家知识库">
    <div class="expert-knowledge-bound" v-for="row in selectedRows" :key="row.id">
      <span class="expert-knowledge-icon"><Database :size="17" /></span>
      <span class="expert-knowledge-name">{{ row.name }}</span>
      <button type="button" class="expert-knowledge-icon-button" :disabled="!row.base" :aria-label="`查看${row.name}`" @click="row.base && openDocuments(row.base, row.owned ? '' : row.id)"><BookOpen :size="17" /></button>
      <button v-if="!row.owned" type="button" class="expert-knowledge-icon-button" :disabled="disabled" :aria-label="`移除${row.name}`" @click="unlink(row.id)"><Trash2 :size="17" /></button>
    </div>
    <button type="button" class="expert-knowledge-add" :disabled="disabled" @click="openPicker"><Plus :size="15" />添加知识库</button>
    <p v-if="catalogError" class="expert-knowledge-error" role="alert">{{ catalogError }} <button type="button" class="expert-knowledge-link" @click="refresh(true)">重试</button></p>
    <div v-for="op in operations" :key="op.baseId" class="expert-knowledge-notice" role="status">
      <span>{{ baseName(op.baseId) }}：{{ op.message }}</span>
      <button type="button" v-if="!op.busy" class="expert-knowledge-link" @click="resumeOperation(op)">{{ op.retryJob ? '重试处理' : op.jobId ? '继续检查' : '重试上传' }}</button>
      <a v-if="op.recovery" class="expert-knowledge-link" href="/admin/official-knowledge" target="_blank" rel="noopener">管理资料</a><button type="button" v-if="!op.busy" class="expert-knowledge-link" :disabled="disabled" @click="abandonOperation(op.baseId)">暂不关联</button>
    </div>
  </section>

  <el-dialog v-model="pickerOpen" class="expert-knowledge-dialog expert-knowledge-picker" width="1080px" align-center append-to-body :show-close="false" :close-on-click-modal="false" aria-label="添加知识库">
    <div class="expert-knowledge-picker-layout">
      <aside class="expert-knowledge-sidebar"><h2>添加知识库</h2><button type="button" class="expert-knowledge-primary" :disabled="disabled" @click="openCreate"><Plus :size="15" />创建知识库</button></aside>
      <main class="expert-knowledge-catalog">
        <header><h2>我的知识库</h2><button type="button" class="expert-knowledge-icon-button" aria-label="关闭添加知识库" @click="pickerOpen = false"><X :size="21" /></button></header>
        <div class="expert-knowledge-search"><Search :size="17" /><input v-model="search" aria-label="搜索知识库" placeholder="搜索知识库" /></div>
        <div class="expert-knowledge-list" v-loading="loading">
          <article v-for="entry in filteredCatalog" :key="entry.base.id" class="expert-knowledge-catalog-row">
            <span class="expert-knowledge-icon"><Database :size="23" /></span>
            <div class="expert-knowledge-row-copy"><strong>{{ entry.base.name }}</strong><small>{{ catalogMeta(entry) }}</small><small v-if="!entry.base.enabled">已停用</small><small v-else-if="!bindable(entry)">{{ entry.error || '资料待就绪或尚未发布' }}</small></div>
            <button type="button" class="expert-knowledge-icon-button" :aria-label="`查看${entry.base.name}资料`" @click="openDocuments(entry.base)"><Eye :size="18" /></button>
            <button type="button" class="expert-knowledge-pick" :class="{ 'is-added': baseIsBound(entry.base.id) }" :disabled="disabled || baseIsBound(entry.base.id) || !entry.base.enabled || !bindable(entry) || hasOperation(entry.base.id)" @click="addBase(entry)">{{ baseIsBound(entry.base.id) ? '已添加' : '添加' }}</button>
          </article>
          <p v-if="!loading && !filteredCatalog.length" class="expert-knowledge-empty">{{ search ? '未找到知识库' : '暂无知识库，创建一个开始吧' }}</p>
        </div>
      </main>
    </div>
  </el-dialog>

  <el-dialog v-model="createOpen" class="expert-knowledge-dialog expert-knowledge-create" width="488px" align-center append-to-body :show-close="false" :close-on-click-modal="false" aria-label="创建知识库">
    <header><h2>创建知识库</h2><button type="button" class="expert-knowledge-icon-button" aria-label="关闭创建知识库" :disabled="creating" @click="createOpen = false"><X :size="21" /></button></header>
    <form @submit.prevent="createBase"><label for="expert-knowledge-base-name">知识库名称 <span class="expert-knowledge-required">*</span></label><input id="expert-knowledge-base-name" v-model="newName" maxlength="100" placeholder="请输入知识库名称" :disabled="creating" required /><p v-if="createError" class="expert-knowledge-error" role="alert">{{ createError }}</p><footer><button type="button" class="expert-knowledge-secondary" :disabled="creating" @click="createOpen = false">取消</button><button type="submit" class="expert-knowledge-primary" :disabled="disabled || creating || !newName.trim()">{{ creating ? '创建中…' : '创建' }}</button></footer></form>
  </el-dialog>

  <el-dialog v-model="documentsOpen" class="expert-knowledge-dialog expert-knowledge-documents" width="720px" align-center append-to-body :show-close="false" :close-on-click-modal="false" aria-label="知识库资料">
    <header><h2>{{ activeBase?.name || '知识库资料' }}</h2><button type="button" class="expert-knowledge-primary" :disabled="disabled || !activeBase?.enabled || uploadBusy || !usableProfiles.length || !!activeOperation" @click="beginUpload"><Upload :size="16" />上传文件</button><button type="button" class="expert-knowledge-icon-button" aria-label="关闭知识库资料" @click="closeDocuments"><X :size="21" /></button></header>
    <input ref="fileInput" class="expert-knowledge-file-input" type="file" accept=".txt,.md,.markdown,.pdf,.docx,.pptx,.xlsx,.csv" aria-label="选择知识库文件" :disabled="disabled || uploadBusy || !!activeOperation" @change="chooseFile" />
    <div class="expert-knowledge-upload-options">
      <template v-if="usableProfiles.length > 1"><label for="expert-knowledge-profile">语义服务</label><select id="expert-knowledge-profile" ref="profileInput" v-model="profileId" :disabled="uploadBusy || disabled" @change="profileChanged"><option value="" disabled>请选择语义服务</option><option v-for="profile in usableProfiles" :key="profile.id" :value="profile.id">{{ profile.model }}</option></select></template>
      <span v-else-if="usableProfiles.length">支持 PDF、Word、PPT、Excel、文本，单文件不超过 20 MiB</span>
      <span v-else>尚未配置可用语义服务。<a href="/admin/official-knowledge" target="_blank" rel="noopener">配置检索服务</a><button type="button" class="expert-knowledge-link" @click="refresh(true)">配置后刷新</button></span>
    </div>
    <div v-if="viewReleaseId" class="expert-knowledge-bound-context"><span>当前专家使用的资料</span><button type="button" class="expert-knowledge-link" @click="viewReleaseId = ''">管理知识库</button></div>
    <p v-if="documentError" class="expert-knowledge-error" role="alert">{{ documentError }}</p>
    <div v-if="activeOperation" class="expert-knowledge-notice"><span>{{ activeOperation.message }}</span><button type="button" v-if="!activeOperation.busy" class="expert-knowledge-link" @click="resumeOperation(activeOperation)">{{ activeOperation.retryJob ? '重试处理' : activeOperation.jobId ? '继续检查' : '重试上传' }}</button><a v-if="activeOperation.recovery" class="expert-knowledge-link" href="/admin/official-knowledge" target="_blank" rel="noopener">管理资料</a><button type="button" v-if="!activeOperation.busy" class="expert-knowledge-link" :disabled="disabled" @click="abandonOperation(activeOperation.baseId)">暂不关联</button></div>
    <div class="expert-knowledge-document-list" v-loading="documentsLoading">
      <article v-for="document in activeDocuments" :key="`${document.id}:${newestRevision(document)?.id}:${newestRevision(document)?.indexes[0]?.id}`" class="expert-knowledge-document-row">
        <span class="expert-knowledge-file-icon"><FileText :size="24" /></span><div class="expert-knowledge-row-copy"><strong>{{ newestRevision(document)?.originalName || document.title }}</strong><small>{{ documentMeta(document) }}</small><small>{{ documentStatus(document) }}</small></div><button type="button" class="expert-knowledge-icon-button" :disabled="!newestRevision(document)" :aria-label="`预览${document.title}`" @click="openPreview(document)"><Eye :size="19" /></button>
      </article>
      <p v-if="!documentsLoading && !activeDocuments.length" class="expert-knowledge-empty">{{ viewReleaseId ? '当前关联资料暂不可用，请检查知识库状态' : '暂无资料，上传文件后即可查看和关联' }}</p>
    </div>
  </el-dialog>

  <el-dialog v-model="previewOpen" class="expert-knowledge-dialog expert-knowledge-preview" width="1210px" align-center append-to-body :show-close="false" :close-on-click-modal="false" aria-label="知识资料预览" @closed="invalidatePreview">
    <header><h2>{{ previewDocument?.title || '资料预览' }}</h2><a v-if="previewDocument && previewRevision" class="expert-knowledge-original" :href="api.originalUrl(previewDocument.id, previewRevision.id)" target="_blank" rel="noopener">查看原文件<ExternalLink :size="14" /></a><button type="button" class="expert-knowledge-icon-button" aria-label="关闭资料预览" @click="closePreview"><X :size="21" /></button></header>
    <div class="expert-knowledge-preview-content" v-loading="previewLoading">
      <p v-if="previewError" class="expert-knowledge-error" role="alert">{{ previewError }}</p>
      <p v-if="!previewIndexReady" class="expert-knowledge-empty">{{ previewDocument ? documentStatus(previewDocument) : '暂无资料' }}。原文件已保存，可点击「查看原文件」。</p>
      <template v-else><nav><button type="button" :class="{active: previewTab === 'text'}" @click="previewTab = 'text'">正文</button><button type="button" :class="{active: previewTab === 'chunks'}" @click="previewTab = 'chunks'">分段</button></nav><div v-if="previewTab === 'text'" class="expert-knowledge-text"><pre>{{ previewText }}</pre><button type="button" v-if="textOffset !== null" class="expert-knowledge-secondary" :disabled="previewLoading" @click="loadPreviewPage('text')">加载更多正文</button></div><div v-else><article v-for="chunk in previewChunks" :key="chunk.id" class="expert-knowledge-chunk"><small>分段 {{ chunk.ordinal + 1 }}</small><pre>{{ chunk.text }}</pre></article><button type="button" v-if="chunkOffset !== null" class="expert-knowledge-secondary" :disabled="previewLoading" @click="loadPreviewPage('chunks')">加载更多分段</button></div></template>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createExpertEditorResources, expertEditorResourcesKey } from './expert-editor-resources';
import { BookOpen, Database, ExternalLink, Eye, FileText, Plus, Search, Trash2, Upload, X } from 'lucide-vue-next';
import { adminKnowledgeCoreApi as api, type KnowledgeBase, type KnowledgeDocument, type KnowledgeJob, type KnowledgeProfile, type KnowledgeRelease, type KnowledgeRevision } from '../../api/admin';
import { latestBindableRelease, newestIndex, newestReadyIndexes, newestRevision, replaceBaseBinding } from './expert-knowledge-panel-state';
const props = withDefaults(defineProps<{ modelValue: string[]; disabled?: boolean; expertId?: string; expertName?: string }>(), { disabled: false, expertId: '', expertName: '' });
const emit = defineEmits<{ 'update:modelValue': [ids: string[]]; changed: []; blockers: [issues: string[]] }>();
type Entry = { base: KnowledgeBase; documents: KnowledgeDocument[]; releases: KnowledgeRelease[]; error?: string };
const resources=inject(expertEditorResourcesKey,undefined) ?? createExpertEditorResources();
const initialResources=resources.peek();
const copyCatalog=(entries:Entry[])=>entries.map(entry=>({...entry,documents:[...entry.documents],releases:[...entry.releases]}));
type Operation = { baseId: string; file: File; profileId: string; key: string; jobId?: string; retryJob?: boolean; recovery?: boolean; message: string; busy: boolean };
const catalog = ref<Entry[]>(initialResources ? copyCatalog(initialResources.catalog) : []), profiles = ref<KnowledgeProfile[]>(initialResources?.profiles ?? []), healthy = ref<Record<string, boolean>>(initialResources?.health ?? {});
const loading = ref(false), catalogError = ref(''), pickerOpen = ref(false), createOpen = ref(false), documentsOpen = ref(false), previewOpen = ref(false), search = ref('');
const viewReleaseId = ref(''), boundEntryContext = ref(false);
const newName = ref(''), creating = ref(false), createError = ref(''), activeBase = ref<KnowledgeBase>(), documentsLoading = ref(false), documentError = ref('');
const profileId = ref(''), fileInput = ref<HTMLInputElement>(), operations = ref<Operation[]>([]), uploadBusy = ref(false);
const profileInput = ref<HTMLSelectElement>();
let alive = true, catalogRequest = 0, documentRequest = 0, pollGeneration = 0, pollTimer: ReturnType<typeof setTimeout> | undefined, wakePoll: (() => void) | undefined;
const usableProfiles = computed(() => profiles.value.filter(p => p.enabled && p.task === 'EMBEDDING' && healthy.value[p.id]));
const filteredCatalog = computed(() => catalog.value.filter(entry => entry.base.name.toLowerCase().includes(search.value.toLowerCase())));
const activeEntry = computed(() => catalog.value.find(entry => entry.base.id === activeBase.value?.id));
const activeDocuments = computed(() => {
  const entry = activeEntry.value;
  if (!viewReleaseId.value) return entry?.documents ?? [];
  const release = entry?.releases.find(r => r.id === viewReleaseId.value);
  const frozen = new Set(release?.items.map(item => item.indexRevisionId) ?? []);
  return (entry?.documents ?? []).flatMap(document => document.revisions.flatMap(revision => { const indexes = revision.indexes.filter(index => frozen.has(index.id)); return indexes.map(index => ({ ...document, revisions: [{ ...revision, indexes: [index] }] })); }));
});
const activeOperation = computed(() => operations.value.find(op => op.baseId === activeBase.value?.id));
const ownedBase = computed(() => props.expertId ? catalog.value.find(entry => entry.base.ownerAgentId === props.expertId)?.base : undefined);
const selectedRows = computed(() => {
  const rows = props.modelValue.map(id => { const entry = catalog.value.find(e => e.releases.some(r => r.id === id)); return { id, name: entry?.base.name ?? (loading.value ? '正在加载知识库…' : '暂不可用的知识库'), base: entry?.base, owned: !!props.expertId && entry?.base.ownerAgentId === props.expertId }; });
  if (ownedBase.value && !rows.some(row => row.base?.id === ownedBase.value!.id)) rows.unshift({id:`owned:${ownedBase.value.id}`,name:ownedBase.value.name,base:ownedBase.value,owned:true});
  return rows;
});
watch(() => operations.value.map(op => `${baseName(op.baseId)}：${op.message}`), value => emit('blockers', value), { immediate: true });
function message(error: unknown) { return error instanceof Error ? error.message : '操作失败，请重试'; }
function baseName(id: string) { return catalog.value.find(e => e.base.id === id)?.base.name ?? '知识库'; }
function bytes(size: number) { return size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function date(value?: string) { return value ? new Date(value).toLocaleDateString('zh-CN') : ''; }
function documentMeta(document: KnowledgeDocument) { const r = newestRevision(document); return r ? `${bytes(r.sizeBytes)} · ${date(r.createdAt)}` : '暂无文件'; }
function catalogMeta(entry: Entry) { const revisions = entry.documents.map(newestRevision).filter((r): r is KnowledgeRevision => !!r); return `${revisions.length} 个文件 · ${bytes(revisions.reduce((sum, r) => sum + r.sizeBytes, 0))}${revisions.length ? ` · ${date([...revisions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]?.createdAt)}` : ''}`; }
function documentStatus(document: KnowledgeDocument) { if (!document.enabled) return '已停用'; const r = newestRevision(document), i = r && newestIndex(r); return i?.status === 'READY' ? (usableProfiles.value.some(p => p.id === i.profileId) ? '已就绪' : '语义服务待配置，可查看原文件') : ['FAILED', 'CANCELLED', 'PARTIAL', 'DOWNLOAD_ONLY'].includes(i?.status ?? '') ? '处理未完成，可查看原文件' : '正在处理，可查看原文件'; }
function bindable(entry: Entry) { return entry.base.enabled && !entry.error ? latestBindableRelease(entry.releases, entry.documents, profiles.value, healthy.value) : undefined; }
function baseIsBound(id: string) { return ownedBase.value?.id === id || (catalog.value.find(e => e.base.id === id)?.releases.some(r => props.modelValue.includes(r.id)) ?? false); }
function hasOperation(id: string) { return operations.value.some(op => op.baseId === id); }
function chooseUploadProfile() {
  const available = new Set(usableProfiles.value.map(profile => profile.id));
  if (available.has(profileId.value)) return; // Retain an explicit or already usable selection.
  const uniqueProfile = (entries: Entry[], frozen?: Set<string>) => {
    const ids = new Set(entries.flatMap(entry => entry.documents.flatMap(document => document.enabled ? document.revisions.flatMap(revision => revision.indexes.filter(index => (!frozen || frozen.has(index.id)) && available.has(index.profileId)).map(index => index.profileId)) : [])));
    return ids.size === 1 ? [...ids][0] : undefined;
  };
  const bound = catalog.value.filter(entry => entry.releases.some(release => props.modelValue.includes(release.id)));
  const frozen = new Set(bound.flatMap(entry => entry.releases.filter(release => props.modelValue.includes(release.id)).flatMap(release => release.items.map(item => item.indexRevisionId))));
  profileId.value = uniqueProfile(activeEntry.value ? [activeEntry.value] : [])
    ?? uniqueProfile(bound, frozen)
    ?? (usableProfiles.value.length === 1 ? usableProfiles.value[0]!.id : '');
}
function profileChanged() { if (profileId.value && documentError.value === '请选择语义服务，再上传文件') documentError.value = ''; }
function unlink(id: string) { if (!props.disabled) emit('update:modelValue', props.modelValue.filter(value => value !== id)); }
function addBase(entry: Entry) { const release = bindable(entry); if (props.disabled || !release || baseIsBound(entry.base.id) || hasOperation(entry.base.id)) return; emit('update:modelValue', replaceBaseBinding(props.modelValue, entry.releases, release.id)); emit('changed'); }
async function refresh(force=false) {
  const request = ++catalogRequest; loading.value = true; catalogError.value = '';
  try {
    const {catalog:entries,profiles:allProfiles,health} = await resources.load(force);
    if (!alive || request !== catalogRequest) return;
    profiles.value = allProfiles; healthy.value = health; catalog.value = copyCatalog(entries);
    chooseUploadProfile();
  } catch (error) { if (alive && request === catalogRequest) catalogError.value = `知识库加载失败：${message(error)}`; }
  finally { if (alive && request === catalogRequest) loading.value = false; }
}
async function refreshBase(id: string) {
  const [documents, releases] = await Promise.all([api.documents(id), api.releases(id)]);
  if (!alive) return;
  const entry = catalog.value.find(e => e.base.id === id);
  if (entry) { entry.documents = documents; entry.releases = releases; entry.error = undefined; }
  return entry;
}
function openPicker() { pickerOpen.value = true; void refresh(true); }
function openCreate() { newName.value = ''; createError.value = ''; createOpen.value = true; }
async function createBase() {
  if (props.disabled || creating.value || !newName.value.trim()) return;
  creating.value = true; createError.value = '';
  try { const base = props.expertId && !ownedBase.value ? await api.createBase(newName.value.trim(),props.expertId) : await api.createBase(newName.value.trim()); if (!alive) return; catalogRequest++; loading.value=false; resources.invalidate(); catalog.value.push({ base, documents: [], releases: [] }); createOpen.value = false; await openDocuments(base); }
  catch (error) { if (alive) createError.value = message(error); }
  finally { if (alive) creating.value = false; }
}
async function openDocuments(base: KnowledgeBase, releaseId = '') {
  stopPolling(); viewReleaseId.value = releaseId; boundEntryContext.value = !!releaseId; activeBase.value = base; documentsOpen.value = true; documentError.value = ''; documentsLoading.value = true; const request = ++documentRequest;
  try { const data=await resources.load(); if(!alive || request!==documentRequest) return; profiles.value=data.profiles;healthy.value=data.health; await refreshBase(base.id); if (alive && request === documentRequest) { chooseUploadProfile(); const op = operations.value.find(o => o.baseId === base.id); if (op?.jobId && !op.busy) void resumeOperation(op, false); } }
  catch (error) { if (alive && request === documentRequest) documentError.value = message(error); }
  finally { if (alive && request === documentRequest) documentsLoading.value = false; }
}
function beginUpload() {
  if (props.disabled || !activeBase.value?.enabled || uploadBusy.value || activeOperation.value || !usableProfiles.value.length) return;
  chooseUploadProfile();
  if (!usableProfiles.value.some(profile => profile.id === profileId.value)) {
    documentError.value = '请选择语义服务，再上传文件';
    profileInput.value?.focus();
    return;
  }
  profileChanged(); viewReleaseId.value = ''; fileInput.value?.click();
}
function closeDocuments() { documentsOpen.value = false; documentRequest++; stopPolling(); }
watch(documentsOpen, open => { if (!open) { documentRequest++; stopPolling(); } });
watch(() => props.disabled, disabled => { if (disabled) stopPolling(); });
function stopPolling() { pollGeneration++; if (pollTimer) clearTimeout(pollTimer); pollTimer = undefined; wakePoll?.(); wakePoll = undefined; }
function waitPoll() { return new Promise<void>(resolve => { wakePoll = resolve; pollTimer = setTimeout(() => { pollTimer = undefined; wakePoll = undefined; resolve(); }, 2000); }); }
function abandonOperation(baseId: string) { if (props.disabled) return; stopPolling(); operations.value = operations.value.filter(op => op.baseId !== baseId); }
async function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = '';
  if (!file || props.disabled || uploadBusy.value || !activeBase.value || activeOperation.value) return;
  if (file.size > 20 * 1024 * 1024) { documentError.value = '文件不能超过 20 MiB'; return; }
  if (!/\.(txt|md|markdown|pdf|docx|pptx|xlsx|csv)$/i.test(file.name)) { documentError.value = '请选择支持的文件格式'; return; }
  const profile = usableProfiles.value.find(p => p.id === profileId.value);
  if (!profile) { documentError.value = '请先选择可用的语义服务'; return; }
  const op: Operation = { baseId: activeBase.value.id, file, profileId: profile.id, key: crypto.randomUUID(), message: '正在上传文件，完成后将自动关联', busy: false };
  operations.value.push(op); await resumeOperation(operations.value.find(o => o.key === op.key)!);
}
async function resumeOperation(op: Operation, retryFailed = true) {
  if (!alive || props.disabled || op.busy || uploadBusy.value) return;
  if (!documentsOpen.value || activeBase.value?.id !== op.baseId) { const base = catalog.value.find(e => e.base.id === op.baseId)?.base; if (base) await openDocuments(base); if (!alive || props.disabled || !documentsOpen.value || activeBase.value?.id !== op.baseId || op.busy || !operations.value.some(value => value.key === op.key)) return; }
  op.busy = true; documentError.value = ''; const generation = ++pollGeneration;
  try {
    if (!op.jobId) {
      uploadBusy.value = true; op.message = '正在上传文件，完成后将自动关联';
      const body = new FormData(); body.set('file', op.file); body.set('profileId', op.profileId); body.set('idempotencyKey', op.key);
      const job = await api.upload(op.baseId, body); if (!alive) return; op.jobId = job.id; uploadBusy.value = false;
      await refreshBase(op.baseId);
    } else if (op.retryJob && retryFailed) {
      op.message = '正在重新处理已保存文件';
      const currentJob = await api.job(op.jobId);
      if (!alive || generation !== pollGeneration || !documentsOpen.value || props.disabled || !operations.value.some(value => value.key === op.key)) { op.message = '资料仍在处理，打开资料后可继续检查'; return; }
      // A lost retry response may already have queued this same job. Observe it
      // instead of asking the server to retry an active task a second time.
      if (['FAILED', 'CANCELLED'].includes(currentJob.status)) await api.jobAction(op.jobId, 'retry');
      if (!alive || generation !== pollGeneration || !documentsOpen.value || props.disabled || !operations.value.some(value => value.key === op.key)) { op.message = '资料仍在处理，打开资料后可继续检查'; return; }
      op.retryJob = false; op.recovery = false;
    }
    // Bounded local observation. Closing this view never cancels the server job.
    for (let attempt = 0; attempt < 90; attempt++) {
      if (!alive || generation !== pollGeneration || !documentsOpen.value || props.disabled || !operations.value.some(value => value.key === op.key)) { op.message = '资料仍在处理，打开资料后可继续检查'; return; }
      op.message = '文件已保存，正在处理并准备关联';
      const job: KnowledgeJob = await api.job(op.jobId!);
      if (!alive || generation !== pollGeneration || !documentsOpen.value || props.disabled || !operations.value.some(value => value.key === op.key)) { op.message = '资料仍在处理，打开资料后可继续检查'; return; }
      const entry = await refreshBase(op.baseId);
      if (!alive || generation !== pollGeneration || !documentsOpen.value || props.disabled || !operations.value.some(value => value.key === op.key)) { op.message = '资料仍在处理，打开资料后可继续检查'; return; }
      if (job.index?.status === 'READY') {
        const currentProfiles = await api.profiles();
        const currentHealth = await Promise.all(currentProfiles.filter(p => p.enabled && p.task === 'EMBEDDING').map(async p => { try { return [p.id, (await api.health(p.id)).configured] as const; } catch { return [p.id, false] as const; } }));
        if (!alive || generation !== pollGeneration || !documentsOpen.value || props.disabled || !operations.value.some(value => value.key === op.key)) { op.message = '资料仍在处理，打开资料后可继续检查'; return; }
        profiles.value = currentProfiles; healthy.value = Object.fromEntries(currentHealth);
        const ids = entry && newestReadyIndexes(entry.documents, profiles.value, healthy.value);
        if (!entry || !entry.base.enabled || !ids?.includes(job.index.id)) { op.message = '最新资料或语义服务尚未就绪，请检查后继续'; return; }
        op.message = '资料已就绪，正在完成关联';
        const existing = bindable(entry);
        const release = existing ?? await api.release(op.baseId, ids);
        if (!alive || generation !== pollGeneration || !documentsOpen.value || props.disabled || !operations.value.some(value => value.key === op.key)) { op.message = '资料已就绪，打开资料后可继续关联'; return; }
        if (!entry.releases.some(r => r.id === release.id)) entry.releases.unshift(release);
        // Only now replace this base's binding; unrelated bases and old immutable
        // references remain unchanged while upload/indexing/release are pending.
        if (!props.expertId || entry.base.ownerAgentId !== props.expertId) emit('update:modelValue', replaceBaseBinding(props.modelValue, entry.releases, release.id));
        if (boundEntryContext.value && activeBase.value?.id === op.baseId) viewReleaseId.value = release.id;
        operations.value = operations.value.filter(value => value.key !== op.key); emit('changed'); return;
      }
      if (['FAILED', 'CANCELLED'].includes(job.status) || ['FAILED', 'PARTIAL', 'DOWNLOAD_ONLY', 'CANCELLED'].includes(job.index?.status ?? '')) { op.retryJob = ['FAILED', 'CANCELLED'].includes(job.status); op.recovery = true; op.message = op.retryJob ? '资料处理失败，原文件已保存；检查语义服务后可重试处理' : '资料无法完成语义索引，请前往管理资料检查格式或停用此文件'; return; }
      if (job.status === 'SUCCEEDED' && job.index?.status !== 'READY') { op.message = '文件已保存，但语义索引尚未就绪，请检查后继续'; return; }
      await waitPoll();
    }
    op.message = '资料仍在处理，可稍后继续检查';
  } catch (error) { if (alive) op.message = op.jobId ? `处理或关联未完成：${message(error)}` : `上传结果待确认：${message(error)}。重试将复用本次上传`; }
  finally { if (alive) { op.busy = false; uploadBusy.value = false; } }
}

const previewDocument = ref<KnowledgeDocument>(), previewRevision = ref<KnowledgeRevision>(), previewTab = ref<'text' | 'chunks'>('text'), previewText = ref(''), previewError = ref(''), previewLoading = ref(false);
type Chunk = Awaited<ReturnType<typeof api.chunks>>['chunks'][number];
const previewChunks = ref<Chunk[]>([]), textOffset = ref<number | null>(null), chunkOffset = ref<number | null>(null);
let previewRequest = 0;
const previewIndex = computed(() => previewRevision.value && newestIndex(previewRevision.value));
const previewIndexReady = computed(() => previewDocument.value?.enabled && previewIndex.value?.status === 'READY');
function invalidatePreview() { previewRequest++; previewLoading.value = false; }
function closePreview() { previewOpen.value = false; invalidatePreview(); }
async function openPreview(document: KnowledgeDocument) {
  invalidatePreview(); previewDocument.value = document; previewRevision.value = newestRevision(document); previewText.value = ''; previewChunks.value = []; textOffset.value = null; chunkOffset.value = null; previewError.value = ''; previewTab.value = 'text'; previewOpen.value = true;
  if (previewIndexReady.value) await loadPreviewPage('both');
}
async function loadPreviewPage(kind: 'text' | 'chunks' | 'both') {
  const document = previewDocument.value, revision = previewRevision.value, index = previewIndex.value;
  if (!document || !revision || !index || !previewIndexReady.value || previewLoading.value) return;
  const request = ++previewRequest; previewLoading.value = true; previewError.value = '';
  try {
    const [text, chunks] = await Promise.all([kind !== 'chunks' ? api.extracted(document.id, revision.id, index.id, textOffset.value ?? 0) : undefined, kind !== 'text' ? api.chunks(document.id, revision.id, index.id, chunkOffset.value ?? 0) : undefined]);
    if (!alive || request !== previewRequest || !previewOpen.value) return;
    if (text) { previewText.value += text.text; textOffset.value = text.nextOffset; }
    if (chunks) { previewChunks.value.push(...chunks.chunks); chunkOffset.value = chunks.nextOffset; }
  } catch (error) { if (alive && request === previewRequest) previewError.value = message(error); }
  finally { if (alive && request === previewRequest) previewLoading.value = false; }
}
onMounted(()=>refresh());
onBeforeUnmount(() => { alive = false; catalogRequest++; documentRequest++; stopPolling(); invalidatePreview(); });
defineExpose({ refresh });
</script>

<style scoped>
.expert-knowledge-panel{min-width:0;color:#24242b}.expert-knowledge-bound{display:flex;align-items:center;gap:8px;margin:0;padding:0;min-height:36px;border:0;background:transparent}.expert-knowledge-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.expert-knowledge-icon{display:inline-flex;align-items:center;justify-content:center;color:#fff;background:#28aa78;width:20px;height:20px;border-radius:6px;flex-shrink:0}.expert-knowledge-icon-button{border:0;background:transparent;color:#73737f;display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:30px;border-radius:7px;padding:4px;cursor:pointer}.expert-knowledge-icon-button:hover{background:#f1f1f5}.expert-knowledge-icon-button:disabled,.expert-knowledge-pick:disabled,button:disabled{cursor:default;opacity:.5}.expert-knowledge-add{display:flex;align-items:center;gap:5px;background:#f4f4f6;border:0;padding:0 8px;height:24px;border-radius:6px;color:#24242b;font-size:12px;cursor:pointer}.expert-knowledge-link{border:0;background:none;padding:0;color:#7458ed;cursor:pointer;font-size:12px}.expert-knowledge-error{color:#ba3c3c;font-size:12px;line-height:1.7}.expert-knowledge-notice{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:#927039;background:#fffbef;border-radius:8px;padding:9px 11px;margin:8px 0;font-size:12px;line-height:1.5}.expert-knowledge-primary,.expert-knowledge-secondary,.expert-knowledge-pick{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:8px;padding:10px 14px;cursor:pointer;font-size:13px;line-height:18px;white-space:nowrap}.expert-knowledge-primary{background:#7654ef;color:#fff}.expert-knowledge-secondary{background:#f3f3f7;color:#55545f}.expert-knowledge-pick{color:#36353f;background:#fff;min-width:64px;height:30px;padding:0 12px;border:1px solid #e6e6ec;border-radius:12px}.expert-knowledge-pick.is-added{background:#f3f3f6;color:#9b9ba4}.expert-knowledge-dialog header{display:flex;align-items:center;gap:12px}.expert-knowledge-dialog h2{margin:0;flex:1;font-size:18px;font-weight:600;line-height:26px;color:#292933}.expert-knowledge-picker-layout{display:flex;height:700px;max-height:calc(100dvh - 20px);margin:0}.expert-knowledge-sidebar{box-sizing:border-box;flex:0 0 200px;background:#f4f4f7;padding:30px 20px;border-radius:24px 0 0 24px}.expert-knowledge-sidebar h2{font-size:18px;margin:0 0 24px}.expert-knowledge-sidebar .expert-knowledge-primary{width:100%}.expert-knowledge-sidebar p{font-size:13px;color:#666471;padding:17px 10px}.expert-knowledge-catalog{padding:28px 32px;flex:1;min-width:0;display:flex;flex-direction:column}.expert-knowledge-catalog header{margin-bottom:22px}.expert-knowledge-search{display:flex;align-items:center;gap:8px;border:1px solid #e9e9ef;border-radius:9px;padding:9px 12px;color:#a1a1ad}.expert-knowledge-search input{border:0;outline:0;background:none;flex:1;min-width:0;font-size:13px}.expert-knowledge-list{flex:1;overflow:auto;margin-top:16px}.expert-knowledge-catalog-row,.expert-knowledge-document-row{display:flex;align-items:center;gap:15px;padding:18px 0;border-bottom:1px solid #f0f0f3}.expert-knowledge-catalog-row>.expert-knowledge-icon{width:32px;height:32px;border-radius:8px}.expert-knowledge-row-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}.expert-knowledge-row-copy strong{font-size:14px;font-weight:500;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#34343e}.expert-knowledge-row-copy small{font-size:11px;color:#aaa9b1;line-height:16px}.expert-knowledge-empty{text-align:center;padding:62px 20px;color:#a3a2ad;font-size:13px;line-height:1.8}.expert-knowledge-create header{margin-bottom:26px}.expert-knowledge-create form{margin:0}.expert-knowledge-create label{display:block;font-size:13px;color:#45454f;margin-bottom:10px}.expert-knowledge-create input{box-sizing:border-box;width:100%;border:1px solid #e4e4eb;border-radius:9px;padding:12px;font:inherit;font-size:13px;color:#33333d;outline:0}.expert-knowledge-create input:focus{border-color:#9e83f3}.expert-knowledge-create footer{display:flex;justify-content:flex-end;gap:10px;margin-top:30px}.expert-knowledge-required{color:#e35b6c}.expert-knowledge-documents header{margin-bottom:14px}.expert-knowledge-documents h2{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.expert-knowledge-bound-context{display:flex;align-items:center;gap:12px;padding:6px 0 10px;color:#85838f;font-size:12px}.expert-knowledge-file-input{display:none}.expert-knowledge-upload-options{color:#a4a3ad;font-size:11px;line-height:1.7;margin-bottom:10px}.expert-knowledge-upload-options a{color:#7654ef}.expert-knowledge-upload-options select{border:1px solid #e5e5eb;border-radius:6px;padding:5px 8px;margin:0 8px;font:inherit;max-width:260px;color:#595866}.expert-knowledge-upload-options label{color:#77757f}.expert-knowledge-document-list{overflow:auto;flex:1;min-height:0}.expert-knowledge-file-icon{display:inline-flex;align-items:center;justify-content:center;background:#efa45c;color:#fff;width:32px;height:32px;border-radius:8px;flex-shrink:0}.expert-knowledge-document-row{padding:17px 0}.expert-knowledge-preview-content{overflow:auto;flex:1;min-height:0;padding-top:18px}.expert-knowledge-original{display:inline-flex;align-items:center;gap:5px;color:#7654ef;text-decoration:none;font-size:12px}.expert-knowledge-preview nav{display:flex;gap:22px;margin-bottom:22px;border-bottom:1px solid #ececf0}.expert-knowledge-preview nav button{background:none;border:0;padding:0 3px 12px;color:#9997a3;cursor:pointer}.expert-knowledge-preview nav button.active{color:#7654ef;border-bottom:2px solid #7654ef}.expert-knowledge-preview pre{font-family:inherit;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;color:#555461;line-height:1.9;margin:0 0 18px}.expert-knowledge-chunk{border:1px solid #eeeef2;border-radius:10px;margin-bottom:14px;padding:16px}.expert-knowledge-chunk small{display:block;color:#aaa9b4;font-size:11px;margin-bottom:10px}.expert-knowledge-chunk pre{margin:0}@media(max-width:700px){.expert-knowledge-sidebar{flex-basis:150px;padding:24px 12px}.expert-knowledge-sidebar h2{font-size:16px}.expert-knowledge-catalog{padding:24px 16px}.expert-knowledge-catalog-row{gap:9px}.expert-knowledge-dialog h2{font-size:16px}.expert-knowledge-row-copy strong{font-size:13px}}
</style>
<style>
.el-dialog.expert-knowledge-dialog{box-sizing:border-box;max-width:90vw;border-radius:24px;padding:0!important;overflow:hidden;background:#fff;box-shadow:0 12px 64px #17102826;color:#36353f}.expert-knowledge-dialog>.el-dialog__header{display:none;padding:0!important;margin:0!important}.expert-knowledge-dialog>.el-dialog__body{padding:0!important;color:inherit}.expert-knowledge-create>.el-dialog__body{padding:28px 30px!important}.expert-knowledge-documents>.el-dialog__body{box-sizing:border-box;height:568px;max-height:90vh;padding:26px 30px!important;display:flex;flex-direction:column}.expert-knowledge-preview>.el-dialog__body{box-sizing:border-box;height:644px;max-height:90vh;padding:26px 32px!important;display:flex;flex-direction:column}
</style>
