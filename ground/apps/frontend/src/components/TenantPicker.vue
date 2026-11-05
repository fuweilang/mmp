<template>
  <div class="tenant-picker">
    <div class="tenant-picker-head">
      <h2>选择企业</h2>
      <p>你是平台管理员，先选择一家企业进入业务工作台，之后可随时用顶栏切换。</p>
    </div>

    <div v-if="tenants.length" class="tenant-picker-grid">
      <button
        v-for="tenant in tenants"
        :key="tenant.id"
        class="tenant-picker-card"
        type="button"
        :disabled="switching || tenant.status !== 'active'"
        @click="enter(tenant.id)"
      >
        <Building2 class="tenant-picker-icon" :stroke-width="1.8" />
        <span class="tenant-picker-name">{{ tenant.name }}</span>
        <span class="tenant-picker-meta">{{ tenant.status === 'active' ? tenant.slug : '已停用' }}</span>
      </button>
    </div>
    <el-empty v-else description="还没有可进入的企业，请先在总后台创建" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Building2 } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';

/** 平台管理员未带企业上下文时用它选一家进入；切换成功后会话刷新，页面自动放行。 */
const auth = useAuthStore();
const switching = ref(false);
const tenants = computed(() => auth.session?.tenants || []);

async function enter(tenantId: string) {
  switching.value = true;
  try {
    await auth.switchTenant(tenantId);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '进入企业失败');
  } finally {
    switching.value = false;
  }
}
</script>

<style scoped>
.tenant-picker {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 24px 18px;
}

.tenant-picker-head h2 {
  color: var(--app-heading-color);
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.tenant-picker-head p {
  color: var(--app-text-color);
  font-size: 13px;
  margin: 6px 0 0;
}

.tenant-picker-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 20px;
}

.tenant-picker-card {
  align-items: flex-start;
  background: #fff;
  border: 1px solid var(--app-border-color);
  cursor: pointer;
  display: grid;
  gap: 8px;
  min-height: 96px;
  padding: 16px;
  text-align: left;
}

.tenant-picker-card:hover:not(:disabled) {
  border-color: var(--app-primary-color);
}

.tenant-picker-card:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.tenant-picker-icon {
  color: var(--app-primary-color);
  height: 18px;
  width: 18px;
}

.tenant-picker-name {
  color: var(--app-heading-color);
  font-size: 14px;
  font-weight: 600;
}

.tenant-picker-meta {
  color: var(--app-text-color);
  font-size: 12px;
}

@media (max-width: 960px) {
  .tenant-picker-grid {
    grid-template-columns: 1fr;
  }
}
</style>