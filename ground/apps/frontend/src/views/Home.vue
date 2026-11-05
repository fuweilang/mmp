<template>
  <section class="workbench-home">
    <div v-if="hasTenant" class="home-head">
      <div>
        <h1>工作台</h1>
        <p>{{ welcomeText }}</p>
      </div>
      <div class="home-actions">
        <el-button @click="go('/console/members')">邀请成员</el-button>
        <el-button type="primary" @click="goChat">进入控制台</el-button>
      </div>
    </div>

    <el-alert
      v-if="hasTenant && error"
      class="page-alert"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    >
      <el-button text type="primary" @click="load">重试</el-button>
    </el-alert>

    <TenantPicker v-if="!loading && !hasTenant" />

    <template v-else>
      <el-alert
        v-if="pendingCount > 0"
        class="page-alert"
        type="warning"
        show-icon
        :closable="false"
        :title="`有 ${pendingCount} 份材料待生效`"
      >
        <el-button text type="primary" @click="go('/console/knowledge')">去生效</el-button>
      </el-alert>
      <el-alert
        v-if="walletLoaded && aiBalanceLow"
        class="page-alert"
        type="warning"
        show-icon
        :closable="false"
        title="企业 AI 币余额为 0，对话可能被拦截"
      >
        <el-button v-if="canBilling" text type="primary" @click="go('/console/billing')">去充值</el-button>
      </el-alert>

      <div v-loading="loading" class="metric-grid">
        <MetricCard
          v-for="card in cards"
          :key="card.label"
          :label="card.label"
          :value="card.value"
          :hint="card.hint"
          clickable
          @click="go(card.path)"
        />
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { workbenchApi, type WorkbenchSummary } from '../api/console';
import MetricCard from '../components/MetricCard.vue';
import TenantPicker from '../components/TenantPicker.vue';
import { hasPermission, isOrgAdmin } from '@mammoth/shared';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const error = ref('');
const summary = ref<WorkbenchSummary | null>(null);
const hasTenant = computed(() => Boolean(auth.session?.currentTenant));
const canBilling = computed(
  () => hasPermission(auth.session, 'portal.console.billing') || isOrgAdmin(auth.session),
);
const welcomeText = computed(() => {
  const name = summary.value?.tenantName || auth.session?.currentTenant?.name;
  return name ? `${name} · 概览` : '企业概览';
});
const pendingCount = computed(() => summary.value?.kbPendingCount ?? 0);
/** 钱包摘要未返回前不当作 0 余额，避免红条闪烁 */
const walletLoaded = computed(() => summary.value !== null);
const aiBalanceLow = computed(() => {
  if (!walletLoaded.value) return false;
  return (summary.value?.aiBalanceCoins ?? 0) <= 0;
});
const cards = computed(() => {
  const data = summary.value;
  const aiBalance = data?.aiBalanceCoins ?? 0;
  const aiBalanceEmpty = Boolean(data) && aiBalance <= 0;
  return [
    {
      label: '成员',
      value: data ? String(data.memberCount) : '-',
      hint: '本企业通讯录',
      path: '/console/members',
    },
    {
      label: '知识库',
      value: data ? String(data.kbDocumentCount) : '-',
      hint: data
        ? `待生效 ${data.kbPendingCount} · 已生效 ${data.kbReadyCount}`
        : '材料总量',
      path: '/console/knowledge',
    },
    {
      label: '本月对话',
      value: data ? String(data.usedTurns) : '-',
      hint: data ? `月额度 ${data.monthlyTurns}` : '本月用量',
      path: '/console/ai-usage',
    },
    {
      label: 'AI币余额',
      value: data ? String(aiBalance) : '-',
      hint: !data
        ? '企业钱包'
        : aiBalanceEmpty
          ? (canBilling.value ? '暂无余额 · 点击去充值' : '暂无余额')
          : `累计消耗 ${data.aiTotalDebited ?? 0}`,
      path: canBilling.value ? '/console/billing' : '/console/ai-usage',
    },
  ];
});

async function load() {
  if (!auth.session?.currentTenant) {
    summary.value = null;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    summary.value = await workbenchApi.summary();
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
    summary.value = null;
  } finally {
    loading.value = false;
  }
}

function go(path: string) {
  void router.push(path);
}

function goChat() {
  window.location.href = '/console';
}

onMounted(load);
watch(() => auth.session?.currentTenant?.id, load);
</script>

<style scoped>
.workbench-home {
  background: #fff;
  box-sizing: border-box;
  min-height: calc(100vh - 120px);
  padding: 15px;
}

.home-head {
  align-items: flex-start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 16px;
}

.home-head h1 {
  color: #333946;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  margin: 0;
}

.home-head p {
  color: #8b909b;
  font-size: 13px;
  line-height: 1.5;
  margin: 4px 0 0;
}

.home-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

@media (max-width: 960px) {
  .home-head {
    flex-direction: column;
  }
}
</style>
