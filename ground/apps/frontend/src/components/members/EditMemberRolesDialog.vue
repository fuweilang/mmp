<template>
  <el-dialog
    :model-value="modelValue"
    :title="`编辑成员 · ${memberName}`"
    width="420px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-form label-width="80px">
      <el-form-item label="姓名">
        <el-input :model-value="editName" maxlength="40" placeholder="成员姓名" @update:model-value="$emit('update:editName', String($event ?? ''))" />
      </el-form-item>
      <el-form-item label="角色">
        <el-select
          :model-value="editRoleIds"
          multiple
          style="width: 100%"
          placeholder="选择一个或多个角色"
          @update:model-value="$emit('update:editRoleIds', $event)"
        >
          <el-option
            v-for="role in assignableRoles"
            :key="role.id"
            :label="role.name"
            :value="role.id"
          />
        </el-select>
      </el-form-item>
      <p class="role-edit-hint">平台角色不在此列；权限按角色取并集；企业至少保留一名管理员。</p>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="$emit('submit')">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { AssignableRole } from '@/api/console';

defineProps<{
  modelValue: boolean;
  memberName: string;
  editName: string;
  editRoleIds: string[];
  assignableRoles: AssignableRole[];
  saving: boolean;
}>();

defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'update:editName', v: string): void;
  (e: 'update:editRoleIds', v: string[]): void;
  (e: 'submit'): void;
}>();
</script>

<style scoped>
.role-edit-hint {
  margin: 0;
  color: #8b909b;
  font-size: 12px;
  line-height: 1.5;
}
</style>
