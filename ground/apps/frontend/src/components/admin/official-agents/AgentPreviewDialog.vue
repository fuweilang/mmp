<template>
  <el-dialog
    :model-value="modelValue"
    title="不可变预览已创建"
    width="660px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-alert title="预览仅创建者超级管理员可用，30 分钟有效。通过标准专家会话入口打开，使用冻结的提示词、工具、技能与知识配置；会话中的模型和检索服务调用可能产生费用。" type="info" :closable="false"/>
    <p>到期时间：{{formatDate(expiresAt)}}</p>
    <el-alert v-if="error" :title="error" type="warning" :closable="false"/>
    <p v-if="path"><a :href="path" target="_blank" rel="noopener">打开标准 Host 预览</a></p>
    <p v-if="path" style="overflow-wrap:anywhere">{{path}}</p>
  </el-dialog>
</template>

<script setup lang="ts">
import { formatDate } from './agent-display';

defineProps<{
  modelValue: boolean;
  path: string;
  expiresAt: string;
  error: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();
</script>
