<template>
  <section class="settings-page">
    <el-alert
      v-if="error"
      class="page-alert"
      :title="error"
      type="error"
      show-icon
      :closable="false"
    >
      <el-button text type="primary" @click="load">重试</el-button>
    </el-alert>

    <el-empty v-if="!hasTenant" description="请先选择企业" />

    <el-form
      v-else
      ref="formRef"
      v-loading="loading"
      :model="form"
      :rules="rules"
      label-width="96px"
      class="settings-form"
      @submit.prevent
    >
      <el-form-item label="企业名称" prop="name">
        <el-input v-model="form.name" maxlength="80" />
      </el-form-item>
      <el-form-item label="欢迎语">
        <el-input v-model="form.welcomeMessage" type="textarea" :rows="3" maxlength="400" />
      </el-form-item>
      <el-form-item label="Logo">
        <div class="logo-row">
          <img v-if="logoUrl" class="logo-preview" :src="logoUrl" alt="企业 Logo" />
          <span v-else class="logo-preview logo-placeholder">无</span>
          <el-upload :show-file-list="false" accept=".png,.jpg,.jpeg,.webp,.svg" :http-request="onLogoUpload">
            <el-button :loading="logoUploading">上传 Logo</el-button>
          </el-upload>
        </div>
      </el-form-item>
      <el-form-item>
        <div class="settings-actions">
          <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
        </div>
      </el-form-item>
    </el-form>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type UploadRequestOptions } from 'element-plus';
import { enterpriseApi, type EnterpriseSettings } from '../api/console';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const hasTenant = computed(() => Boolean(auth.session?.currentTenant));
const loading = ref(false);
const saving = ref(false);
const logoUploading = ref(false);
const error = ref('');
const logoUrl = ref('');
const formRef = ref<FormInstance>();
const form = reactive({
  name: '',
  welcomeMessage: '',
});
const saved = reactive({
  name: '',
  welcomeMessage: '',
});

const rules: FormRules = {
  name: [{ required: true, message: '请填写企业名称', trigger: 'blur' }],
};

const dirty = computed(
  () => form.name !== saved.name || form.welcomeMessage !== saved.welcomeMessage,
);

function applySaved(data: EnterpriseSettings) {
  form.name = data.name;
  form.welcomeMessage = data.welcomeMessage;
  saved.name = form.name;
  saved.welcomeMessage = form.welcomeMessage;
  logoUrl.value = data.logoUrl ? `${data.logoUrl}?t=${Date.now()}` : '';
}

async function load() {
  if (!auth.session?.currentTenant) {
    applySaved({
      id: '',
      name: '',
      slug: '',
      logoUrl: null,
      welcomeMessage: '',
    });
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    applySaved(await enterpriseApi.get());
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    const data = await enterpriseApi.patch({
      name: form.name.trim(),
      welcomeMessage: form.welcomeMessage,
    });
    applySaved(data);
    ElMessage.success('已保存');
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onLogoUpload(options: UploadRequestOptions) {
  const body = new FormData();
  body.append('file', options.file);
  logoUploading.value = true;
  try {
    const data = await enterpriseApi.uploadLogo(body);
    logoUrl.value = data.logoUrl ? `${data.logoUrl}?t=${Date.now()}` : '';
    ElMessage.success('Logo 已更新');
    options.onSuccess(data);
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '上传失败');
  } finally {
    logoUploading.value = false;
  }
}

onBeforeRouteLeave(async (_to, _from, next) => {
  if (!dirty.value) {
    next();
    return;
  }
  try {
    await ElMessageBox.confirm('有未保存的修改，确定离开？', '未保存', {
      type: 'warning',
      confirmButtonText: '离开',
      cancelButtonText: '继续编辑',
    });
    next();
  } catch {
    next(false);
  }
});

onMounted(load);
watch(() => auth.session?.currentTenant?.id, load);
</script>

<style scoped>
.settings-page {
  background: #fff;
  min-height: calc(100vh - 120px);
  padding: 18px;
}

.settings-form {
  max-width: 640px;
}

.logo-row {
  align-items: center;
  display: flex;
  gap: 12px;
}

.logo-preview {
  background: var(--app-page-bg);
  border: 1px solid var(--app-border-color);
  border-radius: 50%;
  height: 40px;
  object-fit: contain;
  width: 40px;
}

.logo-placeholder {
  align-items: center;
  color: #98a2b3;
  display: inline-flex;
  font-size: 12px;
  justify-content: center;
}

.settings-actions {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}
</style>
