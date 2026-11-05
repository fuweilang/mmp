<template>
  <el-dialog
    :model-value="modelValue"
    title="添加成员"
    width="420px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
    @close="$emit('close')"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="姓名" prop="name">
        <el-input v-model="form.name" maxlength="40" />
      </el-form-item>
      <el-form-item label="手机号" prop="phone">
        <el-input
          v-model="form.phone"
          maxlength="11"
          @input="form.phone = form.phone.replace(/[^\d]/g, '').slice(0, 11)"
        />
      </el-form-item>
      <el-form-item label="密码" prop="password">
        <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" />
      </el-form-item>
      <el-form-item label="角色" prop="roleIds">
        <el-select v-model="form.roleIds" multiple style="width: 100%" placeholder="选择一个或多个角色">
          <el-option
            v-for="role in assignableRoles"
            :key="role.id"
            :label="role.name"
            :value="role.id"
          />
        </el-select>
      </el-form-item>
      <p class="role-edit-hint">平台角色不在此列；权限按角色取并集。</p>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmit">添加</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import type { AssignableRole } from '@/api/console';

defineProps<{
  modelValue: boolean;
  form: { name: string; phone: string; password: string; roleIds: string[] };
  rules: FormRules;
  assignableRoles: AssignableRole[];
  saving: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'close'): void;
  (e: 'submit'): void;
}>();

const formRef = ref<FormInstance>();

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  emit('submit');
}

defineExpose({ formRef, clearValidate: () => formRef.value?.clearValidate() });
</script>

<style scoped>
.role-edit-hint {
  margin: 0;
  color: #8b909b;
  font-size: 12px;
  line-height: 1.5;
}
</style>
