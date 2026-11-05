<template>
  <el-dialog
    :model-value="modelValue"
    :title="`修改密码 · ${memberName}`"
    width="460px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="96px">
      <el-form-item label="新密码" prop="password">
        <el-input
          v-model="passwordForm.password"
          type="password"
          show-password
          placeholder="请输入新密码"
          @input="passwordFormRef?.clearValidate('confirm')"
        />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirm">
        <el-input
          v-model="passwordForm.confirm"
          type="password"
          show-password
          placeholder="请再次输入新密码"
        />
      </el-form-item>
    </el-form>
    <p class="pwd-hint">已重置，请告知成员使用新密码登录。</p>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';

const props = defineProps<{
  modelValue: boolean;
  memberName: string;
  passwordForm: { password: string; confirm: string };
  passwordRules: FormRules;
  saving: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'submit'): void;
}>();

const passwordFormRef = ref<FormInstance>();

async function onSubmit() {
  await passwordFormRef.value?.validate();
  emit('submit');
}

defineExpose({ passwordFormRef });
</script>

<style scoped>
.pwd-hint {
  margin: 0;
  color: #98a2b3;
  font-size: 12px;
}
</style>
