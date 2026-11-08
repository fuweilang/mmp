<template>
  <el-dialog :model-value="true" title="授权代管浏览（仅当前授权范围）" width="80%" align-center append-to-body class="library-modal" @close="$emit('close')">
    <p>租户与私人所有者均由服务端从本条有效授权解析。到期、撤销后每次列表、预览、下载都拒绝。读取写入审计。</p>
    <div class="managed-toolbar"><el-input class="managed-search" v-model="query" placeholder="搜索授权范围的标题" @keyup.enter="load" /><el-button @click="load">搜索 / 刷新</el-button></div>
    <nav class="managed-breadcrumb"><el-button text @click="parentId = null; load()">授权根目录</el-button>
    <el-button text v-for="(part, index) in breadcrumb" :key="part.id" @click="parentId = part.id; load()">{{ index + 1 }}. {{ part.name }}</el-button></nav>
    <p v-if="error" role="alert">{{ error }}</p>
    <el-table :data="items" v-loading="loading" border>
      <template #empty><el-empty description="当前有效授权范围暂无资料" :image-size="80" /></template>
      <el-table-column label="名称"><template #default="{ row }"><el-button v-if="row.kind === 'FOLDER'" text @click="parentId = row.id; load()">{{ row.name }}/</el-button><span v-else>{{ row.name }}</span></template></el-table-column>
      <el-table-column prop="scope" label="范围" /><el-table-column prop="currentVersion.parseStatus" label="解析状态" />
      <el-table-column label="操作"><template #default="{ row }"><el-button text type="primary" v-if="row.kind !== 'FOLDER'" @click="preview(row)">版本原文</el-button><el-link type="primary" :underline="false" v-if="row.kind === 'FILE' && row.currentVersion" :href="libraryManagedDownload(grantId, row.id, row.currentVersion.id)" download>下载原文件</el-link></template></el-table-column>
    </el-table>
    <section v-if="source"><h3>{{ source.name }} · v{{ source.versionNo }}</h3><p>{{ source.highlightNote }} {{ source.parseReason }}</p><pre class="managed-source">{{ source.text }}</pre><p>{{ source.linkUrl }}</p></section>
  </el-dialog>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import '../styles/libraryDialogs.css';
import { libraryManagedDownload, libraryManagedItems, libraryManagedPreview, type LibraryItem, type LibraryPreview } from '../api/library';
const props = defineProps<{ grantId: string }>(); defineEmits<{ close: [] }>();
const query = ref(''), parentId = ref<string | null>(null), error = ref(''), loading = ref(false);
const items = ref<LibraryItem[]>([]), breadcrumb = ref<{ id: string; name: string }[]>([]), source = ref<LibraryPreview>();
let sequence = 0;
async function load() { const current = ++sequence; loading.value = true; source.value = undefined; try { const next = await libraryManagedItems(props.grantId, parentId.value, query.value); if(current !== sequence)return; items.value = next.items; breadcrumb.value = next.breadcrumb; error.value = ''; } catch(e) { if(current !== sequence)return; items.value = []; breadcrumb.value = []; error.value = e instanceof Error ? e.message : '授权已失效或不可访问'; } finally { if(current === sequence) loading.value = false; } }
async function preview(item: LibraryItem) { source.value = undefined; try { source.value = await libraryManagedPreview(props.grantId, item.id, item.currentVersion?.id ?? ''); error.value = ''; } catch(e) { error.value = e instanceof Error ? e.message : '不可读取'; } }
onMounted(() => { void load(); });
</script>

<style scoped>
.managed-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin:16px 0 12px; }
.managed-search { width:260px; max-width:100%; }
.managed-breadcrumb { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px; }
.managed-source { margin:0; padding:12px; max-height:360px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; background:var(--el-fill-color-light); border-radius:8px; font-size:12px; line-height:1.6; }
:deep(th.el-table__cell) { background:var(--el-fill-color-light); }
p { color:var(--el-text-color-secondary); font-size:13px; line-height:1.6; }
</style>
