<template>
 <el-form label-position="top" class="admin-library-target">
  <el-form-item label="资料所有者（本企业有效成员）"><el-select v-model="value.ownerUserId" :disabled="disabled" filterable placeholder="请选择所有者"><el-option v-for="owner in options.owners" :key="owner.id" :label="owner.name || owner.id" :value="owner.id" /></el-select></el-form-item>
  <el-form-item label="访问范围"><el-radio-group v-model="value.scope" :disabled="disabled"><el-radio value="PRIVATE">仅所有者</el-radio><el-radio value="ENTERPRISE">企业共享</el-radio></el-radio-group></el-form-item>
  <el-form-item label="目标目录"><el-select v-model="value.parentId" :disabled="disabled || !value.ownerUserId" clearable filterable placeholder="该所有者的根目录"><el-option v-for="folder in folders" :key="folder.id" :value="folder.id" :label="folderPath(folder.id)" /></el-select></el-form-item>
  <el-checkbox v-if="value.scope === 'ENTERPRISE'" v-model="value.confirmShare" :disabled="disabled">我确认该资料对企业成员共享，不代表AI一定可读</el-checkbox>
 </el-form>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue';
import type { AdminOptions, AdminTarget } from '../api/libraryAdmin';
const props=defineProps<{options:AdminOptions;disabled?:boolean}>();const value=defineModel<AdminTarget>({required:true});
const folders=computed(()=>props.options.folders.filter(f=>f.ownerUserId===value.value.ownerUserId));
watch(()=>[value.value.ownerUserId,value.value.scope],()=>{value.value.parentId='';value.value.confirmShare=false;});
function folderPath(id:string){const names:string[]=[],seen=new Set<string>();let f=props.options.folders.find(f=>f.id===id);while(f&&!seen.has(f.id)&&names.length<32){names.unshift(f.name);seen.add(f.id);f=props.options.folders.find(p=>p.id===f!.parentId);}return names.join(' / ');}
</script>
<style scoped>.admin-library-target :deep(.el-select){width:100%}.admin-library-target :deep(.el-checkbox){white-space:normal;height:auto;line-height:1.6}</style>
