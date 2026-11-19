import { computed, reactive, ref } from 'vue';
import { catalogCategoryApi, type CatalogCategoryDirectory, type CatalogCategoryKind } from '../api/admin/catalog-categories';

function createDirectory() {
  const directory = ref<CatalogCategoryDirectory>({ version: 0, items: [] });
  const loading = ref(false);
  const error = ref('');
  const labels = reactive<Record<string, string>>({});
  let pending: Promise<void> | undefined;
  function apply(value: CatalogCategoryDirectory) {
    if (value.version < directory.value.version) return;
    directory.value = { version: value.version, items: [...value.items].sort((a, b) => a.sortOrder - b.sortOrder) };
    for (const key of Object.keys(labels)) delete labels[key];
    for (const item of directory.value.items) labels[item.key] = item.name;
    error.value = '';
  }
  function load(kind: CatalogCategoryKind): Promise<void> {
    if (pending) return pending;
    loading.value = true;
    pending = catalogCategoryApi.read(kind).then(apply).catch(reason => {
      error.value = reason instanceof Error ? reason.message : '分类加载失败';
    }).finally(() => { loading.value = false; pending = undefined; });
    return pending;
  }
  return { directory, labels, loading, error, apply, load, options: computed(() => directory.value.items.map(item => ({ value: item.key, label: item.name }))) };
}
const directories = { expert: createDirectory(), skill: createDirectory() };
export function useCatalogCategories(kind: CatalogCategoryKind) {
  const state = directories[kind];
  return { ...state, load: () => state.load(kind) };
}
