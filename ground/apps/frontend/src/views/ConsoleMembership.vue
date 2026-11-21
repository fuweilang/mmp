<template>
  <section class="membership-page">
    <div class="head">
      <div>
        <h1>专家广场</h1>
        <p v-if="offer">{{ planLine }}</p>
      </div>
      <el-button v-if="offer?.canPay" type="primary" @click="openUpgrade(null)">升级套餐</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
    <div v-loading="loading" class="cards">
      <component
        :is="expert.locked ? 'button' : 'div'"
        v-for="expert in experts"
        :key="expert.id"
        type="button"
        class="card"
        :class="{ locked: expert.locked }"
        @click="expert.locked ? openUpgrade(expert) : undefined"
      >
        <strong>{{ expert.name }}</strong>
        <span>{{ expert.summary }}</span>
        <em v-if="expert.locked">需升级</em>
      </component>
      <p v-if="!loading && !experts.length" class="empty">暂时还没有可用的专家</p>
    </div>

    <el-dialog v-model="visible" :title="dialogTitle" width="440px" @closed="stopPoll">
      <p>{{ selected ? '当前企业版本不够，升级后才能使用这位专家' : '购买后从付款当天起算一年。同版本未到期续费从原到期日往后延。' }}</p>
      <p v-if="offer && !offer.canPay">请联系企业管理员</p>
      <template v-else-if="offer">
        <div v-for="plan in buyable" :key="plan" class="plan">
          <strong>{{ label(plan) }}</strong>
          <p>{{ summary(plan) }}</p>
          <p>{{ price(plan) >= 1 ? `${price(plan)} 元/年` : '年费未设置' }}</p>
          <div v-if="price(plan) >= 1" class="actions">
            <el-button v-if="offer.wechatConfigured" type="primary" :loading="paying" @click="pay(plan, 'wechat')">微信支付</el-button>
            <el-button v-if="offer.alipayConfigured" :loading="paying" @click="pay(plan, 'alipay')">支付宝</el-button>
          </div>
        </div>
        <p v-if="offer.canPay && !offer.wechatConfigured && !offer.alipayConfigured">支付通道未配置，请联系平台</p>
        <img v-if="qr" class="qr" :src="qr.qrDataUrl" :alt="qr.provider === 'wechat' ? '微信支付' : '支付宝'" />
        <p v-if="paid">已升级</p>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ApiError } from '../api/http';
import { membershipApi, type MembershipOffer, type MembershipQr, type PlazaExpert } from '../api/membership';

const PLAN: Record<string, string> = { standard: '标准版', pro: '专业版', flagship: '旗舰版' };
const RANK: Record<string, number> = { standard: 1, pro: 2, flagship: 3 };

const loading = ref(false);
const error = ref('');
const offer = ref<MembershipOffer | null>(null);
const experts = ref<PlazaExpert[]>([]);
const visible = ref(false);
const selected = ref<PlazaExpert | null>(null);
const paying = ref(false);
const paid = ref(false);
const qr = ref<MembershipQr | null>(null);
let timer = 0;

const planLine = computed(() => {
  if (!offer.value) return '';
  const name = PLAN[offer.value.plan] ?? '标准版';
  if (offer.value.plan === 'standard' || !offer.value.expiresAt) return `当前版本：${name}`;
  const day = new Date(offer.value.expiresAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  return `当前版本：${name} · ${day}`;
});
const dialogTitle = computed(() => selected.value?.name || '升级套餐');
const buyable = computed(() => (['pro', 'flagship'] as const).filter(plan => (RANK[offer.value?.plan || 'standard'] ?? 1) <= RANK[plan]!));

function label(plan: 'pro' | 'flagship') { return PLAN[plan]; }
function summary(plan: 'pro' | 'flagship') { return plan === 'pro' ? offer.value?.proSummary : offer.value?.flagshipSummary; }
function price(plan: 'pro' | 'flagship') { return plan === 'pro' ? offer.value?.proPriceYuan ?? 0 : offer.value?.flagshipPriceYuan ?? 0; }

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [nextOffer, nextExperts] = await Promise.all([membershipApi.offer(), membershipApi.experts()]);
    offer.value = nextOffer;
    experts.value = nextExperts;
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : '专家广场加载失败';
  } finally {
    loading.value = false;
  }
}

function stopPoll() {
  if (timer) window.clearInterval(timer);
  timer = 0;
}

function openUpgrade(expert: PlazaExpert | null) {
  selected.value = expert;
  qr.value = null;
  paid.value = false;
  visible.value = true;
}

async function pay(plan: 'pro' | 'flagship', provider: 'wechat' | 'alipay') {
  paying.value = true;
  paid.value = false;
  try {
    qr.value = await membershipApi.payQr(plan, provider);
    stopPoll();
    timer = window.setInterval(async () => {
      if (!qr.value) return;
      try {
        const status = await membershipApi.status(qr.value.outTradeNo);
        if (!status.paid) return;
        paid.value = true;
        stopPoll();
        await load();
      } catch { /* 未支付继续等 */ }
    }, 2000);
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.message : '没能生成付款码，请重试');
  } finally {
    paying.value = false;
  }
}

onMounted(load);
onBeforeUnmount(stopPoll);
</script>

<style scoped>
.membership-page { display: flex; flex-direction: column; gap: 16px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.head h1 { margin: 0; font-size: 20px; font-weight: 500; }
.head p, .empty { margin: 4px 0 0; color: var(--el-text-color-secondary); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; min-height: 80px; }
.card { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; padding: 14px; border: 1px solid var(--el-border-color); border-radius: 12px; background: var(--el-bg-color); text-align: left; }
.card strong { font-weight: 500; }
.card span { color: var(--el-text-color-secondary); font-size: 13px; }
.card.locked { background: var(--el-fill-color-light); }
.card.locked strong, .card.locked span { color: var(--el-text-color-secondary); }
.card em { font-style: normal; font-size: 12px; color: var(--el-text-color-secondary); }
.plan { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; margin-top: 12px; }
.actions { display: flex; gap: 8px; }
.qr { width: 188px; height: 188px; margin-top: 12px; background: #fff; }
</style>
