<template>
  <el-button @click="show">代管授权与撤销</el-button>
  <el-dialog v-model="opened" title="批准平台代管" width="640px">
    <div class="custody-content">
      <el-alert type="info" :closable="false" title="仅本人可批准自己的私人资料；仅本企业管理员可批准企业共享范围。平台不能自授权，已读内容无法收回。" />
      <el-alert v-if="error" type="error" :closable="false" :title="error" />
      <el-form v-if="options" :model="form" label-position="top">
        <el-form-item label="平台代管人"><el-select v-model="form.granteeUserId" placeholder="选择平台代管人" style="width:100%"><el-option v-for="u in options.grantees" :key="u.id" :label="u.name" :value="u.id" /></el-select></el-form-item>
        <el-form-item label="批准范围"><el-select v-model="form.contentScope" style="width:100%"><el-option label="仅我自己的私人资料" value="PRIVATE_OWNER" /><el-option v-if="options.canApproveEnterprise" label="本企业共享资料" value="ENTERPRISE" /></el-select></el-form-item>
        <el-form-item label="到期（北京时间 UTC+8）"><el-input v-model="expiresAt" type="datetime-local" /></el-form-item>
        <el-form-item label="代管原因"><el-input v-model="form.reason" type="textarea" :rows="2" placeholder="具体代管原因（至少四个字）" maxlength="500" show-word-limit /></el-form-item>
        <p class="muted">本轮仅批准只读，不授予修改或共享私人资料的权力。</p>
      </el-form>
      <h3>已有授权</h3>
      <el-table :data="grants" border size="small">
        <el-table-column prop="granteeUserId" label="代管人" min-width="120" show-overflow-tooltip /><el-table-column label="范围" width="110"><template #default="{ row }">{{ row.contentScope === 'ENTERPRISE' ? '企业共享' : '本人私人' }}</template></el-table-column>
        <el-table-column label="到期（UTC+8）" min-width="160"><template #default="{ row }">{{ new Date(row.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) }}</template></el-table-column>
        <el-table-column label="操作" width="80"><template #default="{ row }"><el-button v-if="!row.revokedAt" text type="danger" @click="revoke(row.id)">撤销</el-button><span v-else class="muted">已撤销</span></template></el-table-column>
        <template #empty><el-empty description="暂无授权" :image-size="64" /></template>
      </el-table>
    </div>
    <template #footer><el-button @click="opened = false">关闭</el-button><el-button :loading="busy" :disabled="!options || !form.granteeUserId || form.reason.trim().length < 4 || !expiresAt" type="primary" @click="approve">明确批准只读代管</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { reactive, ref } from 'vue';
import { grantLibraryCustody, libraryCustodies, libraryCustodyOptions, revokeLibraryCustody, type CustodyOptions, type CustodyRow } from '../api/library';
const opened = ref(false), busy = ref(false), error = ref(''), expiresAt = ref('');
const options = ref<CustodyOptions>(), grants = ref<CustodyRow[]>([]);
const form = reactive({ granteeUserId: '', contentScope: 'PRIVATE_OWNER' as 'PRIVATE_OWNER' | 'ENTERPRISE', reason: '' });
async function show() { opened.value = true; try { options.value = await libraryCustodyOptions(); grants.value = await libraryCustodies(); error.value = ''; } catch(e) { error.value = e instanceof Error ? e.message : '加载失败'; } }
async function approve() {
 if (!options.value) return; busy.value = true;
 try { await grantLibraryCustody({ tenantId: options.value.tenantId, ownerUserId: options.value.ownerUserId, ...form, powers: 'READ', expiresAt: new Date(expiresAt.value + ':00+08:00').toISOString() }); await show(); }
 catch(e) { error.value = e instanceof Error ? e.message : '批准失败'; } finally { busy.value = false; }
}
async function revoke(id: string) { try { await revokeLibraryCustody(id); await show(); } catch(e) { error.value = e instanceof Error ? e.message : '撤销失败'; } }
</script>

<style scoped>
.custody-content { display:flex; flex-direction:column; gap:16px; }
.custody-content h3 { margin:0; font-size:15px; color:var(--el-text-color-primary); }
.muted { margin:0; color:var(--el-text-color-secondary); font-size:12px; line-height:1.6; }
.custody-content :deep(.el-form-item:last-of-type) { margin-bottom:12px; }
.custody-content :deep(th.el-table__cell) { background:var(--el-fill-color-light); }
</style>
