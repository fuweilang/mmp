import { afterEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import ElementPlus from 'element-plus';
import UploadDialog from '@upload-fixture';
let app: App | undefined; let root: HTMLElement | undefined;
afterEach(() => { app?.unmount(); root?.remove(); app = undefined; root = undefined; });
const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent?.trim() === text)!;
const limits = async () => ({ maxFileBytes: 100, allowedExtensions: ['.md'] });
async function mount(uploadFile: (file: File, progress: (ratio: number) => void) => Promise<string | void>, prepare?: () => void, simple = false) {
  const open = ref(true), complete = vi.fn(), close = vi.fn();
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => open.value ? h(UploadDialog, { simple, hint:'保存到：我的资料', accept:'.pdf,.png', loadLimits:limits, uploadFile, prepare, onComplete:complete, onClose:() => { open.value=false; close(); } }) : null });
  app.use(ElementPlus); app.mount(root); await nextTick(); await vi.waitFor(() => expect(document.querySelector('.el-dialog')).toBeTruthy());
  return { complete, close };
}
function select(files: File[]) { const input = document.querySelector<HTMLInputElement>('input[type=file]')!; Object.defineProperty(input,'files',{configurable:true,value:files}); input.dispatchEvent(new Event('change',{bubbles:true})); }
it('removes a queued file before upload', async () => {
  const upload = vi.fn(async () => {});
  await mount(upload);
  select([new File(['a'], 'a.md'), new File(['b'], 'b.md')]);
  await nextTick();
  document.querySelector<HTMLButtonElement>('button[aria-label="移出 · a.md"]')!.click();
  await nextTick();
  expect(document.body.textContent).not.toContain('a.md');
  expect(document.body.textContent).toContain('b.md');
  button('开始上传').click();
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  expect(upload.mock.calls[0]?.[0].name).toBe('b.md');
});
it('simple upload dialog keeps one limit line', async () => {
  await mount(async () => {}, undefined, true);
  await vi.waitFor(() => expect(document.querySelector('.library-upload-note')?.textContent).toBe('每批最多 50 个 · 单文件上限 100 B'));
  expect(document.body.textContent).not.toContain('支持类型');
  expect(document.body.textContent).not.toContain('保存到');
});
it('real Vue/Element Plus dialog handles drop, multiple files, progress, partial authorization failure and explicit retry', async () => {
  const calls: string[]=[]; let active=0, max=0, reject=true;
  const {complete}=await mount(async(file,progress)=>{ calls.push(file.name); active++; max=Math.max(max,active); progress(.25); await Promise.resolve(); active--; if(file.name==='b.md' && reject){reject=false;throw new Error('403 没有上传权限');} return '已保存'; });
  const event=new Event('drop',{bubbles:true,cancelable:true}); Object.defineProperty(event,'dataTransfer',{value:{files:[new File(['a'],'a.md'),new File(['b'],'b.md')],items:[]}});
  expect(document.querySelector('.library-upload-drop')!.dispatchEvent(event)).toBe(false);
  select([new File(['c'],'c.md')]); await nextTick(); expect(calls).toEqual([]);
  button('开始上传').click(); button('开始上传').click();
  await vi.waitFor(()=>expect(complete).toHaveBeenCalledWith(2)); expect(calls).toEqual(['a.md','b.md','c.md']); expect(max).toBe(1);
  expect(document.body.textContent).toContain('403 没有上传权限');
  button('重试失败项').click(); await vi.waitFor(()=>expect(complete).toHaveBeenCalledWith(1));
  expect(calls).toEqual(['a.md','b.md','c.md','b.md']);
  await vi.waitFor(() => expect(document.querySelector('.el-dialog')).toBeNull());
});
it('closes after every selected file is saved', async () => {
  const { close } = await mount(async () => '已保存');
  select([new File(['a'], 'a.md')]);
  await nextTick();
  button('开始上传').click();
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(document.querySelector('.el-dialog')).toBeNull();
});
it('in-flight close/Escape is not a pretend cancellation, invalid extension never reaches transport, no fake fetch percentage', async()=>{
  let release:()=>void=()=>{}; const upload=vi.fn(()=>new Promise<void>(resolve=>{release=resolve;}));
  const {complete,close}=await mount(upload);
  select([new File(['a'],'good.md'),new File(['b'],'bad.exe')]); await nextTick(); button('开始上传').click();
  await vi.waitFor(()=>expect(upload).toHaveBeenCalledTimes(1)); expect(button('关闭').disabled).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); expect(close).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain('%'); release(); await vi.waitFor(()=>expect(complete).toHaveBeenCalledWith(1));
  expect(upload).toHaveBeenCalledTimes(1); expect(document.body.textContent).toContain('类型不支持');
  button('关闭').click(); await nextTick(); expect(close).toHaveBeenCalledTimes(1);
});
it('failed preflight does not send files or silently change scope', async()=>{
  const upload=vi.fn(async()=>{}); await mount(upload,()=>{throw new Error('请确认成员授权范围');}); select([new File(['x'],'x.md')]); await nextTick(); button('开始上传').click();
  await vi.waitFor(()=>expect(document.body.textContent).toContain('请确认成员授权范围')); expect(upload).not.toHaveBeenCalled(); expect(button('开始上传').disabled).toBe(false);
});

it('unmount stops unsent queue entries without claiming to cancel the in-flight save', async()=>{
  let release:()=>void=()=>{}; const upload=vi.fn(()=>new Promise<void>(resolve=>{release=resolve;}));
  await mount(upload); select([new File(['a'],'first.md'),new File(['b'],'unsent.md')]); await nextTick();button('开始上传').click();
  await vi.waitFor(()=>expect(upload).toHaveBeenCalledTimes(1));app!.unmount();app=undefined;release();await new Promise(resolve=>setTimeout(resolve,10));expect(upload).toHaveBeenCalledTimes(1);
});
