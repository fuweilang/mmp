import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createApp, h, nextTick, type App } from 'vue';
import { ElButton, ElDialog, ElDrawer, ElInput, ElInputNumber, ElSelect, ElDatePicker, ElMessageBox } from 'element-plus';

let app: App | undefined;
afterEach(async () => {
  ElMessageBox.close();
  app?.unmount();
  app = undefined;
  await nextTick();
  document.querySelectorAll('.el-overlay, #dialog-theme-styles, #dialog-theme-host').forEach(node => node.remove());
});
function styles() {
  const require = createRequire(import.meta.url);
  const sheet = document.createElement('style');
  sheet.id = 'dialog-theme-styles';
  sheet.textContent = readFileSync(require.resolve('element-plus/dist/index.css'), 'utf8')
    + // jsdom does not fully resolve specificity; Chromium checks lazy CSS separately.
      ['layout', 'deleteConfirm', 'libraryDialogs', 'skillEditor', 'expertWorkspace', 'catalogAvatar', 'dialogTheme', 'modalInputs']
      .map(name => readFileSync(`src/styles/${name}.css`, 'utf8')).join('\n');
  document.head.append(sheet);
}
function appearance(element: Element) {
  const style = getComputedStyle(element);
  return { padding: style.padding, radius: style.borderRadius };
}
async function dialog(className: string, width = '760px') {
  const host = document.createElement('div');
  host.id = 'dialog-theme-host';
  document.body.append(host);
  app = createApp({ render: () => h(ElDialog, { modelValue: true, title: '编辑', width, class: className, appendToBody: true }, {
    default: () => h(ElInput, { modelValue: '原名称' }),
    footer: () => [h(ElButton, {}, () => '取消'), h(ElButton, { type: 'primary' }, () => '保存')],
  }) });
  app.mount(host);
  return vi.waitFor(() => {
    const element = document.querySelector<HTMLElement>('.el-dialog');
    expect(element).not.toBeNull();
    return element!;
  });
}

it('styles rename prompts like deletion and preserves their input and cancel behavior', async () => {
  styles();
  const pending = ElMessageBox.prompt('文件夹名称', '重命名', { inputValue: '测试知识库10', confirmButtonText: '确定', cancelButtonText: '取消' }).catch(reason => reason);
  const element = await vi.waitFor(() => {
    const box = document.querySelector<HTMLElement>('.el-message-box');
    expect(box).not.toBeNull();
    return box!;
  });
  expect(getComputedStyle(element).width).toBe('440px');
  expect(appearance(element)).toEqual({ padding: '24px', radius: '12px' });
  expect(element.querySelector('input')?.value).toBe('测试知识库10');
  expect(getComputedStyle(element.querySelector('.el-input__wrapper')!).borderRadius).toBe('8px');
  const cancel = [...element.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '取消')!;
  expect(getComputedStyle(cancel).borderRadius).toBe('8px');
  cancel.click();
  expect(await pending).toBe('cancel');
});

it.each(['', 'library-modal', 'official-skill-dialog', 'expert-metadata-dialog', 'catalog-avatar-generation'])('unifies %s chrome alongside feature CSS', async className => {
  styles();
  const element = await dialog(className);
  expect(appearance(element)).toEqual({ padding: '24px', radius: '12px' });
  expect(getComputedStyle(element.querySelector('.el-dialog__title')!).fontSize).toBe('16px');
  expect(getComputedStyle(element.querySelector('.el-dialog__body')!).padding).toBe('0px');
  expect(getComputedStyle(element.querySelector('.el-dialog__footer')!).padding).toBe('24px 0px 0px');
  expect(getComputedStyle(element.querySelector('.el-dialog__footer .el-button')!).borderRadius).toBe('8px');
  expect(element.style.getPropertyValue('--el-dialog-width')).toBe('760px');
});

it('preserves the full-screen expert editor layout', async () => {
  styles();
  const element = await dialog('official-agent-editor expert-workspace');
  expect(getComputedStyle(element).borderRadius).toBe('0px');
  expect(getComputedStyle(element).padding).toBe('0px');
  expect(getComputedStyle(element).height).toBe('100dvh');
});

// These controls share scrollable overlays, including prefix/suffix and range
// fields. The entire wrapper must retain one rounded, unclipped focus boundary.
it.each(['dialog', 'drawer'])('keeps all %s input boundaries rounded and focused inside the scroll area', async kind => {
  styles();
  const host = document.createElement('div');
  host.id = 'dialog-theme-host';
  document.body.append(host);
  app = createApp({ render: () => h(kind === 'drawer' ? ElDrawer : ElDialog, { modelValue: true, title: '输入样式', appendToBody: true }, {
    default: () => [
      h(ElInput, { modelValue: '名称', clearable: true }, { prefix: () => '前缀', suffix: () => '后缀' }),
      h(ElInput, { modelValue: '说明', type: 'textarea' }),
      h(ElInput, { modelValue: '保留禁用状态', disabled: true }),
      h(ElInputNumber, { modelValue: 1 }),
      h(ElSelect, { modelValue: '', options: [] }),
      h(ElDatePicker, { modelValue: null, type: 'daterange' }),
    ],
  }) });
  app.mount(host);
  const overlay = await vi.waitFor(() => {
    const el = document.querySelector('.el-overlay');
    expect(el?.querySelector('.el-select__wrapper')).not.toBeNull();
    return el!;
  });
  const boundaries = overlay.querySelectorAll('.el-input__wrapper, .el-textarea__inner, .el-select__wrapper, .el-range-editor');
  expect(boundaries.length).toBeGreaterThanOrEqual(6);
  for (const boundary of boundaries) expect(getComputedStyle(boundary).borderRadius).toBe('8px');
  const input = overlay.querySelector<HTMLInputElement>('.el-input:not(.is-disabled) input')!;
  input.focus();
  await nextTick();
  expect(document.activeElement).toBe(input);
  expect(getComputedStyle(input.closest('.el-input__wrapper')!).boxShadow).toContain('inset');
  expect(overlay.querySelector<HTMLInputElement>('input:disabled')?.disabled).toBe(true);
});
