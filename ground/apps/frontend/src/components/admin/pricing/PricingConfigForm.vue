<template>
    <el-card shadow="never" class="section-card config-card pricing-form-root">
      <template #header>
        <div class="card-header">
          <div class="config-card-title">
            <strong>AI币计价参数</strong>
            <span class="config-card-sub">
              主路径：tokensPerAiCoin（暂定锁 1）、1 元入账 AI币、开户赠送。扣费与充值入账共用本页保存值；采购单价只读参考建议汇率。
            </span>
          </div>
          <span v-if="configUpdatedAt" class="config-updated">更新于 {{ formatDateTime(configUpdatedAt) }}</span>
        </div>
      </template>

      <el-form class="config-form" label-position="top" @submit.prevent>
        <div class="config-top-row">
          <div class="config-field">
            <label class="field-label">
              1 AI币对应多少 token
              <span class="suggest-badge">已锁定</span>
            </label>
            <div class="field-with-suffix">
              <el-input-number
                :model-value="tokensPerAiCoin"
                class="field-control"
                :min="1"
                :step="1"
                :precision="0"
                :disabled="true"
                controls-position="right"
              />
              <span class="field-suffix">token</span>
            </div>
            <p class="field-hint">
              产品暂定 1 AI币 = 1 token。扣费 = floor(tokens / N)；有用量不足 1 币至少扣 1。与 precheck / 展示一致。
            </p>
          </div>
          <div class="config-field config-field-n">
            <label class="field-label">
              1 元入账多少 AI币
              <span v-if="suggestedAiCoinsPerYuan" class="suggest-badge">
                建议 {{ suggestedAiCoinsPerYuan.toLocaleString('zh-CN') }}
              </span>
            </label>
            <div class="field-with-action">
              <el-input-number
                :model-value="aiCoinsPerYuan"
                @update:model-value="$emit('update:aiCoinsPerYuan', Number($event ?? 0))"
                class="field-control"
                :min="1"
                :step="100"
                :precision="0"
                controls-position="right"
              />
              <el-button
                type="primary"
                plain
                :disabled="!canApplySuggested"
                @click="$emit('apply-suggested')"
              >
                写入建议
              </el-button>
            </div>
            <p class="field-hint">
              充值入账 = floor(实付元 × 本值)。建议来自只读采购 mid（星标 → 池序首模）。保存后扣费与充值共用本配置。
            </p>
          </div>
          <div class="config-field">
            <label class="field-label">新企业开户赠送（元）</label>
            <div class="field-with-suffix">
              <el-input-number
                :model-value="welcomeGiftYuan"
                @update:model-value="$emit('update:welcomeGiftYuan', Number($event ?? 0))"
                class="field-control"
                :min="0"
                :step="1"
                :precision="2"
                controls-position="right"
              />
              <span class="field-suffix">元</span>
            </div>
            <p class="field-hint">
              开户赠送 = floor(赠送元 × 1元入账 AI币)。填 0 不赠送。预估
              {{ estimatedWelcomeGiftCoins.toLocaleString('zh-CN') }} AI币。
            </p>
          </div>
        </div>

        <div class="vendor-price-block">
          <div class="vendor-price-head">
            <div class="vendor-price-head-row">
              <div>
                <strong>上游采购单价（只读参考）</strong>
                <span class="vendor-unit">元 / 100万 token · 不参与扣币保存</span>
              </div>
              <div class="vendor-head-actions">
                <el-button
                  size="small"
                  :loading="refreshingRef"
                  :disabled="!vendorRows.length"
                  @click="$emit('refresh-references')"
                >
                  刷新参考
                </el-button>
              </div>
            </div>
          </div>

          <p v-if="historicalPricesOnly" class="historical-hint">
            目录空，以下为历史单价（只读参考，用于建议汇率）。请到
            <a class="inline-link" href="/admin/models">模型管理</a>
            启用聊天模型。
          </p>

          <div v-if="showCatalogEmpty" class="vendor-empty">
            <p class="vendor-empty-title">暂无已启用聊天厂商</p>
            <p class="vendor-empty-desc">
              模型目录为空。请前往
              <a class="inline-link" href="/admin/models">模型管理</a>
              启用厂商与模型；上方充值 N / 开户赠送仍可保存。
            </p>
          </div>

          <div
            v-for="vendor in vendorRows"
            :key="vendor.key"
            class="model-price-card is-readonly"
            :class="{
              'is-preferred': vendor.isPreferred,
            }"
          >
            <div class="model-price-title">
              <strong>{{ vendor.label }}</strong>
              <span v-if="vendor.isPreferred" class="preferred-badge">★默认</span>
              <span class="model-meta">只读参考 · 厂商级</span>
            </div>
            <div class="vendor-grid">
              <div class="config-field">
                <label class="field-label">提问价</label>
                <el-input-number
                  :model-value="ensurePair(vendor.key).input"
                  class="field-control"
                  :min="0"
                  :step="0.01"
                  :precision="2"
                  :disabled="true"
                  controls-position="right"
                />
                <p class="field-hint">{{ vendor.hintInput }}</p>
              </div>
              <div class="config-field">
                <label class="field-label">回复价</label>
                <el-input-number
                  :model-value="ensurePair(vendor.key).output"
                  class="field-control"
                  :min="0"
                  :step="0.01"
                  :precision="2"
                  :disabled="true"
                  controls-position="right"
                />
                <p class="field-hint">{{ vendor.hintOutput }}</p>
              </div>
            </div>
          </div>
        </div>

      </el-form>
    </el-card>
</template>

<script setup lang="ts">
import { formatDateTime } from '@/utils/format';

defineProps<{
  tokensPerAiCoin: number;
  aiCoinsPerYuan: number;
  welcomeGiftYuan: number;
  suggestedAiCoinsPerYuan: number;
  canApplySuggested: boolean;
  estimatedWelcomeGiftCoins: number;
  vendorRows: Array<{
    key: string;
    label: string;
    hintInput: string;
    hintOutput: string;
    hasOfficialRef: boolean;
    isPreferred: boolean;
  }>;
  historicalPricesOnly: boolean;
  showCatalogEmpty: boolean;
  refreshingRef: boolean;
  ensurePair: (key: string) => { input: number; output: number };
  configUpdatedAt?: string | null;
}>();

defineEmits<{
  (e: 'update:aiCoinsPerYuan', v: number): void;
  (e: 'update:welcomeGiftYuan', v: number): void;
  (e: 'apply-suggested'): void;
  (e: 'refresh-references'): void;
}>();
</script>

<style scoped>
.pricing-form-root {
  --app-primary-color: #4A53A3;
  --app-primary-hover-color: #3E468C;
  --app-primary-light-color: #EEF0F8;
  --el-color-primary: #4A53A3;
  --el-color-primary-dark-2: #3E468C;
  --el-color-primary-light-3: #6b7fff;
  --el-color-primary-light-5: #9aa8ff;
  --el-color-primary-light-7: #c5ccff;
  --el-color-primary-light-8: #d9deff;
  --el-color-primary-light-9: #EEF0F8;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fff;
  padding: 15px;
  min-height: 100%;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.page-head h1 {
  margin: 0 0 4px;
  font-size: 20px;
  color: #333946;
}

.page-head p {
  margin: 0;
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
  max-width: 720px;
}

.pricing-page :deep(.el-button) {
  border-radius: 0;
}

.pricing-page :deep(.el-input__wrapper) {
  border-radius: 0;
}

.page-alert {
  margin-bottom: 0;
}

.section-card {
  border-radius: 0;
  border-color: #dfe5ef;
}

.section-card :deep(.el-card__header) {
  padding: 14px 16px;
  border-bottom-color: #dfe5ef;
  background: #fff;
}

.section-card :deep(.el-card__body) {
  padding: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.config-card-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-card-title strong {
  color: #333946;
  font-size: 15px;
}

.config-card-sub {
  color: #8b909b;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
}

.config-updated {
  color: #8b909b;
  font-size: 12px;
  white-space: nowrap;
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-top-row {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) minmax(240px, 1.2fr) minmax(200px, 1fr);
  gap: 16px 24px;
}

.config-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: #333946;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.field-control {
  width: 100%;
  max-width: 220px;
}

.config-field-n .field-control {
  max-width: 280px;
}

.field-with-action {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.field-with-action .field-control {
  flex: 1 1 180px;
}

.config-form :deep(.el-input-number) {
  width: 100%;
}

.config-form :deep(.el-input-number .el-input__wrapper) {
  border-radius: 0;
}

.field-hint {
  margin: 0;
  color: #8b909b;
  font-size: 12px;
  line-height: 1.45;
}

.hint-em {
  color: #667085;
  font-weight: 600;
}

.suggest-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  height: 20px;
  background: #EEF0F8;
  color: #4A53A3;
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
}

.vendor-price-block {
  margin: 0;
  padding: 14px 16px 16px;
  background: #f8fafc;
  border: 1px solid #dfe5ef;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.vendor-price-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vendor-price-head-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.vendor-head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.vendor-price-head strong {
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

.vendor-unit {
  margin-left: 8px;
  color: #8b909b;
  font-size: 12px;
  font-weight: 400;
}

.vendor-ref-note {
  margin: 0;
  color: #8b909b;
  font-size: 12px;
  line-height: 1.5;
}

.ref-checked {
  display: inline-block;
  margin-left: 6px;
  color: #667085;
}

.inline-link {
  color: #4A53A3;
  text-decoration: none;
}

.inline-link:hover {
  text-decoration: underline;
}

.model-price-card {
  padding: 12px 12px 14px;
  background: #fff;
  border: 1px solid #dfe5ef;
}

.model-price-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.model-price-title strong {
  color: #333946;
  font-size: 13px;
  font-weight: 600;
}

.model-meta {
  color: #8b909b;
  font-size: 12px;
}

.row-apply-btn {
  margin-left: auto;
  min-height: 24px;
  padding: 0 4px;
}

.vendor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 20px;
}

.config-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}

.config-actions :deep(.el-button) {
  border-radius: 0;
  min-width: 88px;
}

.config-actions :deep(.el-button--primary) {
  --el-button-bg-color: #4A53A3;
  --el-button-border-color: #4A53A3;
  --el-button-hover-bg-color: #3E468C;
  --el-button-hover-border-color: #3E468C;
  --el-button-active-bg-color: #3E468C;
  --el-button-active-border-color: #3E468C;
}

@media (max-width: 720px) {
  .config-top-row,
  .vendor-grid {
    grid-template-columns: 1fr;
  }

  .field-control,
  .config-field-n .field-control {
    max-width: 100%;
  }

  .row-apply-btn {
    margin-left: 0;
  }
}

.field-with-suffix {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.field-suffix {
  color: var(--el-text-color-regular);
  font-size: 14px;
  flex-shrink: 0;
}

.page-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.preferred-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  height: 20px;
  background: #fff7e6;
  color: #d48806;
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
  border: 1px solid #ffd591;
}

.model-price-card.is-preferred {
  border-color: #ffd591;
  box-shadow: inset 3px 0 0 #faad14;
}

.model-price-card.is-readonly {
  opacity: 0.92;
}

.vendor-empty {
  padding: 20px 16px;
  background: #fff;
  border: 1px dashed #dfe5ef;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vendor-empty-title {
  margin: 0;
  color: #333946;
  font-size: 14px;
  font-weight: 600;
}

.vendor-empty-desc {
  margin: 0;
  color: #667085;
  font-size: 13px;
  line-height: 1.5;
}

.historical-hint {
  margin: 0;
  padding: 8px 10px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  color: #874d00;
  font-size: 12px;
  line-height: 1.45;
}
</style>
