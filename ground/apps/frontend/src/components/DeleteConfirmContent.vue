<template>
  <div ref="root" class="delete-confirm__content">
    <div class="delete-confirm__objects" aria-label="操作对象">
      <div v-for="(item, index) in names" :key="index" class="delete-confirm__object">{{ item }}</div>
    </div>
    <div class="delete-confirm__description">
      <slot>
        <p v-for="(line, index) in descriptions" :key="index">{{ line }}</p>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ name: string | string[]; description?: string | string[] }>();
const names = computed(() => Array.isArray(props.name) ? props.name : [props.name]);
const descriptions = computed(() => Array.isArray(props.description) ? props.description : props.description ? [props.description] : []);
const root = ref<HTMLElement>();
let focusFrame: number | undefined;

onMounted(() => {
  // Wait until Element Plus has activated its focus trap before choosing the safe action.
  focusFrame = requestAnimationFrame(() => {
    root.value?.closest('.el-message-box')?.querySelector<HTMLButtonElement>('.delete-confirm__cancel')?.focus();
  });
});
onBeforeUnmount(() => { if (focusFrame !== undefined) cancelAnimationFrame(focusFrame); });
</script>
