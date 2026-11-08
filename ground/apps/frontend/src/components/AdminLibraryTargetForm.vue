<template>
 <el-form label-position="top" class="admin-library-target">
  <el-form-item label="资料所有者（本企业有效成员）"><el-select v-model="value.ownerUserId" :disabled="disabled" filterable placeholder="请明确选择所有者，不使用平台管理员私有身份"><el-option v-for="owner in options.owners" :key="owner.id" :label="owner.name || owner.id" :value="owner.id" /></el-select></el-form-item>
  <el-form-item label="访问范围"><el-radio-group v-model="value.scope" :disabled="disabled"><el-radio value="PRIVATE">仅所有者</el-radio><el-radio value="ENTERPRISE">企业共享</el-radio></el-radio-group></el-form-item>
  <el-form-item label="本次管理授权"><el-select v-model="value.grantId" :disabled="disabled" placeholder="请选择有效CRUD授权"><el-option v-for="grant in eligible" :key="grant.id" :value="grant.id" :label="`${grant.contentScope === 'ENTERPRISE' ? '企业共享' : '指定所有者私人'} · CRUD · ${time(grant.expiresAt)}到期`" /></el-select></el-form-item>
  <p v-if="!eligible.length" role="status">当前目标没有有效管理授权。须由企业管理员批准共享范围，或由所有者批准私人范围；平台不能自行授权。</p>
  <el-form-item label="目标目录"><el-select v-model="value.parentId" :disabled="disabled || !value.grantId" clearable filterable placeholder="企业内该所有者的根目录"><el-option v-for="folder in folders" :key="folder.id" :value="folder.id" :label="folderPath(folder.id)" /></el-select></el-form-item>
  <el-checkbox v-if="value.scope === 'ENTERPRISE'" v-model="value.confirmShare" :disabled="disabled">我确认该资料对企业成员共享，不代表AI一定可读</el-checkbox>
  <el-form-item label="管理原因"><el-input v-model="value.reason" :disabled="disabled" maxlength="500" show-word-limit placeholder="至少4个字，请勿粘贴正文或密钥" /></el-form-item>
 </el-form>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue';
import type { AdminOptions, AdminTarget } from '../api/libraryAdmin';
const props=defineProps<{options:AdminOptions;disabled?:boolean}>();const value=defineModel<AdminTarget>({required:true});
const eligible=computed(()=>props.options.grants.filter(g=>g.powers==='CRUD'&&(value.value.scope==='ENTERPRISE'?g.contentScope==='ENTERPRISE':g.contentScope==='PRIVATE_OWNER'&&g.ownerUserId===value.value.ownerUserId)));
const folders=computed(()=>props.options.folders.filter(f=>f.ownerUserId===value.value.ownerUserId&&f.grantIds.includes(value.value.grantId)));
watch(()=>[value.value.ownerUserId,value.value.scope],()=>{value.value.grantId='';value.value.parentId='';value.value.confirmShare=false;});
watch(()=>value.value.grantId,()=>{value.value.parentId='';});
const time=(v:string)=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
function folderPath(id:string){const names:string[]=[],seen=new Set<string>();let f=props.options.folders.find(f=>f.id===id);while(f&&!seen.has(f.id)&&names.length<32){names.unshift(f.name);seen.add(f.id);f=props.options.folders.find(p=>p.id===f!.parentId);}return names.join(' / ');}
</script>
<style scoped>.admin-library-target :deep(.el-select){width:100%}.admin-library-target p{font-size:12px;line-height:1.6;color:var(--el-text-color-secondary)}.admin-library-target :deep(.el-checkbox){white-space:normal;height:auto;line-height:1.6}</style>
