<template>
  <article class="metric-card" :class="{ 'is-clickable': clickable }" @click="onClick">
    <span class="metric-card-label">{{ label }}</span>
    <strong class="metric-card-value">{{ value }}</strong>
    <small v-if="hint" class="metric-card-hint">{{ hint }}</small>
  </article>
</template>

<script setup lang="ts">
const props = defineProps<{
  label: string;
  value: string;
  hint?: string;
  clickable?: boolean;
}>();

const emit = defineEmits<{ click: [] }>();

function onClick() {
  if (props.clickable) emit('click');
}
</script>
