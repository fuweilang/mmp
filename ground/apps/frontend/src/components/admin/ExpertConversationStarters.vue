<template>
  <div class="expert-starter-settings" aria-label="开场白">
    <div v-for="(row, index) in rows" :key="row.id" class="expert-starter-row">
      <input :value="row.text" :aria-label="`开场白 ${index + 1}`" placeholder="输入开始会话的示例" :disabled="disabled" maxlength="500" @input="edit(index, ($event.target as HTMLInputElement).value)" @keydown.enter.prevent />
      <button type="button" :aria-label="`移除开场白 ${index + 1}`" :disabled="disabled" @click="remove(index)"><X :size="16" /></button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
const props=defineProps<{modelValue:string;disabled?:boolean}>();
const emit=defineEmits<{'update:modelValue':[string]}>();
let sequence=0;
const rows=ref<Array<{id:number;text:string}>>([]);
const canonical=()=>rows.value.map(row=>row.text.trim()).filter(Boolean).join('\n');
function appendEmpty() {
  if (!rows.value.length || (rows.value.length<3 && rows.value.at(-1)!.text.trim())) rows.value.push({id:++sequence,text:''});
}
watch(()=>props.modelValue, value=>{
  if (rows.value.length && value===canonical()) return;
  rows.value=value.split(/\r?\n/).map(text=>text.trim()).filter(Boolean).map(text=>({id:++sequence,text}));
  appendEmpty();
},{immediate:true});
function edit(index:number,text:string) {
  if(props.disabled) return;
  rows.value[index].text=text.replace(/[\r\n]+/g,' ');
  appendEmpty();emit('update:modelValue',canonical());
}
function remove(index:number) {
  if(props.disabled) return;
  rows.value.splice(index,1);appendEmpty();emit('update:modelValue',canonical());
}
</script>
