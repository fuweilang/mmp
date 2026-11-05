<template>
  <el-dialog
    v-model="open"
    title="修改密码"
    width="420px"
    align-center
    destroy-on-close
    @close="reset"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="原密码" prop="oldPassword">
        <el-input v-model="form.oldPassword" type="password" show-password placeholder="请输入当前密码" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input v-model="form.newPassword" type="password" show-password placeholder="请输入新密码" />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirm">
        <el-input v-model="form.confirm" type="password" show-password placeholder="再输入一次新密码" />
      </el-form-item>
    </el-form>
    <p class="pwd-hint">修改成功后需要重新登录。</p>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmit">确认修改</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useRouter } from 'vue-router';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/auth';

const open = ref(false);
const saving = ref(false);
const formRef = ref<FormInstance>();
const router = useRouter();
const auth = useAuthStore();

const form = reactive({ oldPassword: '', newPassword: '', confirm: '' });

const rules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_r, value: string, callback) => {
        if (value !== form.newPassword) callback(new Error('两次输入的密码不一致'));
        else callback();
      },
      trigger: 'blur',
    },
  ],
};

function reset() {
  form.oldPassword = '';
  form.newPassword = '';
  form.confirm = '';
  formRef.value?.clearValidate();
}

function show() {
  reset();
  open.value = true;
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    await authApi.changePassword(form.oldPassword, form.newPassword);
    ElMessage.success('密码已修改，请重新登录');
    auth.logout();
    open.value = false;
    router.push('/login');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '修改失败');
  } finally {
    saving.value = false;
  }
}

defineExpose({ show });
</script>

<style scoped>
.pwd-hint {
  color: #98a2b3;
  font-size: 12px;
  margin: 0;
}
</style>
