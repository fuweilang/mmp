<template>
  <div v-if="inWorkbench" class="workbench-banner">
    <span>代运营：{{ session?.currentTenant?.name }}，不会切换登录身份</span>
    <el-button
      class="workbench-exit"
      text
      type="primary"
      :loading="exiting"
      @click="exitWorkbench"
    >
      退出工作台
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

/** 平台管理员代运营中（有企业上下文）时展示；退出后回总后台。 */
const router = useRouter();
const auth = useAuthStore();
const exiting = ref(false);
const session = computed(() => auth.session);

const inWorkbench = computed(() =>
  Boolean(session.value?.user.isPlatformAdmin && session.value?.currentTenant),
);

async function exitWorkbench() {
  exiting.value = true;
  try {
    await auth.exitWorkbench();
    ElMessage.success('已退出业务工作台');
    await router.push('/admin');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '退出工作台失败');
  } finally {
    exiting.value = false;
  }
}
</script>

<style scoped>
.workbench-banner {
  align-items: center;
  background: #fff7ed;
  border-bottom: 1px solid #fed7aa;
  color: #9a3412;
  display: flex;
  font-size: 13px;
  gap: 12px;
  justify-content: space-between;
  padding: 8px 24px;
}

.workbench-exit {
  color: #9a3412;
  flex: 0 0 auto;
  font-weight: 600;
}

.workbench-exit:hover {
  color: #c2410c;
}
</style>
