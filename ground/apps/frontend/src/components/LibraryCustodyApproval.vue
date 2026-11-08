<template>
  <el-button @click="show">代管授权与撤销</el-button>
  <el-dialog v-model="opened" title="批准平台代管" width="560px">
    <p>仅资料本人可授权自己的私人范围；仅本企业管理员可授权企业共享范围。平台不能自授权。已读内容无法收回。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="options">
      <el-select v-model="form.granteeUserId" placeholder="选择平台代管人"><el-option v-for="u in options.grantees" :key="u.id" :label="u.name" :value="u.id" /></el-select>
      <el-select v-model="form.contentScope"><el-option label="仅我自己的私人资料" value="PRIVATE_OWNER" /><el-option v-if="options.canApproveEnterprise" label="本企业共享资料" value="ENTERPRISE" /></el-select>
      <p>本轮审批仅授予只读，不授予平台更改或共享私有资料的权力。</p>
      <label>到期（北京时间 UTC+8）<el-input v-model="expiresAt" type="datetime-local" /></label>
      <el-input v-model="form.reason" placeholder="具体代管原因（至少四个字）" maxlength="500" />
      <el-button :disabled="busy || !form.granteeUserId || form.reason.trim().length < 4 || !expiresAt" type="primary" @click="approve">明确批准只读代管</el-button>
    </template>
    <el-table :data="grants">
      <el-table-column prop="granteeUserId" label="代管人" /><el-table-column prop="contentScope" label="范围" /><el-table-column label="到期"><template #default="{ row }">{{ new Date(row.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) }} UTC+8</template></el-table-column>
      <el-table-column label="操作"><template #default="{ row }"><el-button v-if="!row.revokedAt" @click="revoke(row.id)">撤销</el-button><span v-else>已撤销</span></template></el-table-column>
    </el-table>
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
