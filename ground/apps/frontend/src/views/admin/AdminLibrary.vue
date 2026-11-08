<template>
  <section class="admin-library">
    <h2>资料库概况</h2>
    <p>这里只显示容量、数量和解析状态，不显示文件名或正文。代管需要写明范围和到期，撤销后不能再读，已经看过的内容不会被抹掉。</p>
    <p v-if="limits">
      单文件上限 {{ formatBytes(limits.maxFileBytes) }}，企业容量 {{ formatBytes(limits.tenantQuotaBytes) }}，
      回收保留 {{ limits.recycleDays }} 天。允许类型：{{ limits.allowedExtensions.join(' ') }}
    </p>
    <p v-if="error" class="admin-library-error">{{ error }}</p>
    <el-table v-loading="loading" :data="tenants">
      <el-table-column prop="tenantName" label="企业" min-width="140" />
      <el-table-column prop="activeFiles" label="使用中" width="90" />
      <el-table-column prop="recycledFiles" label="回收站" width="90" />
      <el-table-column prop="versionCount" label="版本数" width="90" />
      <el-table-column label="已用容量" width="120">
        <template #default="{ row }">{{ formatBytes(row.usedBytes) }}</template>
      </el-table-column>
      <el-table-column :label="statusLabel('READY')" prop="ready" width="110" />
      <el-table-column :label="statusLabel('PENDING')" prop="pending" width="90" />
      <el-table-column :label="statusLabel('PROCESSING')" prop="processing" width="90" />
      <el-table-column :label="statusLabel('FAILED')" prop="failed" width="80" />
      <el-table-column :label="statusLabel('DOWNLOAD_ONLY')" prop="downloadOnly" width="90" />
    </el-table>

    <h3>代管授权</h3>
    <el-form inline @submit.prevent="grant">
      <el-input v-model="form.tenantId" placeholder="企业 ID" />
      <el-input v-model="form.granteeUserId" placeholder="被授权用户 ID" />
      <el-select v-model="form.contentScope" placeholder="范围">
        <el-option label="企业共享" value="ENTERPRISE" />
        <el-option label="指定人的私人资料" value="PRIVATE_OWNER" />
      </el-select>
      <el-input v-if="form.contentScope === 'PRIVATE_OWNER'" v-model="form.ownerUserId" placeholder="所有者用户 ID" />
      <el-select v-model="form.powers">
        <el-option label="只读" value="READ" />
        <el-option label="可代管修改" value="CRUD" />
      </el-select>
      <el-date-picker v-model="form.expiresAt" type="datetime" placeholder="到期" value-format="YYYY-MM-DDTHH:mm:ss.SSSZ" />
      <el-input v-model="form.reason" placeholder="授权原因" />
      <el-button type="primary" native-type="submit">授予</el-button>
    </el-form>
    <el-table :data="custodies">
      <el-table-column prop="tenantId" label="企业" min-width="140" />
      <el-table-column prop="granteeUserId" label="被授权人" min-width="140" />
      <el-table-column label="范围" width="160">
        <template #default="{ row }">{{ row.contentScope === 'ENTERPRISE' ? '企业共享' : '指定人私人' }}</template>
      </el-table-column>
      <el-table-column prop="powers" label="权限" width="90" />
      <el-table-column prop="expiresAt" label="到期" min-width="180" />
      <el-table-column prop="reason" label="原因" min-width="160" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">{{ row.revokedAt ? '已撤销' : '有效' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button v-if="!row.revokedAt" text type="danger" @click="revoke(row.id)">撤销</el-button>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { LibraryParseStatusLabel, type LibraryParseStatus } from '@mammoth/shared';
import { formatBytes } from '../../utils/format';
import {
  grantLibraryCustody,
  libraryAdminStats,
  libraryCustodies,
  revokeLibraryCustody,
  type CustodyRow,
  type LibraryStats,
} from '../../api/library';

const loading = ref(false);
const error = ref('');
const limits = ref<LibraryStats['limits'] | null>(null);
const tenants = ref<LibraryStats['tenants']>([]);
const custodies = ref<CustodyRow[]>([]);
const form = reactive({
  tenantId: '',
  granteeUserId: '',
  contentScope: 'ENTERPRISE' as 'ENTERPRISE' | 'PRIVATE_OWNER',
  ownerUserId: '',
  powers: 'READ' as 'READ' | 'CRUD',
  expiresAt: '',
  reason: '',
});

function statusLabel(status: LibraryParseStatus) {
  return LibraryParseStatusLabel[status];
}

async function load() {
  loading.value = true;
  try {
    const stats = await libraryAdminStats();
    limits.value = stats.limits;
    tenants.value = stats.tenants;
    custodies.value = await libraryCustodies();
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '概况加载失败';
  } finally {
    loading.value = false;
  }
}

async function grant() {
  try {
    const row = await grantLibraryCustody({
      tenantId: form.tenantId.trim(),
      granteeUserId: form.granteeUserId.trim(),
      contentScope: form.contentScope,
      ownerUserId: form.ownerUserId.trim() || undefined,
      powers: form.powers,
      expiresAt: form.expiresAt,
      reason: form.reason.trim(),
    });
    ElMessage.success(`已授予代管 ${row.id}`);
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '授予失败';
  }
}

async function revoke(id: string) {
  try {
    const row = await revokeLibraryCustody(id);
    ElMessage.success(row.message || '已撤销代管');
    await load();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '撤销失败';
  }
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.admin-library { display: flex; flex-direction: column; gap: 12px; }
.admin-library-error { color: #b42318; }
.admin-library h2, .admin-library h3 { margin: 0; color: var(--app-heading-color); }
</style>