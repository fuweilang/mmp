import { computed, ref, watch } from 'vue';
import { clampPage } from '../utils/skill-form';

/**
 * admin 列表公共层：分页切片 / 关键词与状态筛选 / 空态文案 / 页码重置。
 *
 * 纯搬迁：不做任何默认防抖与默认文案的“统一”，
 * 各页的 pageSize、空态文案、筛选条件与压页策略由调用方显式传入。
 */
export interface AdminTableOptions<T> {
  /** 列表原始行（服务端返回）。 */
  rows: () => T[];
  /** 客户端筛选；不传 = 不筛选（服务端筛选页面）。 */
  filter?: (row: T) => boolean;
  /** 初始每页条数，默认 20。 */
  pageSize?: number;
  /** false = 不切片（Roles 这类只做筛选的页面）。 */
  paginate?: boolean;
  /** 是否处于筛选态（决定空态文案）。 */
  hasFilters?: () => boolean;
  /** 无筛选时的空态文案。 */
  emptyAll: string;
  /** 有筛选时的空态文案。 */
  emptyFiltered: string;
  /** 加载失败优先展示的空态文案（如技能页“技能加载失败”）。 */
  errorText?: () => string | undefined;
  /** 行数/页大小变化时把页码 clamp 回合法范围（技能页现状）。 */
  clampOnShrink?: boolean;
  /**
   * 改每页条数时是否回到第 1 页。默认 true（多数列表现状）；
   * 官方专家页原实现不重置，交给分页组件越界 clamp。
   */
  resetPageOnSizeChange?: boolean;
}

export function useAdminTable<T>(options: AdminTableOptions<T>) {
  const currentPage = ref(1);
  const pageSize = ref(options.pageSize ?? 20);

  const filteredRows = computed<T[]>(() => {
    const all = options.rows();
    return options.filter ? all.filter(options.filter) : all;
  });

  const pagedRows = computed<T[]>(() => {
    if (options.paginate === false) return filteredRows.value;
    const start = (currentPage.value - 1) * pageSize.value;
    return filteredRows.value.slice(start, start + pageSize.value);
  });

  const hasActiveFilters = computed(() => Boolean(options.hasFilters?.()));

  const emptyText = computed(() => {
    const error = options.errorText?.();
    if (error) return error;
    return hasActiveFilters.value ? options.emptyFiltered : options.emptyAll;
  });

  function resetPage() {
    currentPage.value = 1;
  }

  function onPageChange(page: number) {
    currentPage.value = page;
  }

  function onPageSizeChange(size: number) {
    pageSize.value = size;
    if (options.resetPageOnSizeChange !== false) resetPage();
  }

  if (options.clampOnShrink) {
    // 删除/停用后可能缩页；同步压回合法页，避免停在空的越界页。
    watch([() => filteredRows.value.length, pageSize], () => {
      currentPage.value = clampPage(currentPage.value, pageSize.value, filteredRows.value.length);
    }, { flush: 'sync' });
  }

  return {
    currentPage,
    pageSize,
    filteredRows,
    pagedRows,
    hasActiveFilters,
    emptyText,
    resetPage,
    onPageChange,
    onPageSizeChange,
  };
}

/**
 * 关键词防抖 + 请求序号守卫 + loading。
 *
 * debounceMs 必须按页传入（300/350/450/500ms 各不相同），不得统一。
 */
export interface AdminSearchOptions {
  debounceMs: number;
  load: () => unknown;
  resetPage?: () => void;
  /** 立即搜索前先提交草稿值（如 keyword = keywordDraft.trim()）。 */
  beforeSearch?: () => void;
  /** 重置筛选（清空关键词/状态等），在重载前执行。 */
  clearFilters?: () => void;
  /** false = 重置后不重载（Roles 这类纯客户端筛选）。 */
  reloadOnReset?: boolean;
}

export function useAdminSearch(options: AdminSearchOptions) {
  const loading = ref(false);
  let searchTimer = 0;
  let requestSequence = 0;

  function onSearchInput() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(onSearchNow, options.debounceMs);
  }

  function onSearchNow() {
    window.clearTimeout(searchTimer);
    options.beforeSearch?.();
    options.resetPage?.();
    void options.load();
  }

  function onReset() {
    window.clearTimeout(searchTimer);
    options.clearFilters?.();
    options.resetPage?.();
    if (options.reloadOnReset !== false) void options.load();
  }

  /** 与原有“请求序号守卫 + finally 关 loading”写法一一对应。 */
  async function runLoad(execute: (isCurrent: () => boolean) => Promise<void>) {
    const sequence = ++requestSequence;
    loading.value = true;
    const isCurrent = () => sequence === requestSequence;
    try {
      await execute(isCurrent);
    } finally {
      if (isCurrent()) loading.value = false;
    }
  }

  function dispose() {
    window.clearTimeout(searchTimer);
    requestSequence += 1;
  }

  return { loading, onSearchInput, onSearchNow, onReset, runLoad, dispose };
}

/** 只做防抖的轻量入口（无 loading / 无请求序号）。 */
export function useDebouncedCallback(delay: number, handler: () => void) {
  let timer = 0;
  function onInput() {
    window.clearTimeout(timer);
    timer = window.setTimeout(handler, delay);
  }
  function cancel() {
    window.clearTimeout(timer);
  }
  return { onInput, cancel };
}
