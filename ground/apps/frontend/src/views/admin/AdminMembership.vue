<template>
  <section class="membership-page" v-loading="loading">
    <header class="page-head">
      <div>
        <h1>套餐与定价</h1>
        <p>只定专业版和旗舰版的年费，以及三段短说明。标准版不标价。</p>
      </div>
      <div>
        <el-button @click="reload">刷新</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div class="cards">
      <el-card shadow="never">
        <template #header>标准版</template>
        <p class="hint">永久可用，不收费。</p>
        <el-input v-model="form.standardSummary" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="这段说明以后给客户看" />
      </el-card>
      <el-card shadow="never">
        <template #header>专业版</template>
        <el-form-item label="年费（元）">
          <el-input-number v-model="form.proPriceYuan" :min="1" :max="100000000" :step="1000" :precision="0" />
        </el-form-item>
        <el-input v-model="form.proSummary" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="这段说明以后给客户看" />
      </el-card>
      <el-card shadow="never">
        <template #header>旗舰版</template>
        <el-form-item label="年费（元）">
          <el-input-number v-model="form.flagshipPriceYuan" :min="1" :max="100000000" :step="1000" :precision="0" />
        </el-form-item>
        <el-input v-model="form.flagshipSummary" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="这段说明以后给客户看" />
      </el-card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { adminMembershipApi, type MembershipCatalog } from '@/api/admin';

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const form = reactive({
  proPriceYuan: null as number | null,
  flagshipPriceYuan: null as number | null,
  standardSummary: '',
  proSummary: '',
  flagshipSummary: '',
});

function apply(catalog: MembershipCatalog) {
  form.proPriceYuan = catalog.proPriceYuan > 0 ? catalog.proPriceYuan : null;
  form.flagshipPriceYuan = catalog.flagshipPriceYuan > 0 ? catalog.flagshipPriceYuan : null;
  form.standardSummary = catalog.standardSummary;
  form.proSummary = catalog.proSummary;
  form.flagshipSummary = catalog.flagshipSummary;
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    apply(await adminMembershipApi.getCatalog());
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取套餐失败';
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!Number.isInteger(form.proPriceYuan) || form.proPriceYuan! < 1 || !Number.isInteger(form.flagshipPriceYuan) || form.flagshipPriceYuan! < 1) {
    error.value = '年费要填正整数';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    apply(await adminMembershipApi.saveCatalog({
      proPriceYuan: form.proPriceYuan!,
      flagshipPriceYuan: form.flagshipPriceYuan!,
      standardSummary: form.standardSummary,
      proSummary: form.proSummary,
      flagshipSummary: form.flagshipSummary,
    }));
    ElMessage.success('已保存');
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    saving.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.membership-page { display: flex; flex-direction: column; gap: 16px; padding: 24px; }
.page-head, .page-head > div:last-child { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
.page-head h1 { margin: 0 0 6px; font-size: 22px; }
.page-head p, .hint { margin: 0 0 8px; color: #667085; }
.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 960px) { .cards { grid-template-columns: 1fr; } }
</style>
