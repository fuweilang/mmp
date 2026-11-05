<template>
  <el-dialog
    v-model="open"
    title="个人账号"
    width="420px"
    align-center
    destroy-on-close
    @close="reset"
  >
    <el-form label-width="80px">
      <el-form-item label="姓名">
        <el-input v-model="name" maxlength="40" />
      </el-form-item>
      <el-form-item label="手机号">
        <span class="readonly">{{ session?.user.phone || '—' }}</span>
      </el-form-item>
      <el-form-item label="当前企业">
        <span class="readonly">{{ session?.currentTenant?.name || '—' }}</span>
      </el-form-item>
      <el-form-item label="我的角色">
        <div class="role-tags">
          <el-tag
            v-for="roleName in myRoles"
            :key="roleName"
            size="small"
            class="identity-tag"
          >
            {{ roleName }}
          </el-tag>
          <span v-if="!myRoles.length" class="readonly">—</span>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">关闭</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/auth';

const open = ref(false);
const saving = ref(false);
const name = ref('');
const auth = useAuthStore();
const session = computed(() => auth.session);

const myRoles = computed(() => session.value?.user.roleNames ?? []);

function reset() {
  name.value = session.value?.user.name ?? '';
}

function show() {
  reset();
  open.value = true;
}

async function onSave() {
  const trimmed = name.value.trim();
  if (!trimmed) {
    ElMessage.warning('请输入姓名');
    return;
  }
  saving.value = true;
  try {
    await authApi.updateMe(trimmed);
    await auth.load();
    ElMessage.success('已保存');
    open.value = false;
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

defineExpose({ show });
</script>

<style scoped>
.readonly {
  color: #667085;
  font-size: 13px;
  line-height: 32px;
}

.role-tags {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
