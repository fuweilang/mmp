<template>
  <div>
    <div class="chip-section-title">权限包</div>
    <template v-if="readonly">
      <div
        v-for="group in readonlyGroups"
        :key="group.category"
        class="chip-group"
      >
        <div class="chip-group-label">
          <span>{{ group.labelZh }}</span>
          <span class="chip-group-count">{{ group.pages.flatMap((p) => p.items).length }} 项</span>
        </div>
        <div
          v-for="(page, pageIndex) in group.pages"
          :key="`view-${group.category}-${page.page || 'flat'}-${pageIndex}`"
          class="chip-page"
        >
          <div
            v-if="page.pageZh"
            class="chip-page-label"
          >
            <span>{{ page.pageZh }}</span>
            <span class="chip-group-count">{{ page.items.length }} 项</span>
          </div>
          <div class="chip-wrap">
            <span
              v-for="item in page.items"
              :key="item.key"
              class="perm-chip perm-chip-readonly"
              :title="item.labelEn"
            >
              {{ item.labelZh }}
            </span>
          </div>
        </div>
      </div>
    </template>
    <template v-else>
      <div
        v-for="group in catalog"
        :key="group.category"
        class="chip-group"
      >
        <div class="chip-group-label">
          <span>{{ group.labelZh }}</span>
          <span class="chip-group-count">{{ groupSelectedCount(group, selected) }}</span>
        </div>
        <div
          v-for="(page, pageIndex) in groupPages(group)"
          :key="`${group.category}-${page.page || 'flat'}-${pageIndex}`"
          class="chip-page"
        >
          <div
            v-if="page.pageZh"
            class="chip-page-label"
          >
            <span>{{ page.pageZh }}</span>
            <span class="chip-group-count">{{ pageSelectedCount(page, selected) }}</span>
          </div>
          <div class="chip-wrap">
            <button
              v-for="item in page.items"
              :key="item.key"
              type="button"
              class="perm-chip"
              :class="{ active: selected.has(item.key), locked: !editable }"
              :disabled="!editable"
              :title="item.labelEn"
              @click="$emit('toggle', item.key)"
            >
              {{ item.labelZh }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { PermissionCatalogGroup } from '@/api/admin';
import { groupPages, groupSelectedCount, pageSelectedCount } from './roleDisplay';

withDefaults(defineProps<{
  catalog?: PermissionCatalogGroup[];
  selected?: Set<string>;
  editable?: boolean;
  readonly?: boolean;
  /** 只读模式预过滤后的分组（含 pages） */
  readonlyGroups?: Array<{
    category: string;
    labelZh: string;
    pages: Array<{ page: string | null; pageZh?: string | null; items: Array<{ key: string; labelZh: string; labelEn?: string }> }>;
  }>;
}>(), {
  catalog: () => [],
  selected: () => new Set<string>(),
  editable: false,
  readonly: false,
  readonlyGroups: () => [],
});

defineEmits<{
  toggle: [key: string];
}>();
</script>

<style scoped>
.role-tab.active {
  border-bottom-color: #4A53A3;
  color: #4A53A3;
  font-weight: 600;
}

.chip-section-title {
  color: #333946;
  font-size: 13px;
  font-weight: 600;
  margin: 8px 0 12px;
}

.chip-group {
  margin-bottom: 16px;
}

.chip-group-label {
  align-items: center;
  color: #64748b;
  display: flex;
  font-size: 12px;
  font-weight: 600;
  gap: 8px;
  margin-bottom: 8px;
}

.chip-group-count {
  color: #94a3b8;
  font-weight: 500;
}

.chip-page {
  margin-bottom: 10px;
}

.chip-page:last-child {
  margin-bottom: 0;
}

.chip-page-label {
  align-items: center;
  color: #475569;
  display: flex;
  font-size: 12px;
  font-weight: 600;
  gap: 8px;
  margin: 0 0 6px;
}

.chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.perm-chip {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  color: #334155;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.2;
  padding: 6px 12px;
}

.perm-chip.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #3E468C;
  font-weight: 600;
}

.perm-chip.locked {
  cursor: default;
  opacity: 0.85;
}

.perm-chip:disabled {
  cursor: default;
}
.role-dialog .chip-section-title {
  margin-top: 18px;
}
</style>
