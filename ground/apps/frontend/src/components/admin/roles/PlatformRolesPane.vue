<template>
  <RoleTable
    :rows="rows"
    :loading="loading"
    :show-tenant-column="false"
    :can-write="canWrite"
    :can-delete-roles="canDeleteRoles"
    :current-page="currentPage"
    :page-size="pageSize"
    :total="total"
    :empty-text="emptyText"
    @view="$emit('view', $event)"
    @edit="$emit('edit', $event)"
    @delete="$emit('delete', $event)"
    @page-change="$emit('page-change', $event)"
    @page-size-change="$emit('page-size-change', $event)"
  />
</template>

<script setup lang="ts">

import RoleTable from './RoleTable.vue';
import type { RoleRow } from './roleTypes';

defineProps<{
  rows: RoleRow[];
  loading?: boolean;
  canWrite: boolean;
  canDeleteRoles: boolean;
  currentPage: number;
  pageSize: number;
  total: number;
  emptyText: string;
}>();

defineEmits<{
  view: [row: RoleRow];
  edit: [row: RoleRow];
  delete: [row: RoleRow];
  'page-change': [page: number];
  'page-size-change': [size: number];
}>();

</script>
