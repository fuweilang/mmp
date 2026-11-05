import { ref } from 'vue';

/** 下载客户端弹窗：navbar 按钮与用户菜单共用同一个弹窗。 */
export const clientDownloadOpen = ref(false);

export function openClientDownload() {
  clientDownloadOpen.value = true;
}