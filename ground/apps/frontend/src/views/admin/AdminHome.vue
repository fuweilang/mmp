<template>
  <section class="admin-home">
    <div class="home-head">
      <div>
        <h1>工作台</h1>
        <p>从这里进入用户、角色和企业管理。</p>
      </div>
      <div class="home-actions">
        <el-button @click="go('/admin/users')">用户管理</el-button>
        <el-button type="primary" @click="go('/admin/enterprises')">企业管理</el-button>
      </div>
    </div>

    <el-alert
      v-if="error"
      class="page-alert"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    >
      <el-button text type="primary" @click="load">重试</el-button>
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

    <div class="shortcut-grid">
      <button
        v-for="item in shortcuts"
        :key="item.path"
        class="shortcut-card"
        type="button"
        @click="go(item.path)"
      >
        <component :is="item.icon" class="shortcut-icon" />
        <span class="shortcut-copy">
          <strong>{{ item.title }}</strong>
          <small>{{ item.desc }}</small>
        </span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { BarChart3, Building2, Coins, ScrollText, Shield, Users, Wallet } from 'lucide-vue-next';
import { adminEnterpriseApi, adminUserApi } from '../../api/admin';
import MetricCard from '../../components/MetricCard.vue';

const router = useRouter();
const loading = ref(false);
const error = ref('');
const userCount = ref(0);
const activeUserCount = ref(0);
const adminCount = ref(0);
const enterpriseCount = ref(0);
const activeEnterpriseCount = ref(0);

const cards = computed(() => [
  {
    label: '用户',
    value: loading.value ? '-' : String(userCount.value),
    hint: `激活 ${activeUserCount.value}`,
    path: '/admin/users',
  },
  {
    label: '企业',
    value: loading.value ? '-' : String(enterpriseCount.value),
    hint: `激活 ${activeEnterpriseCount.value}`,
    path: '/admin/enterprises',
  },
  {
    label: '平台管理员',
    value: loading.value ? '-' : String(adminCount.value),
    hint: '可进入总后台',
    path: '/admin/users',
  },
  {
    label: '角色',
    value: '2',
    hint: '内置，不可自定义',
    path: '/admin/roles',
  },
]);

const shortcuts = [
  {
    path: '/admin/users',
    title: '用户管理',
    desc: '新建、编辑和停用平台用户',
    icon: Users,
  },
  {
    path: '/admin/roles',
    title: '角色管理',
    desc: '查看平台管理员和普通用户',
    icon: Shield,
  },
  {
    path: '/admin/enterprises',
    title: '企业管理',
    desc: '维护企业、品牌，进入业务工作台',
    icon: Building2,
  },
  {
    path: '/admin/enterprise-token-stats',
    title: '企业token用量',
    desc: '企业物理 Token 与 AI币（1:1）用量：全平台 → 企业 → 成员',
    icon: BarChart3,
  },
  {
    path: '/admin/pricing-config',
    title: 'AI币计价配置',
    desc: 'token 售价倍率、充值汇率与上游采购单价',
    icon: Coins,
  },
  {
    path: '/admin/enterprise-wallets',
    title: '企业钱包',
    desc: '企业余额、充值记录、详情流水与调账',
    icon: Wallet,
  },
  {
    path: '/admin/audit',
    title: '操作审计',
    desc: '全平台与各企业操作日志（筛选、分页、详情折叠）',
    icon: ScrollText,
  },
];

function go(path: string) {
  void router.push(path);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [users, enterprises] = await Promise.all([
      adminUserApi.list(),
      adminEnterpriseApi.list(),
    ]);
    userCount.value = users.length;
    activeUserCount.value = users.filter((user) => user.status === 'active').length;
    adminCount.value = users.filter((user) => user.isPlatformAdmin).length;
    const companyRows = enterprises.filter((row) => row.type !== 'PLATFORM');
    enterpriseCount.value = companyRows.length;
    activeEnterpriseCount.value = companyRows.filter((row) => row.status === 'active').length;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.admin-home {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.home-head {
  align-items: flex-start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 16px;
}

.home-head h1 {
  color: var(--app-heading-color);
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  margin: 0;
}

.home-head p {
  color: var(--app-text-color);
  font-size: 13px;
  line-height: 1.5;
  margin: 4px 0 0;
}

.home-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.shortcut-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.shortcut-card {
  align-items: center;
  background: #fff;
  border: 1px solid var(--app-border-color);
  color: inherit;
  cursor: pointer;
  display: flex;
  gap: 12px;
  min-height: 88px;
  padding: 16px 20px;
  text-align: left;
}

.shortcut-card:hover {
  background: #f8fafc;
}

.shortcut-icon {
  color: var(--app-primary-color);
  flex: 0 0 18px;
  height: 18px;
  stroke-width: 1.9;
  width: 18px;
}

.shortcut-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.shortcut-copy strong {
  color: var(--app-heading-color);
  font-size: 14px;
  font-weight: 600;
}

.shortcut-copy small {
  color: var(--app-text-color);
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 960px) {
  .home-head {
    flex-direction: column;
  }

  .shortcut-grid {
    grid-template-columns: 1fr;
  }
}
</style>
