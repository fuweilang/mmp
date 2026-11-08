<template>
  <el-dialog :model-value="true" title="授权代管浏览（仅当前授权范围）" width="80%" @close="$emit('close')">
    <p>租户与私人所有者均由服务端从本条有效授权解析。到期、撤销后每次列表、预览、下载都拒绝。读取写入审计。</p>
    <el-input v-model="query" placeholder="搜索授权范围的标题" @keyup.enter="load" /><el-button @click="load">刷新</el-button>
    <el-button @click="parentId = null; load()">授权根目录</el-button>
    <el-button v-for="(part, index) in breadcrumb" :key="part.id" @click="parentId = part.id; load()">{{ index + 1 }}. {{ part.name }}</el-button>
    <p v-if="error" role="alert">{{ error }}</p>
    <el-table :data="items" v-loading="loading">
      <el-table-column label="名称"><template #default="{ row }"><el-button v-if="row.kind === 'FOLDER'" text @click="parentId = row.id; load()">{{ row.name }}/</el-button><span v-else>{{ row.name }}</span></template></el-table-column>
      <el-table-column prop="scope" label="范围" /><el-table-column prop="currentVersion.parseStatus" label="解析状态" />
      <el-table-column label="操作"><template #default="{ row }"><el-button v-if="row.kind !== 'FOLDER'" @click="preview(row)">版本原文</el-button><a v-if="row.kind === 'FILE' && row.currentVersion" :href="libraryManagedDownload(grantId, row.id, row.currentVersion.id)" download>下载原文件</a></template></el-table-column>
    </el-table>
    <section v-if="source"><h3>{{ source.name }} · v{{ source.versionNo }}</h3><p>{{ source.highlightNote }} {{ source.parseReason }}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">{{ source.text }}</pre><p>{{ source.linkUrl }}</p></section>
  </el-dialog>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { libraryManagedDownload, libraryManagedItems, libraryManagedPreview, type LibraryItem, type LibraryPreview } from '../api/library';
const props = defineProps<{ grantId: string }>(); defineEmits<{ close: [] }>();
const query = ref(''), parentId = ref<string | null>(null), error = ref(''), loading = ref(false);
const items = ref<LibraryItem[]>([]), breadcrumb = ref<{ id: string; name: string }[]>([]), source = ref<LibraryPreview>();
let sequence = 0;
async function load() { const current = ++sequence; loading.value = true; source.value = undefined; try { const next = await libraryManagedItems(props.grantId, parentId.value, query.value); if(current !== sequence)return; items.value = next.items; breadcrumb.value = next.breadcrumb; error.value = ''; } catch(e) { if(current !== sequence)return; items.value = []; breadcrumb.value = []; error.value = e instanceof Error ? e.message : '授权已失效或不可访问'; } finally { if(current === sequence) loading.value = false; } }
async function preview(item: LibraryItem) { source.value = undefined; try { source.value = await libraryManagedPreview(props.grantId, item.id, item.currentVersion?.id ?? ''); } catch(e) { items.value = []; error.value = e instanceof Error ? e.message : '不可读取'; } }
onMounted(() => { void load(); });
</script>
