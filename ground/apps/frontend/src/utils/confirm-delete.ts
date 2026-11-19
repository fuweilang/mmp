import { h, type VNode } from 'vue';
import { ElMessageBox } from 'element-plus';
import DeleteConfirmContent from '../components/DeleteConfirmContent.vue';

export interface DeleteConfirmOptions {
  title: string;
  name: string | string[];
  description: string | string[] | VNode;
  confirmText?: string;
  customClass?: string;
  closeOnClickModal?: boolean;
}

/** Only presentation is shared; callers retain their permission checks and delete requests. */
export function confirmDelete(options: DeleteConfirmOptions) {
  const description = typeof options.description === 'string' || Array.isArray(options.description)
    ? options.description : undefined;
  return ElMessageBox.confirm(
    h(DeleteConfirmContent, { name: options.name, description }, description === undefined ? { default: () => options.description } : undefined),
    options.title,
    {
      customClass: ['delete-confirm', options.customClass].filter(Boolean).join(' '),
      confirmButtonText: options.confirmText || '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
      cancelButtonClass: 'delete-confirm__cancel',
      confirmButtonType: 'danger',
      closeOnClickModal: options.closeOnClickModal ?? true,
      autofocus: false,
    },
  );
}
