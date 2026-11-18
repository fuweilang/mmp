<template><section><header class="service-heading"><div><h1>检索服务</h1><p>配置知识文件处理和专家检索所用的服务。实际检索效果请在专家调试中验证。</p></div><el-button @click="$router.push('/admin/models')">返回模型管理</el-button></header><KnowledgeCoreAdmin settings-only service-only /></section></template>
<script setup lang="ts">
import KnowledgeCoreAdmin from '../../components/admin/KnowledgeCoreAdmin.vue';
</script>
<style scoped>.service-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:20px}.service-heading p{color:var(--el-text-color-secondary)}</style>
