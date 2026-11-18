<template>
  <el-drawer v-model="visible" size="720px" destroy-on-close @closed="onClosed">
    <template #header>
      <span class="drawer-title">{{ title }}</span>
    </template>
    <div v-loading="loading" class="drawer-body">
      <template v-if="detail">
        <div class="usage-hero">
          <div>
            <div class="usage-label">Token 消耗</div>
            <div class="usage-num">{{ formatNum(detail.totals.totalTokens) }}</div>
          </div>
          <div class="usage-side">
            <span>Input {{ formatNum(detail.totals.inputTokens) }}</span>
            <span>Output {{ formatNum(detail.totals.outputTokens) }}</span>
            <span>笔数 {{ formatNum(detail.totals.turns) }}</span>
            <span>成员 {{ formatNum(members.length) }}</span>
          </div>
        </div>
        <h3 class="drawer-section">成员用量</h3>
        <el-table
          :data="members"
          border
          class="usage-table"
          header-cell-class-name="usage-table-header"
          empty-text="暂无成员用量"
          max-height="520"
        >
          <el-table-column prop="name" label="成员" min-width="120" show-overflow-tooltip />
          <el-table-column prop="phone" label="手机" width="130" />
          <el-table-column label="Token" width="120">
            <template #default="{ row }">{{ formatNum(row.totalTokens) }}</template>
          </el-table-column>
          <el-table-column label="Input" width="110">
            <template #default="{ row }">{{ formatNum(row.inputTokens) }}</template>
          </el-table-column>
          <el-table-column label="Output" width="110">
            <template #default="{ row }">{{ formatNum(row.outputTokens) }}</template>
          </el-table-column>
          <el-table-column label="笔数" width="80">
            <template #default="{ row }">{{ formatNum(row.turns) }}</template>
          </el-table-column>
        </el-table>
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminBillingApi, type EnterpriseTokenStatsDetail } from '@/api/admin';
import { ApiError } from '@/api/http';

const emit = defineEmits<{ closed: [] }>();

const visible = ref(false);
const loading = ref(false);
const titleHint = ref('');
const detail = ref<EnterpriseTokenStatsDetail | null>(null);

const title = computed(() => detail.value?.tenant.name || titleHint.value || '成员用量');
const members = computed(() =>
  (detail.value?.members ?? [])
    .filter((row) => (row.totalTokens || 0) > 0 || (row.turns || 0) > 0)
    .sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0) || (b.turns || 0) - (a.turns || 0)),
);

function formatNum(n: number) {
  return Number(n || 0).toLocaleString('zh-CN');
}

async function open(tenantId: string, titleName = '', query?: { from?: string; to?: string; model?: string }) {
  titleHint.value = titleName;
  detail.value = null;
  visible.value = true;
  loading.value = true;
  try {
    detail.value = await adminBillingApi.getEnterpriseTokenStatsDetail({
      tenantId,
      from: query?.from,
      to: query?.to,
      model: query?.model,
    });
  } catch (e) {
    ElMessage.error(e instanceof ApiError ? e.message : '加载成员用量失败');
  } finally {
    loading.value = false;
  }
}

function close() {
  visible.value = false;
}

function onClosed() {
  detail.value = null;
  titleHint.value = '';
  emit('closed');
}

defineExpose({ open, close });
</script>

<style scoped>
.drawer-title {
  color: #333946;
  font-size: 16px;
  font-weight: 600;
}

.drawer-body {
  min-height: 160px;
}

.usage-hero {
  align-items: flex-end;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.usage-label {
  color: #667085;
  font-size: 12px;
  margin-bottom: 4px;
}

.usage-num {
  color: #333946;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.usage-side {
  align-items: flex-end;
  color: #667085;
  display: flex;
  flex-direction: column;
  font-size: 13px;
  gap: 4px;
}

.drawer-section {
  color: #333946;
  font-size: 14px;
  font-weight: 600;
  margin: 22px 0 10px;
}

.usage-table {
  width: 100%;
}

:deep(.usage-table-header) {
  background: #f8fafc !important;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

:deep(.usage-table .el-table__body td),
:deep(.usage-table .el-table__body .cell) {
  font-size: 13px;
}
</style>
