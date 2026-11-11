<template>
  <el-button @click="show">代管授权与撤销</el-button>
  <el-dialog v-model="opened" title="批准平台代管" width="640px" align-center append-to-body class="library-modal">
    <div class="custody-content">
      <el-alert type="info" :closable="false" title="仅本人可批准自己的私人资料；仅本企业管理员可批准企业共享范围。平台不能自授权，已读内容无法收回。" />
      <el-alert v-if="error" type="error" :closable="false" :title="error" />
      <el-form v-if="options" :model="form" label-position="top">
        <el-form-item label="平台代管人"><el-select v-model="form.granteeUserId" placeholder="选择平台代管人" style="width:100%"><el-option v-for="u in options.grantees" :key="u.id" :label="u.name" :value="u.id" /></el-select></el-form-item>
        <el-form-item label="批准范围"><el-select v-model="form.contentScope" style="width:100%"><el-option label="仅我自己的私人资料" value="PRIVATE_OWNER" /><el-option v-if="options.canApproveEnterprise" label="本企业共享资料" value="ENTERPRISE" /></el-select></el-form-item>
        <el-form-item label="批准权限"><el-radio-group v-model="form.powers"><el-radio value="READ">只读（READ）</el-radio><el-radio value="CRUD">管理（CRUD）</el-radio></el-radio-group></el-form-item>
        <el-form-item label="到期（北京时间 UTC+8）"><el-input v-model="expiresAt" type="datetime-local" /></el-form-item>
        <el-form-item label="代管原因"><el-input v-model="form.reason" type="textarea" :rows="2" placeholder="具体代管原因（至少四个字）" maxlength="500" show-word-limit /></el-form-item>
        <p class="muted">{{ form.powers === 'READ' ? '只读仅允许读取已授权范围，不授予修改权。' : '管理允许在该范围内新增、修改、移动、共享与回收；彻底删除仍受保护条件限制，不转移所有者、不跨企业。' }}</p>
      </el-form>
      <h3>已有授权</h3>
      <el-table :data="grants" border size="small">
        <el-table-column prop="granteeUserId" label="代管人" min-width="120" show-overflow-tooltip /><el-table-column label="范围" width="110"><template #default="{ row }">{{ row.contentScope === 'ENTERPRISE' ? '企业共享' : '本人私人' }}</template></el-table-column>
        <el-table-column prop="powers" label="权限" width="80" /><el-table-column label="到期（UTC+8）" min-width="160"><template #default="{ row }">{{ new Date(row.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) }}</template></el-table-column>
        <el-table-column label="操作" width="80"><template #default="{ row }"><el-button v-if="!row.revokedAt" text type="danger" :disabled="busy" @click="revoke(row.id)">撤销</el-button><span v-else class="muted">已撤销</span></template></el-table-column>
        <template #empty><el-empty description="暂无授权" :image-size="64" /></template>
      </el-table>
    </div>
    <template #footer><el-button @click="opened = false">关闭</el-button><el-button :loading="busy" :disabled="busy || !options || !form.granteeUserId || form.reason.trim().length < 4 || !expiresAt" type="primary" @click="approve">{{ form.powers === 'CRUD' ? '明确批准管理代管' : '明确批准只读代管' }}</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { reactive, ref } from 'vue';
import '../styles/libraryDialogs.css';
import { ElMessage, ElMessageBox } from 'element-plus';
import { grantLibraryCustody, libraryCustodies, libraryCustodyOptions, revokeLibraryCustody, type CustodyOptions, type CustodyRow } from '../api/library';
const opened = ref(false), busy = ref(false), error = ref(''), expiresAt = ref('');
const options = ref<CustodyOptions>(), grants = ref<CustodyRow[]>([]);
const form = reactive({ granteeUserId: '', contentScope: 'PRIVATE_OWNER' as 'PRIVATE_OWNER' | 'ENTERPRISE', powers: 'READ' as 'READ' | 'CRUD', reason: '' });
async function show() { opened.value = true; try { options.value = await libraryCustodyOptions(); grants.value = await libraryCustodies(); error.value = ''; } catch(e) { error.value = e instanceof Error ? e.message : '加载失败'; } }
async function approve() {
 if (!options.value || busy.value) return;
 try {
  await ElMessageBox.confirm(form.powers === 'CRUD' ? '批准后平台代管人可以管理该明确范围的资料，包括新增、修改、回收等操作。确定批准管理权限？' : '批准后平台代管人可读取该范围内的资料，已经读过的内容无法收回。确定批准？', '确认批准代管', { customClass: 'library-message-box', type: 'warning', confirmButtonText: '批准', cancelButtonText: '取消' });
 } catch { return; }
 busy.value = true;
 try {
  await grantLibraryCustody({ tenantId: options.value.tenantId, ownerUserId: options.value.ownerUserId, ...form, expiresAt: new Date(expiresAt.value + ':00+08:00').toISOString() });
  form.reason = '';
  form.powers = 'READ';
  ElMessage.success('已批准代管授权');
  await show();
 } catch(e) { error.value = e instanceof Error ? e.message : '批准失败'; } finally { busy.value = false; }
}
async function revoke(id: string) {
 if (busy.value) return;
 try {
  await ElMessageBox.confirm('撤销后平台代管人不能再读取该范围资料，已读内容不会被抹掉。确定撤销？', '确认撤销代管', { customClass: 'library-message-box', type: 'warning', confirmButtonText: '撤销', cancelButtonText: '取消' });
 } catch { return; }
 busy.value = true;
 try { await revokeLibraryCustody(id); ElMessage.success('已撤销代管授权'); await show(); }
 catch(e) { error.value = e instanceof Error ? e.message : '撤销失败'; } finally { busy.value = false; }
}
</script>

<style scoped>
.custody-content { display:flex; flex-direction:column; gap:16px; }
.custody-content h3 { margin:0; font-size:15px; color:var(--el-text-color-primary); }
.muted { margin:0; color:var(--el-text-color-secondary); font-size:12px; line-height:1.6; }
.custody-content :deep(.el-form-item:last-of-type) { margin-bottom:12px; }
.custody-content :deep(th.el-table__cell) { background:var(--el-fill-color-light); }
</style>
