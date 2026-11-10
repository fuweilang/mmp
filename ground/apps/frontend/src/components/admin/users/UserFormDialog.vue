<template>
  <el-dialog
    :model-value="modelValue"
    :title="editingId ? '编辑用户' : '新建用户'"
    class="user-dialog user-form-dialog"
    width="560px"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="112px">
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
      <el-form-item :label="platformAccount && editingId ? '加入终端企业' : '所属企业'" prop="tenantId">
        <el-select
          :model-value="selectedEnterpriseKnown ? form.tenantId : ''"
          filterable
          :loading="enterprisesLoading"
          :placeholder="enterprisesLoading ? '正在加载企业…' : unresolvedEnterprise ? '企业名称暂不可用' : '选择一家企业'"
          :aria-describedby="platformAccount && editingId ? 'user-member-enterprise-help' : undefined"
          style="width: 100%"
          @update:model-value="form.tenantId = $event"
        >
          <el-option v-for="t in enterpriseOptions" :key="t.id" :label="t.name" :value="t.id" />
        </el-select>
        <div v-if="platformAccount && editingId" id="user-member-enterprise-help" class="form-hint">
          仅新增所选企业的成员（MEMBER）关系，不替换或移除已有企业关系，不修改平台角色，也不开放 Console。
        </div>
        <div v-if="enterprisesError || unresolvedEnterprise" class="form-hint enterprise-load-hint" role="status">
          {{ enterprisesError || '当前企业名称暂不可用，请重新加载企业列表后确认。' }}
          <el-button link type="primary" :loading="enterprisesLoading" @click="$emit('reload-enterprises')">重新加载</el-button>
        </div>
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
  userEnterprises?: Array<Pick<AdminEnterpriseRow, 'id' | 'name'>>;
  enterprisesLoading?: boolean;
  enterprisesError?: string;
  roleOptions: AdminRoleRow[];
}>();

const emit = defineEmits<{
  'update:modelValue': [v: boolean];
  save: [];
  'role-change': [];
  'reload-enterprises': [];
}>();

const formRef = ref<FormInstance>();

// The user row already contains real tenant names. Use it while the independent
// enterprise request is pending/failed or excludes a previously assigned tenant.
// Never use an ID as a label or manufacture a business name.
const enterpriseOptions = computed(() => {
  const options = new Map<string, Pick<AdminEnterpriseRow, 'id' | 'name'>>();
  for (const enterprise of [...props.enterprises, ...(props.userEnterprises ?? [])]) {
    if (enterprise.name?.trim() && !options.has(enterprise.id)) options.set(enterprise.id, enterprise);
  }
  return [...options.values()];
});
const selectedEnterpriseKnown = computed(() => !props.form.tenantId || enterpriseOptions.value.some(t => t.id === props.form.tenantId));
const unresolvedEnterprise = computed(() => Boolean(props.form.tenantId) && !selectedEnterpriseKnown.value);

const platformAccount = computed(() => props.form.roleKeys.some(key => ['super_admin', 'platform_admin'].includes(key)));

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
  flex-basis: 100%;
  width: 100%;
  overflow-wrap: anywhere;
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
/* Only the editing form gets the new layout; view/password dialogs keep theirs. */
.user-form-dialog .el-form-item__label {
  white-space: nowrap;
}

.user-form-dialog .el-form-item__content {
  min-width: 0;
}

.user-form-dialog .el-dialog__footer {
  text-align: right;
}

@media (max-width: 600px) {
  .user-dialog.user-form-dialog .el-dialog__body {
    padding: 18px 16px 6px;
  }

  .user-form-dialog .el-form-item {
    display: block;
    margin-bottom: 20px;
  }

  .user-form-dialog .el-form-item__label {
    display: block;
    width: auto !important;
    height: auto;
    line-height: 20px;
    margin-bottom: 6px;
    padding-right: 0;
    text-align: left;
  }

  .user-form-dialog .el-form-item__content {
    margin-left: 0 !important;
  }
}

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
