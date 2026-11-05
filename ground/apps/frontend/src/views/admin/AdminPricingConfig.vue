<template>
  <section class="pricing-page" v-loading="loading">
    <header class="page-head"><div><h1>AI币计价配置</h1><p>只需设置卖几倍、开户送多少钱。模型参考价格由系统维护。</p></div><div class="page-actions"><el-button @click="reload">刷新</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></div></header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <el-card shadow="never" class="config-card">
      <template #header><div class="section-heading"><span class="section-number">01</span><div><strong>售价与开户赠送</strong><span class="section-description">设置企业消费倍率与首次开户额度</span></div></div></template>
      <div class="fields">
        <el-form-item label="售价倍率"><el-input-number v-model="form.sellPriceMultiplier" :min="1" :max="1000" :precision="2" :step="0.1" /></el-form-item>
        <el-form-item label="开户赠送金额（元）"><el-input-number v-model="form.welcomeGiftYuan" :min="0" :max="100000" :precision="2" /></el-form-item>
      </div>
      <div class="reference"><strong>固定面值：1 元 = 10,000 AI币</strong><span>1 AI币 = 0.0001 元消费额度；可用 Token 数随模型、输入输出比例及缓存命中变化。</span></div>
      <p>开户赠送 {{ money(form.welcomeGiftYuan) }} 元 = <strong>{{ coins(form.welcomeGiftYuan) }} AI币</strong>；全部用完预计对应模型采购成本约 {{ money(form.welcomeGiftYuan / validMultiplier) }} 元。</p>
      <p>倍率 {{ validMultiplier }}：采购成本 1 元，客户支付 {{ money(validMultiplier) }} 元等值 AI币。参考毛利率 {{ ((1 - 1 / validMultiplier) * 100).toFixed(1) }}%（未计税费、支付和运行成本）。</p>
      <p class="hint">开户赠送按新企业入账一次，属于消费额度，不是可提现现金；调整赠送金额不追溯已开户企业。修改倍率仅影响后续新请求。</p>
    </el-card>
    <el-card shadow="never" class="catalog-card">
      <template #header><div class="section-heading"><span class="section-number">02</span><div><strong>额度能用多少？</strong><span class="section-description">按当前倍率实时估算，无需填写采购价</span></div></div></template>
      <p class="hint">分别假设全部用于未命中缓存的输入，或全部用于输出；真实对话同时产生两项费用，不能把两列额度相加。每次扣费向上取整到整数 AI币。</p>
      <el-empty v-if="!catalog.length" description="暂无启用模型，请先到模型管理启用模型" />
      <article v-for="model in catalog" :key="model.ref" class="model-card">
        <div class="model-head"><strong>{{ model.name }}</strong><el-tag :type="model.price ? 'success' : 'warning'">{{ model.price ? '系统参考价已就绪' : '参考价待支持' }}</el-tag></div>
        <p class="hint model-ref">{{ model.ref }}</p>
        <template v-if="model.price">
          <div class="estimates"><div><span>1 元消费额度</span><strong>约 {{ tokens(1, model.price.input) }} 输入 Token</strong><span>或约 {{ tokens(1, model.price.output) }} 输出 Token</span></div><div><span>开户赠送 {{ money(form.welcomeGiftYuan) }} 元</span><strong>约 {{ tokens(form.welcomeGiftYuan, model.price.input) }} 输入 Token</strong><span>或约 {{ tokens(form.welcomeGiftYuan, model.price.output) }} 输出 Token</span></div></div>
          <details><summary>查看系统计价依据</summary>
            <p class="hint">{{ model.price.tier }} · 单位：元／百万 Token。输入成本 {{ model.price.input }}，输出成本 {{ model.price.output }}，缓存命中 {{ model.price.cachedInput ?? model.price.input }}。</p>
            <p v-if="model.price.cacheWrite5m" class="hint">缓存写入另计：5 分钟 {{ model.price.cacheWrite5m }}，1 小时 {{ model.price.cacheWrite1h }} 元／百万 Token。</p>
            <p class="hint">输入售价 {{ price(model.price.input) }}，输出售价 {{ price(model.price.output) }} 元／百万 Token。缓存写入按实际用量另计。</p>
            <p class="hint"><a :href="model.price.source" target="_blank" rel="noopener noreferrer">厂商官方价目表</a> · 最近核验 {{ new Date(model.price.checkedAt).toLocaleString('zh-CN') }}</p>
          </details>
        </template>
        <el-alert v-else title="系统尚未取得该接入渠道的有效价格，企业付费调用暂不可用。无需手填，也不会误按免费计费。" type="warning" :closable="false" />
      </article>
    </el-card>
    <p class="hint billing-note">实际扣费 = 输入、输出、缓存等参考成本合计 × 售价倍率 × 10,000。参考价按日自动核验；核验失败保留最近有效价格，超过七天停止企业计费调用。每笔账单保存计价快照，历史记录不受后续调价影响。</p>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminBillingApi, type BillingConfig } from '@/api/admin';
const loading = ref(false), saving = ref(false), error = ref('');
const catalog = ref<BillingConfig['modelCatalog']>([]);
const form = reactive({ sellPriceMultiplier: 3, welcomeGiftYuan: 5 });
const validMultiplier = computed(() => Number.isFinite(form.sellPriceMultiplier) && form.sellPriceMultiplier >= 1 ? form.sellPriceMultiplier : 1);
function money(n: number) { return Number.isFinite(n) ? n.toLocaleString('zh-CN', { maximumFractionDigits: 4 }) : '—'; }
function coins(n: number) { return Math.round(n * 10000).toLocaleString('zh-CN'); }
function price(cost: number) { return Number((cost * validMultiplier.value).toFixed(6)); }
function tokens(budget: number, cost: number) { return cost > 0 ? Math.floor(budget * 1e6 / (cost * validMultiplier.value)).toLocaleString('zh-CN') : '—'; }
function apply(config: BillingConfig) { catalog.value = config.modelCatalog || []; form.sellPriceMultiplier = config.sellPriceMultiplier; form.welcomeGiftYuan = config.welcomeGiftYuan ?? 0; }
async function reload() {
  loading.value = true; error.value = '';
  try { apply(await adminBillingApi.getConfig()); } catch (e) { error.value = e instanceof Error ? e.message : '读取计价失败'; }
  finally { loading.value = false; }
}
async function save() {
  if (![form.sellPriceMultiplier, form.welcomeGiftYuan].every(Number.isFinite) || form.sellPriceMultiplier < 1 || form.welcomeGiftYuan < 0) { error.value = '请填写有效的倍率和赠送金额'; return; }
  saving.value = true; error.value = '';
  try { apply(await adminBillingApi.updateConfig({ ...form })); ElMessage.success('已保存，后续新请求按新倍率结算'); }
  catch (e) { error.value = e instanceof Error ? e.message : '保存失败'; }
  finally { saving.value = false; }
}
onMounted(reload);
</script>
<style scoped>
.pricing-page {
  --el-color-primary: #4a53a3;
  --el-border-radius-base: 6px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  background: #f7f8fb;
  min-height: 100%;
  color: #333946;
}
.page-head, .model-head { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
.page-head { padding: 2px 0 4px; flex-wrap: wrap; }
.page-head h1 { margin: 0 0 8px; font-size: 22px; font-weight: 600; letter-spacing: -.4px; }
.page-head p { margin: 0; }
.page-head p, .hint { color: #667085; font-size: 13px; line-height: 1.8; }
.page-actions { display: flex; gap: 10px; }
.page-actions :deep(.el-button) { margin: 0; min-width: 80px; }
.pricing-page :deep(.el-card) { border: 1px solid #e6e8ef; border-radius: 10px; }
.pricing-page :deep(.el-card__header) { padding: 20px 24px; border-bottom-color: #eef0f5; }
.pricing-page :deep(.el-card__body) { padding: 24px; }
.section-heading { display: flex; gap: 12px; align-items: center; }
.section-number { display: grid; place-items: center; width: 34px; height: 34px; flex-shrink: 0; border-radius: 8px; color: #4a53a3; background: #eef0fa; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.section-heading strong { font-size: 15px; }
.section-description { display: block; margin-top: 4px; color: #818898; font-size: 12px; font-weight: 400; }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-bottom: 24px; max-width: 720px; }
.fields :deep(.el-form-item) { display: flex; flex-direction: column; align-items: stretch; margin: 0; }
.fields :deep(.el-form-item__label) { justify-content: flex-start; padding: 0; margin-bottom: 8px; color: #475467; }
.fields :deep(.el-input-number) { width: 100%; }
.reference { display: flex; flex-direction: column; gap: 8px; padding: 18px 20px; background: #f2f4fb; border-left: 3px solid #4a53a3; border-radius: 0 8px 8px 0; }
.reference strong { color: #414a8c; font-size: 16px; font-variant-numeric: tabular-nums; }
.reference span { font-size: 13px; color: #667085; line-height: 1.7; }
.config-card :deep(.el-card__body) > p { font-size: 13px; line-height: 1.9; margin: 16px 0 0; }
.config-card :deep(.el-card__body) > p strong { color: #414a8c; }
.model-card { padding: 22px; margin-top: 16px; border: 1px solid #e6e8ef; border-radius: 8px; }
.model-head { flex-wrap: wrap; }
.model-head strong { font-size: 15px; overflow-wrap: anywhere; }
.model-ref { margin: 6px 0 0; font-size: 12px; overflow-wrap: anywhere; }
.estimates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 20px 0; }
.estimates > div { display: flex; flex-direction: column; gap: 10px; padding: 18px 20px; background: #f7f8fb; border-radius: 6px; min-width: 0; }
.estimates span { color: #667085; font-size: 13px; line-height: 1.7; }
.estimates strong { color: #414a8c; font-size: 17px; line-height: 1.6; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
details { padding-top: 14px; border-top: 1px dashed #e6e8ef; }
summary { cursor: pointer; color: #4a53a3; font-size: 13px; width: fit-content; }
summary:focus-visible { outline: 2px solid #4a53a3; outline-offset: 4px; }
a { color: #4a53a3; text-underline-offset: 3px; }
.billing-note { margin: 0; padding: 0 4px 8px; }
@media (max-width: 768px) {
  .pricing-page { padding: 16px; gap: 16px; }
  .pricing-page :deep(.el-card__header), .pricing-page :deep(.el-card__body) { padding: 16px; }
  .fields, .estimates { grid-template-columns: 1fr; gap: 16px; }
  .model-card { padding: 16px; }
  .page-actions { width: 100%; justify-content: flex-end; }
}
</style>
