<template>
  <el-select
    v-if="showSwitcher"
    :model-value="currentId"
    class="tenant-switcher"
    filterable
    :loading="switching"
    placeholder="选择企业"
    size="default"
    @change="onChange"
  >
    <el-option v-for="tenant in tenants" :key="tenant.id" :label="tenant.name" :value="tenant.id" />
    <el-option label="平台视图（不进入企业）" :value="PLATFORM_VALUE" divided />
  </el-select>
  <span v-else-if="!isPlatformAdmin" class="navbar-tenant">{{ tenantName }}</span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

/** 平台超管在企业之间直接切换，替代原先「请从总后台进入业务工作台」的硬跳转。 */
const PLATFORM_VALUE = '__platform__';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const switching = ref(false);

const session = computed(() => auth.session);
const isPlatformAdmin = computed(() => Boolean(session.value?.user.isPlatformAdmin));
const showSwitcher = computed(
  () => isPlatformAdmin.value && !route.path.startsWith('/admin'),
);
const tenants = computed(() => session.value?.tenants || []);
const currentId = computed(() => session.value?.currentTenant?.id || PLATFORM_VALUE);
const tenantName = computed(() => session.value?.currentTenant?.name || '未选择企业');

async function onChange(value: string) {
  if (value === currentId.value) return;
  switching.value = true;
  try {
    if (value === PLATFORM_VALUE) {
      await auth.exitWorkbench();
      ElMessage.success('已切换到平台视图');
      await router.push('/admin');
      return;
    }
    const tenant = tenants.value.find((item) => item.id === value);
    await auth.switchTenant(value);
    ElMessage.success(`已进入「${tenant?.name || '企业'}」`);
    await router.push('/console/');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '切换企业失败');
  } finally {
    switching.value = false;
  }
}
</script>

<style scoped>
.tenant-switcher {
  width: 180px;
}

.tenant-switcher :deep(.el-select__wrapper) {
  border-radius: 0;
  min-height: 32px;
}
</style>