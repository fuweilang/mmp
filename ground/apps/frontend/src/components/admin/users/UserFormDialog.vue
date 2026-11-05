<template>
  <el-dialog
    :model-value="modelValue"
    :title="editingId ? '编辑用户' : '新建用户'"
    class="user-dialog"
    width="520px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="96px">
      <el-form-item label="姓名" prop="name">
        <el-input
          v-model="form.name"
          maxlength="40"
          placeholder="请输入姓名"
          @input="form.name = form.name.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s·.-]/g, '')"
        />
      </el-form-item>
      <el-form-item label="手机号" prop="phone">
        <el-input
          v-model="form.phone"
          maxlength="11"
          :disabled="Boolean(editingId)"
          placeholder="请输入手机号"
          @input="form.phone = form.phone.replace(/[^\d]/g, '').slice(0, 11)"
        />
        <div v-if="editingId" class="form-hint">
          手机号创建后不可修改
        </div>
      </el-form-item>
      <el-form-item v-if="!editingId" label="密码" prop="password">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          placeholder="请输入密码"
        />
      </el-form-item>
      <el-form-item v-if="!editingId" label="确认密码" prop="passwordConfirm">
        <el-input
          v-model="form.passwordConfirm"
          type="password"
          show-password
          placeholder="请再次输入密码"
        />
      </el-form-item>
      <el-form-item v-if="!hideRoleSelect" label="角色" prop="roleKeys">
        <el-select
          v-model="form.roleKeys"
          multiple
          clearable
          collapse-tags
          collapse-tags-tooltip
          style="width: 100%"
          placeholder="可多选，权限取并集"
          @change="$emit('role-change')"
        >
          <el-option
            v-for="role in assignableRoles"
            :key="role.key"
            :label="role.name"
            :value="role.key"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="!hideRoleSelect" label="所属企业" prop="tenantId">
        <el-select
          v-model="form.tenantId"
          filterable
          placeholder="选择一家企业"
          style="width: 100%"
        >
          <el-option v-for="t in enterprises" :key="t.id" :label="t.name" :value="t.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSaveClick">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import type { AdminEnterpriseRow, AdminRoleRow } from '@/api/admin';

export type UserFormModel = {
  name: string;
  phone: string;
  password: string;
  passwordConfirm: string;
  roleKeys: string[];
  tenantId: string;
};

const props = defineProps<{
  modelValue: boolean;
  form: UserFormModel;
  editingId: string;
  saving: boolean;
  enterprises: AdminEnterpriseRow[];
  roleOptions: AdminRoleRow[];
}>();

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  save: [];
  'role-change': [];
}>();

const formRef = ref<FormInstance>();

const hideRoleSelect = computed(
  () => Boolean(props.editingId) && props.form.roleKeys.includes('super_admin'),
);

const assignableRoles = computed(() =>
  props.roleOptions.filter((role) => role.key !== 'super_admin'),
);

const requiresEnterprise = computed(
  () =>
    props.form.roleKeys.length > 0
    && !props.form.roleKeys.every((key) => ['super_admin', 'platform_admin'].includes(key)),
);

const rules: FormRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [{ required: true, pattern: /^1\d{10}$/, message: '请输入 11 位手机号', trigger: 'blur' }],
  roleKeys: [{ required: true, type: 'array', min: 1, message: '请至少选择一个角色', trigger: 'change' }],
  password: [
    {
      validator: (_rule, value: string, callback) => {
        if (!props.editingId && !value) {
          callback(new Error('请输入密码'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  passwordConfirm: [
    {
      validator: (_rule, value: string, callback) => {
        if (props.editingId) {
          callback();
          return;
        }
        if (!value) {
          callback(new Error('请再次输入密码'));
          return;
        }
        if (value !== props.form.password) {
          callback(new Error('两次输入的密码不一致'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  tenantId: [
    {
      validator: (_rule, value: string, callback) => {
        if (requiresEnterprise.value && !value) {
          callback(new Error('用户必须有企业归属，请选择所属企业'));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ],
};

watch(
  () => props.modelValue,
  (open) => {
    if (open) void nextTick(() => formRef.value?.clearValidate());
  },
);

async function onSaveClick() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  emit('save');
}

defineExpose({
  validate: () => formRef.value?.validate(),
  clearValidate: () => formRef.value?.clearValidate(),
  validateField: (prop: string) => formRef.value?.validateField(prop),
});
</script>

<style scoped>
.form-hint {
  color: #98a2b3;
  font-size: 12px;
  line-height: 1.6;
  margin-top: 4px;
}

.form-hint-block {
  margin: 0 0 4px 96px;
}
</style>

<style>
/* 弹窗统一风格：方角、细分隔线、13px 正文 */
.user-dialog {
  border-radius: 0;
  max-width: calc(100vw - 32px);
}

.user-dialog .el-dialog__header {
  border-bottom: 1px solid #dfe5ef;
  margin-right: 0;
  padding: 18px 24px;
}

.user-dialog .el-dialog__title {
  color: #333946;
  font-size: 16px;
  font-weight: 600;
}

.user-dialog .el-dialog__headerbtn {
  height: 52px;
  width: 52px;
}

.user-dialog .el-dialog__body {
  color: #333946;
  font-size: 13px;
  padding: 22px 24px 6px;
}

.user-dialog .el-dialog__footer {
  border-top: 1px solid #dfe5ef;
  padding: 14px 24px;
}

.user-dialog .el-dialog__footer .el-button + .el-button {
  margin-left: 8px;
}

.user-dialog .el-form-item {
  margin-bottom: 18px;
}

.user-dialog .el-form-item__label {
  color: #667085;
  font-weight: 400;
}

.user-dialog .el-descriptions__label {
  background: #f8fafc;
  color: #667085;
  font-weight: 400;
  text-align: right;
  width: 96px;
}

.user-dialog .el-descriptions__content {
  color: #333946;
}

.user-dialog .el-descriptions__cell {
  padding: 10px 14px;
}
</style>
