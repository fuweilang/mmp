<template>
  <el-dialog :model-value="modelValue" :title="kind === 'expert' ? '专家分类管理' : '技能分类管理'" width="620px" class="catalog-category-dialog" append-to-body :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @update:model-value="emit('update:modelValue', $event)">
    <template #header="{ titleId, titleClass }">
      <div class="category-header">
        <h2 :id="titleId" :class="titleClass">{{ kind === 'expert' ? '专家分类管理' : '技能分类管理' }}</h2>
      </div>
    </template>
    <div class="category-toolbar">
        <el-button class="category-add" type="primary" :disabled="loading || saving || !loaded" @click="addCategory"><Plus :size="16" aria-hidden="true" /><span>新增分类</span></el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon>
      <el-button v-if="!loaded" text @click="reload">重试</el-button>
      <el-button v-else-if="conflict" text @click="reloadAfterConflict">重新加载</el-button>
    </el-alert>
    <div ref="rowsElement" v-loading="loading" class="category-rows">
      <div v-for="(item, index) in draft" :key="rowId(item)" class="category-row"
        :class="{ 'is-dragging': dragged === item, 'is-drop-target': dropTarget === item && dragged !== item }"
        :draggable="!saving && !loading" @dragstart="startDrag($event, item)" @dragover.prevent="dropTarget = item"
        @drop.prevent="dropCategory(item)" @dragend="endDrag">
        <button type="button" class="category-grip" :disabled="saving" :aria-label="`拖拽调整 ${item.name || '新分类'} 顺序`" title="拖拽排序，也可用方向键调整"
          @keydown.up.prevent="moveCategory(draft, index, -1)" @keydown.down.prevent="moveCategory(draft, index, 1)"><GripVertical :size="18" /></button>
        <el-input v-model="item.name" :aria-label="`分类名称 ${index + 1}`" maxlength="32" :disabled="saving" placeholder="分类名称" />
        <el-button class="category-delete" type="danger" text :disabled="saving || !!checkingDelete" @click="remove(index)">删除</el-button>
      </div>
    </div>
    <template #footer>
      <el-button :disabled="saving" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="loading || !loaded || conflict || !!checkingDelete" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { GripVertical, Plus } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ApiError } from '../../api/http';
import { catalogCategoryApi, type CatalogCategoryKind } from '../../api/admin/catalog-categories';
import { useCatalogCategories } from '../../composables/useCatalogCategories';
import { categoryDraftError, moveCategory, type CategoryDraft } from '../../utils/catalog-categories';
import { confirmDelete } from '../../utils/confirm-delete';
const props = defineProps<{ modelValue: boolean; kind: CatalogCategoryKind }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const draft = ref<CategoryDraft[]>([]), version = ref(0), loading = ref(false), loaded = ref(false), saving = ref(false), error = ref(''), conflict = ref(false);
const checkingDelete = ref<CategoryDraft | null>(null);
const rowsElement = ref<HTMLElement>();
const dragged = ref<CategoryDraft | null>(null), dropTarget = ref<CategoryDraft | null>(null);
const rowIds = new WeakMap<CategoryDraft, number>();
let nextRowId = 0;
function rowId(item: CategoryDraft) {
  if (!rowIds.has(item)) rowIds.set(item, ++nextRowId);
  return rowIds.get(item)!;
}
async function addCategory() {
  draft.value.push({ name: '' });
  await nextTick();
  const input = rowsElement.value?.querySelector<HTMLInputElement>('.category-row:last-child input');
  input?.focus();
  input?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}
function startDrag(event: DragEvent, item: CategoryDraft) {
  // Text editing and destructive actions should never initiate a row drag.
  if (saving.value || loading.value || (event.target as HTMLElement).closest('input, .el-button')) { event.preventDefault(); return; }
  dragged.value = item;
  if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(rowId(item))); }
}
function endDrag() { dragged.value = null; dropTarget.value = null; }
function dropCategory(target: CategoryDraft) {
  const from = dragged.value ? draft.value.indexOf(dragged.value) : -1, to = draft.value.indexOf(target);
  if (!saving.value && !loading.value && from >= 0 && to >= 0 && from !== to) {
    const [item] = draft.value.splice(from, 1);
    draft.value.splice(to, 0, item!);
  }
  endDrag();
}
let generation = 0;
let removedRows: Array<{ item: CategoryDraft; index: number }> = [];
async function reload() {
  const current = ++generation;
  endDrag(); checkingDelete.value = null; removedRows = [];
  loading.value = true; loaded.value = false; error.value = ''; conflict.value = false;
  try {
    const value = await catalogCategoryApi.get(props.kind);
    if (current !== generation) return;
    version.value = value.version;
    draft.value = [...value.items].sort((a,b)=>a.sortOrder-b.sortOrder).map(({key,name})=>({key,name}));
    useCatalogCategories(props.kind).apply(value);
    loaded.value = true;
  } catch (reason) { if (current === generation) error.value = reason instanceof Error ? reason.message : '分类加载失败'; }
  finally { if (current === generation) loading.value = false; }
}
async function reloadAfterConflict() {
  try {
    await confirmDelete({ title: '重新加载分类', name: '当前未保存的修改', description: '重新加载将放弃本次修改，读取其他管理员最新保存的分类。', confirmText: '重新加载' });
    await reload();
  } catch { /* User kept the draft. */ }
}
async function remove(index: number) {
  const item = draft.value[index], current = generation, kind = props.kind;
  if (!item || saving.value || checkingDelete.value) return;
  checkingDelete.value = item;
  try {
    if (item.key) {
      let count: number;
      try { ({ count } = await catalogCategoryApi.usage(kind, item.key)); }
      catch (reason) {
        if (current === generation) error.value = reason instanceof Error ? reason.message : '分类引用检查失败，请重试';
        return;
      }
      if (current !== generation) return;
      if (count > 0) {
        const target = kind === 'expert' ? '专家' : '技能';
        await ElMessageBox.alert(`“${item.name}”已被 ${count} 个${target}绑定，请先在${target}编辑中取消或修改该分类，再删除。`, '分类正在使用', { confirmButtonText: '知道了', type: 'warning' }).catch(() => {});
        return;
      }
    }
    if (current !== generation) return;
    await confirmDelete({ title: '删除分类', name: item.name || '新分类', description: '仅删除分类，不删除专家或技能。点击保存后生效。' });
    const currentIndex = draft.value.indexOf(item);
    if (current === generation && currentIndex >= 0 && !saving.value) {
      removedRows.push({ item, index: currentIndex });
      draft.value.splice(currentIndex, 1);
    }
  } catch { /* User cancelled. */ }
  finally { if (current === generation) checkingDelete.value = null; }
}
async function save() {
  const validation = categoryDraftError(draft.value);
  if (validation) { error.value = validation; return; }
  saving.value = true; error.value = '';
  try {
    const value = await catalogCategoryApi.save(props.kind, version.value, draft.value.map(item => ({ ...(item.key ? {key:item.key} : {}), name: item.name.trim() })));
    useCatalogCategories(props.kind).apply(value);
    ElMessage.success('分类已保存'); emit('update:modelValue', false);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '保存失败，请重试';
    if (reason instanceof ApiError && reason.code === 'CATEGORY_IN_USE') {
      for (const removed of removedRows.slice().reverse()) {
        if (!draft.value.includes(removed.item)) draft.value.splice(Math.min(removed.index, draft.value.length), 0, removed.item);
      }
      removedRows = [];
      await ElMessageBox.alert(`${error.value}。请先在编辑页取消或修改分类绑定，再删除。`, '分类正在使用', { confirmButtonText: '知道了', type: 'warning' }).catch(() => {});
    }
    // A referenced-category deletion can also return 409; only version conflicts require reload.
    conflict.value = reason instanceof ApiError && reason.status === 409 && /版本|其他管理员|并发|重新加载|已.*修改/.test(error.value);
  } finally { saving.value = false; }
}
watch(() => [props.modelValue, props.kind] as const, ([open]) => { if (open) void reload(); else generation++; }, { immediate: true });
</script>
<style scoped>
.category-header { display: flex; align-items: center; }
.category-toolbar { display: flex; justify-content: flex-end; margin: 0 0 12px; }
.category-header h2 { margin: 0; }
.category-add { height: 34px; padding: 0 12px; border-radius: 8px; flex-shrink: 0; }
.category-add :deep(> span) { display: inline-flex; align-items: center; gap: 6px; }
.category-rows { min-height: 90px; max-height: 55vh; overflow-y: auto; overscroll-behavior: contain; margin-top: 0; padding: 2px; scrollbar-width: thin; scrollbar-color: var(--el-border-color) transparent; }
.category-row { display: flex; align-items: center; gap: 10px; min-height: 48px; margin-bottom: 8px; padding: 6px 8px; box-sizing: border-box; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-fill-color-extra-light); cursor: grab; transition: border-color .15s ease, background-color .15s ease, opacity .15s ease; }
.category-row:last-child { margin-bottom: 0; }
.category-row:hover, .category-row:focus-within { border-color: var(--el-color-primary-light-7); background: var(--el-bg-color); }
.category-grip { display: flex; align-items: center; justify-content: center; flex: 0 0 24px; width: 24px; height: 30px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--el-text-color-placeholder); cursor: grab; transition: color .15s ease, background-color .15s ease; }
.category-row:hover .category-grip, .category-grip:focus-visible { color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.category-grip:active { cursor: grabbing; }
.category-grip:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.category-grip:disabled { cursor: not-allowed; opacity: .5; }
.category-row .el-input { flex: 1; min-width: 0; }
.category-row :deep(.el-input__wrapper) { min-height: 32px; box-sizing: border-box; background: var(--el-bg-color); box-shadow: 0 0 0 1px var(--el-border-color-lighter) inset; }
.category-row :deep(.el-input__wrapper.is-focus) { box-shadow: 0 0 0 1px var(--el-color-primary) inset; }
.category-row :deep(input) { cursor: text; }
.category-delete { flex-shrink: 0; height: 30px; margin: 0; padding: 0 8px; border-radius: 6px; font-size: 13px; }
.category-row.is-dragging { opacity: .4; }
.category-row.is-drop-target { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); box-shadow: 0 0 0 1px var(--el-color-primary-light-7); }
@media (max-width: 480px) {
  .category-add { padding: 0 10px; }
  .category-row { gap: 6px; padding: 6px; }
  .category-grip { flex-basis: 20px; width: 20px; }
  .category-delete { padding: 0 4px; }
}
@media (prefers-reduced-motion: reduce) { .category-row, .category-grip { transition: none; } }
</style>
