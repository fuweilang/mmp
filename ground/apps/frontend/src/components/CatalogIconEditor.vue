<template>
 <div class="catalog-icon-editor">
  <div class="catalog-icon-preview" aria-hidden="true"><img v-if="preview && !broken" :src="preview" alt="" @error="broken=true"/><ImageIcon v-else :size="24"/></div>
  <div class="catalog-icon-controls">
   <div class="catalog-icon-buttons"><el-upload ref="upload" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" :auto-upload="false" :show-file-list="false" :disabled="disabled || checking" :on-change="picked"><el-button :disabled="disabled" :loading="checking">{{ preview ? '替换图标' : '选择图标' }}</el-button></el-upload><el-button v-if="preview || modelValue" :disabled="disabled || checking" @click="remove">移除图标</el-button><el-button v-if="removed && currentUrl" :disabled="disabled || checking" @click="emit('update:removed',false)">保留原图</el-button></div>
   <p>可选PNG / JPG / WebP，≤2MB，建议方图；无图使用功能图标。</p>
   <p>{{ removed ? '保存后移除图标，取消不会生效。' : '选择后仅预览，保存才上传；取消不会改动现有图标。' }}</p>
  </div>
 </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage, type UploadFile, type UploadInstance } from 'element-plus';
import { Image as ImageIcon } from 'lucide-vue-next';
import { validateCatalogImage } from '../utils/catalog-image';
const props=defineProps<{modelValue:File|null;removed:boolean;currentUrl?:string|null;disabled?:boolean}>();
const emit=defineEmits<{'update:modelValue':[File|null];'update:removed':[boolean];validating:[boolean]}>();
const upload=ref<UploadInstance>();const checking=ref(false);const localUrl=ref('');const broken=ref(false);let sequence=0;
const preview=computed(()=>props.removed?'':localUrl.value||props.currentUrl||'');
watch(()=>props.modelValue,file=>{if(localUrl.value)URL.revokeObjectURL(localUrl.value);localUrl.value=file?URL.createObjectURL(file):'';},{immediate:true});
watch(preview,()=>{broken.value=false});
async function picked(value:UploadFile){const file=value.raw;upload.value?.clearFiles();if(!file||props.disabled)return;const request=++sequence;checking.value=true;emit('validating',true);try{await validateCatalogImage(file);if(request!==sequence)return;emit('update:modelValue',file);emit('update:removed',false);}catch(error){if(request===sequence)ElMessage.error(error instanceof Error?error.message:'图片无效');}finally{if(request===sequence){checking.value=false;emit('validating',false);}}}
function remove(){emit('update:modelValue',null);emit('update:removed',true);}
onBeforeUnmount(()=>{sequence++;if(localUrl.value)URL.revokeObjectURL(localUrl.value);emit('validating',false);});
</script>
<style scoped>
.catalog-icon-editor{display:flex;align-items:flex-start;gap:14px;max-width:100%;}.catalog-icon-preview{position:relative;display:flex;align-items:center;justify-content:center;flex:none;width:64px;height:64px;border:1px solid var(--el-border-color-lighter);border-radius:10px;color:var(--el-text-color-secondary);background:var(--el-fill-color-light);overflow:hidden;}.catalog-icon-preview img{width:100%;height:100%;object-fit:cover;}.catalog-icon-controls{min-width:0;}.catalog-icon-buttons{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}.catalog-icon-buttons>.el-button{margin-left:0;}.catalog-icon-controls p{font-size:12px;line-height:18px;color:var(--el-text-color-secondary);margin:5px 0 0;}@media(max-width:560px){.catalog-icon-editor{flex-direction:column;gap:10px;}}
</style>
