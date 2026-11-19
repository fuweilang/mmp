import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { h, nextTick } from 'vue';
import { ElMessageBox } from 'element-plus';
import { confirmDelete } from '../src/utils/confirm-delete';

afterEach(async () => {
  ElMessageBox.close();
  await nextTick();
  document.querySelectorAll('.el-overlay').forEach(node => node.remove());
  document.querySelector('#delete-confirm-test-styles')?.remove();
});

async function box() {
  return vi.waitFor(() => {
    const element = document.querySelector<HTMLElement>('.el-message-box.delete-confirm');
    expect(element).not.toBeNull();
    return element!;
  });
}
function button(element: HTMLElement, text: string) {
  return [...element.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === text)!;
}

it('shows a separate, safely escaped object name with an explicit destructive action', async () => {
  const name = '<img src=x onerror="alert(1)">很长的文件名.pdf';
  const pending = confirmDelete({ title: '删除文件？', name, description: ['文件会被删除。', '此操作不可恢复。'], confirmText: '删除文件' }).catch(reason => reason);
  const element = await box();
  expect(element.querySelector('.delete-confirm__objects')?.textContent).toBe(name);
  expect(element.querySelector('img')).toBeNull();
  expect(element.querySelector('.el-message-box__title')?.textContent).toBe('删除文件？');
  expect(element.querySelectorAll('.delete-confirm__description p')).toHaveLength(2);
  expect(button(element, '删除文件').classList.contains('el-button--danger')).toBe(true);
  expect(element.querySelector('.el-message-box__status')).toBeNull();
  button(element, '取消').click();
  expect(await pending).toBe('cancel');
});

it('returns confirmation only from the explicit delete button', async () => {
  const pending = confirmDelete({ title: '删除角色？', name: '测试角色', description: '删除后不可恢复。', confirmText: '删除角色' });
  const element = await box();
  button(element, '删除角色').click();
  expect(await pending).toBe('confirm');
});

it('closing the dialog rejects and never resolves as deletion', async () => {
  const pending = confirmDelete({ title: '删除文件？', name: '资料.md', description: '删除后不可恢复。' }).catch(reason => reason);
  const element = await box();
  element.querySelector<HTMLButtonElement>('.el-message-box__headerbtn')!.click();
  expect(await pending).toBe('cancel');
});

it('supports batches and detailed impact content without moving names into the title', async () => {
  const pending = confirmDelete({ title: '删除企业？', name: ['企业一', '企业二'], description: h('p', '将删除 2 个独立账号，另有 3 个成员解除企业关系。') }).catch(reason => reason);
  const element = await box();
  expect(element.querySelectorAll('.delete-confirm__object')).toHaveLength(2);
  expect(element.querySelector('.delete-confirm__description')?.textContent).toContain('3 个成员');
  await vi.waitFor(() => expect(document.activeElement).toBe(button(element, '取消')));
  button(element, '取消').click();
  await pending;
});

it('keeps regular confirmations outside the delete styling', async () => {
  const pending = ElMessageBox.confirm('发布所有已保存配置。', '发布专家').catch(reason => reason);
  await vi.waitFor(() => expect(document.querySelector('.el-message-box')).not.toBeNull());
  expect(document.querySelector('.delete-confirm')).toBeNull();
  button(document.querySelector('.el-message-box')!, 'Cancel').click();
  await pending;
});

it('overrides square global buttons only inside destructive dialogs', async () => {
  const require = createRequire(import.meta.url);
  const sheet = document.createElement('style');
  sheet.id = 'delete-confirm-test-styles';
  sheet.textContent = readFileSync(require.resolve('element-plus/dist/index.css'), 'utf8')
    + readFileSync('src/styles/layout.css', 'utf8') + readFileSync('src/styles/deleteConfirm.css', 'utf8');
  document.head.append(sheet);
  const pending = confirmDelete({ title: '删除文件？', name: '资料.md', description: '删除后不可恢复。', confirmText: '删除文件' }).catch(reason => reason);
  const element = await box();
  expect(getComputedStyle(element).width).toBe('440px');
  expect(getComputedStyle(element).padding).toBe('24px');
  expect(getComputedStyle(element).borderRadius).toBe('12px');
  expect(getComputedStyle(button(element, '删除文件')).borderRadius).toBe('8px');
  button(element, '取消').click();await pending;
  await vi.waitFor(() => expect(document.querySelector('.delete-confirm')).toBeNull());
  const regular = ElMessageBox.confirm('发布所有已保存配置。', '发布专家').catch(reason => reason);
  await vi.waitFor(() => expect(document.querySelector('.el-message-box')).not.toBeNull());
  const regularBox = document.querySelector<HTMLElement>('.el-message-box')!;
  expect(getComputedStyle(regularBox.querySelector('.el-button--primary')!).borderRadius).toBe('0px');
  button(regularBox, 'Cancel').click();await regular;
});

it.each([true, false])('preserves mask cancellation when closeOnClickModal is %s', async (allowed) => {
  let outcome = 'pending';
  const options = { title: '删除文件？', name: '资料.md', description: '删除后不可恢复。', ...(allowed ? {} : { closeOnClickModal: false }) };
  const pending = confirmDelete(options).then(result => { outcome = result; }, reason => { outcome = reason; });
  const element = await box();
  const mask = element.closest('[role="dialog"]')!;
  for (const type of ['mousedown', 'mouseup', 'click']) mask.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  if (allowed) {
    await vi.waitFor(() => expect(outcome).toBe('cancel'));
  } else {
    await nextTick();expect(outcome).toBe('pending');
    button(element, '取消').click();
  }
  await pending;
});
