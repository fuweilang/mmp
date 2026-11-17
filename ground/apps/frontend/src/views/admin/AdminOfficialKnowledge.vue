<template>
  <section class="official-kb-page">
    <KnowledgeFolderManager v-if="canAuthor" />
    <el-empty v-else description="没有知识库管理权限" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import KnowledgeFolderManager from '../../components/admin/KnowledgeFolderManager.vue';
import { useAuthStore } from '../../stores/auth';
import { canAuthorExperts } from '../../utils/knowledge-admin';

const auth = useAuthStore();
const canAuthor = computed(() => canAuthorExperts(auth.session));
</script>

<style>
.official-kb-page {
  background: #fff;
  box-sizing: border-box;
  min-height: 100%;
  padding: 15px;
}
</style>
