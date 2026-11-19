<template>
  <el-dialog :model-value="modelValue" title="AI 生成头像" width="440px" class="catalog-avatar-generation" align-center append-to-body :close-on-click-modal="false" @update:model-value="close">
    <div v-loading="loading" class="avatar-generator">
      <template v-if="models.length">
        <label class="avatar-generator-label" for="avatar-image-model">生图模型</label>
        <el-select id="avatar-image-model" v-model="selected" :disabled="generating" aria-label="生图模型">
          <el-option v-for="(item,index) in models" :key="item.providerId+item.model" :value="index" :label="item.displayName || item.model.split('/').pop()" />
        </el-select>
        <label class="avatar-generator-label" for="avatar-image-prompt">描述你想要的头像</label>
        <el-input id="avatar-image-prompt" v-model="prompt" type="textarea" :rows="3" :maxlength="1000" show-word-limit placeholder="例如：紫色渐变背景，简洁的白色增长曲线图标" :disabled="generating" />
        <div v-if="resultUrl" class="avatar-generator-preview"><img :src="resultUrl" alt="生成的头像预览" /></div>
        <div v-else-if="generating" class="avatar-generator-wait"><Sparkles :size="28"/><span>正在绘制头像，请稍候…</span></div>
        <p class="avatar-generator-note">生成后可预览，保存修改后生效。</p>
      </template>
      <div v-else-if="!loading" class="catalog-avatar-generation-empty"><Sparkles :size="28"/><p>{{ error || '暂无可用生图模型' }}</p><el-button @click="loadModels">重新检查</el-button></div>
      <p v-if="error && models.length" role="alert" class="avatar-generator-error">{{error}}</p>
    </div>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button v-if="models.length" :type="resultUrl?'default':'primary'" :loading="generating" :disabled="!prompt.trim() || loading" @click="generate">{{resultUrl?'重新生成':'生成头像'}}</el-button>
      <el-button v-if="resultUrl && !previewOnly" type="primary" :disabled="generating" @click="useImage">使用这张图</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import '../styles/catalogAvatar.css';
import { Sparkles } from 'lucide-vue-next';
import { avatarGenerationApi, type AvatarModel } from '../api/admin/avatar-generation';
const props=defineProps<{modelValue:boolean;initialModel?:{providerId:string;model:string};previewOnly?:boolean}>();
const emit=defineEmits<{'update:modelValue':[boolean];selected:[File]}>();
const models=ref<AvatarModel[]>([]),selected=ref(0),prompt=ref(''),loading=ref(false),generating=ref(false),error=ref(''),resultUrl=ref('');
let result:File|null=null,sequence=0,controller:AbortController|undefined;
function cancelPending(){sequence++;controller?.abort();loading.value=false;generating.value=false;}
function resetResult(){result=null;resultUrl.value='';}
function close(){cancelPending();resetResult();emit('update:modelValue',false);}
async function loadModels(){
 cancelPending();const request=sequence;controller=new AbortController();loading.value=true;error.value='';
 try{const response=await avatarGenerationApi.models(controller.signal);if(request!==sequence)return;models.value=response.models;selected.value=Math.max(0,models.value.findIndex(m=>m.providerId===props.initialModel?.providerId && m.model===props.initialModel?.model));if(!models.value.length && response.unavailableProviders)error.value='生图供应商暂时无法连接，请稍后重试';}
 catch(e){if(request===sequence)error.value=e instanceof Error?e.message:'无法获取生图模型';}
 finally{if(request===sequence)loading.value=false;}
}
async function generate(){
 const model=models.value[selected.value];if(!model || !prompt.value.trim() || generating.value)return;
 cancelPending();const request=sequence;controller=new AbortController();generating.value=true;error.value='';resetResult();
 try{
  const response=await avatarGenerationApi.generate({providerId:model.providerId,model:model.model,prompt:prompt.value.trim()},controller.signal);
  if(request!==sequence || !props.modelValue)return;
  if(response.mimeType!=='image/png' || response.base64.length>7*1024*1024)throw new Error('生成图片格式无效');
  const bytes=Uint8Array.from(atob(response.base64),c=>c.charCodeAt(0));
  result=new File([bytes],'ai-avatar.png',{type:'image/png'});resultUrl.value=`data:image/png;base64,${response.base64}`;
 }catch(e){if(request===sequence)error.value=e instanceof Error?e.message:'生成失败，请稍后重试';}
 finally{if(request===sequence)generating.value=false;}
}
function useImage(){if(!result || generating.value)return;emit('selected',result);close();}
watch(()=>props.modelValue,open=>{if(open){prompt.value='';resetResult();void loadModels();}else{cancelPending();resetResult();}},{immediate:true});
onBeforeUnmount(cancelPending);
</script>
