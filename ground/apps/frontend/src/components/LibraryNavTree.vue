<template>
  <ul class="library-nav-tree" :aria-label="path.at(-1)?.name || '我的资料树'">
    <li v-for="row in rows" :key="row.id">
      <div class="tree-line"><button v-if="row.kind === 'FOLDER'" type="button" :aria-expanded="expanded.includes(row.id)" :aria-label="`展开或收起 ${row.name}`" :disabled="blocked(row.id)" @click="toggle(row.id)"><ChevronDown :size="12" :style="{ transform: expanded.includes(row.id) ? undefined : 'rotate(-90deg)' }" /></button>
        <button type="button" class="tree-name" :disabled="blocked(row.id)" :title="row.name" @click="open(row)"><component :is="row.kind === 'FOLDER' ? Folder : row.kind === 'LINK' ? Link : File" :size="16" /><span>{{ row.name }}</span></button>
      </div>
      <LibraryNavTree v-if="row.kind === 'FOLDER' && expanded.includes(row.id) && !blocked(row.id)" :path="[...path, { id: row.id, name: row.name }]" />
    </li>
    <li v-if="loading" role="status">加载中…</li>
    <li v-else-if="error" role="alert">{{ error }} <button type="button" @click="load">重试</button></li>
    <li v-else-if="!rows.length">暂无资料</li>
    <li v-if="!loading && !error && rows.length < total"><button type="button" @click="page++; load()">加载更多</button></li>
  </ul>
</template>
<script setup lang="ts">
import { ref, watch, onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronDown, Folder, File, Link } from 'lucide-vue-next';
import { listLibrary, type LibraryItem } from '../api/library';
const props = defineProps<{ path: readonly { id: string; name: string }[] }>();
const router = useRouter();
const rows = ref<LibraryItem[]>([]), expanded = ref<string[]>([]);
const total = ref(0), page = ref(1), loading = ref(true), error = ref('');
let generation = 0;
const blocked = (id: string) => props.path.length >= 32 || props.path.some(part => part.id === id);
function toggle(id: string) { expanded.value = expanded.value.includes(id) ? expanded.value.filter(x => x !== id) : [...expanded.value, id]; }
function open(row: LibraryItem) {
  if (row.kind === 'FOLDER') void router.push({ path: '/console/library/mine', query: { folder: row.id } });
  else void router.push({ path: '/console/library/mine', query: { preview: row.id, version: row.currentVersion?.id } });
}
async function load() {
  const current = ++generation; loading.value = true; error.value = '';
  try {
    const result = await listLibrary('mine', props.path.at(-1)?.id ?? null, '', page.value);
    if (current !== generation) return;
    rows.value = page.value === 1 ? result.items : [...new Map([...rows.value, ...result.items].map(row => [row.id, row])).values()]; total.value = result.total;
  } catch (e) { if (current === generation) { rows.value = []; error.value = e instanceof Error ? e.message : '加载失败'; } }
  finally { if (current === generation) loading.value = false; }
}
watch(() => props.path, () => { page.value = 1; rows.value = []; void load(); }, { immediate: true });
function refreshTree() { page.value = 1; void load(); }
onMounted(() => window.addEventListener('mmp:library-changed', refreshTree));
onBeforeUnmount(() => { generation++; window.removeEventListener('mmp:library-changed', refreshTree); });
</script>
<style scoped>
.library-nav-tree { list-style:none; margin:4px 0; padding:0 0 0 12px; font-size:12px; overflow:hidden; }
.tree-line { display:flex; align-items:center; min-height:32px; gap:2px; }
button { color:inherit; background:none; border:0; padding:4px 2px; cursor:pointer; font:inherit; }
.tree-name { display:flex; align-items:center; gap:6px; min-width:0; text-align:left; }
.tree-name svg { flex-shrink:0; }
.tree-name span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>
