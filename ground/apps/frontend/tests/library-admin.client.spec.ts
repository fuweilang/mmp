import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import AdminLibrary from '@admin-library-fixture';
const fixture=vi.hoisted(()=>({tenants:vi.fn(),options:vi.fn(),items:vi.fn(),detail:vi.fn(),preview:vi.fn(),folder:vi.fn(),command:vi.fn(),upload:vi.fn(),impact:vi.fn(),scopeImpact:vi.fn()}));
vi.mock('../src/api/libraryAdmin',async original=>({...await original<typeof import('../src/api/libraryAdmin')>(),adminLibraryTenants:fixture.tenants,adminLibraryOptions:fixture.options,adminLibraryItems:fixture.items,adminLibraryDetail:fixture.detail,adminLibraryPreview:fixture.preview,adminLibraryFolder:fixture.folder,adminLibraryCommand:fixture.command,adminLibraryUpload:fixture.upload,adminLibraryImpact:fixture.impact,adminLibraryScopeImpact:fixture.scopeImpact}));
const require=createRequire(import.meta.url);
const css=['el-overlay.css','el-dialog.css','el-select.css','el-message-box.css'].map(f=>readFileSync(require.resolve('element-plus/theme-chalk/'+f),'utf8')).join('\n')+'\n'+readFileSync('src/styles/libraryDialogs.css','utf8');
let app:App|undefined,root:HTMLElement|undefined,sheet:HTMLStyleElement,router:Router;
const item=(id='file-a',canWrite=true)=>({id,name:'资料.md',kind:'FILE',scope:'PRIVATE',state:'ACTIVE',parentId:null,parentPath:[],ownerUserId:'owner-a',ownerName:'所有者A',updatedAt:'2026-11-08T08:00:00Z',fileType:'text',currentVersion:{id:'v1',versionNo:1,mimeType:'text/markdown',sizeBytes:4,parseStatus:'READY'},canRead:true,canWrite,purgeBlockedReason:'活动使用未核实'});
const options=(tenant='a')=>({tenant:{id:tenant,name:'企业'+tenant.toUpperCase(),status:'active'},members:[{id:'owner-'+tenant,name:'成员'+tenant.toUpperCase(),fileCount:1}],owners:[{id:'owner-'+tenant,name:'所有者'+tenant.toUpperCase()}],folders:[],limits:{maxFileBytes:1000,allowedExtensions:['.md']}});
beforeEach(()=>{vi.resetAllMocks();fixture.tenants.mockResolvedValue({items:[{id:'a',name:'企业A',status:'active',activeFiles:1,memberCount:1,sharedFiles:0,folderCount:0,linkCount:0,usedBytes:4,failed:0,recycledCount:0}],total:1});fixture.options.mockImplementation(async(id:string)=>options(id));fixture.items.mockResolvedValue({items:[item()],total:41});fixture.detail.mockResolvedValue({versions:[],versionCount:0,versionsTruncated:false,audit:[]});fixture.preview.mockResolvedValue({name:'资料.md',previewKind:'text',text:'直接管理fixture内容',versionId:'v1'});fixture.impact.mockResolvedValue({versionCount:1,bytes:4,children:0,referenceStatus:'UNVERIFIED',activeUseStatus:'UNVERIFIED',canPurge:false,blockedReason:'活动使用未核实'});fixture.command.mockResolvedValue({nodeId:'file-a'});fixture.folder.mockResolvedValue({nodeId:'folder-a'});fixture.upload.mockResolvedValue({nodeId:'upload-a'});sheet=document.createElement('style');sheet.textContent=css;document.head.append(sheet);vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('DOM fixture forbids live requests'));});
afterEach(async()=>{ElMessageBox.close();ElMessage.closeAll();app?.unmount();root?.remove();sheet.remove();app=undefined;root=undefined;document.querySelectorAll('.el-overlay,.el-popper,.el-message').forEach(n=>n.remove());await nextTick();});
async function mount(path='/admin/library/a?catalog=all'){root=document.createElement('div');root.style.transform='translateX(90px)';document.body.append(root);router=createRouter({history:createMemoryHistory(),routes:[{path:'/admin/library',component:AdminLibrary},{path:'/admin/library/:tenantId',component:AdminLibrary}]});await router.push(path);app=createApp({render:()=>h(RouterView)}).use(ElementPlus).use(router);app.mount(root);await nextTick();await vi.waitFor(()=>expect(root!.textContent).toContain((path.includes('tenantId')||path.includes('/admin/library/a'))?'企业A · 资料库':'企业资料库'));await nextTick();expect(root!.textContent).not.toContain('代管授权');}
const buttons=(text:string,scope:ParentNode=document)=>Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).filter(n=>n.textContent?.trim()===text);
function click(text:string,scope:ParentNode=document){const n=buttons(text,scope).at(-1);expect(n).toBeTruthy();n!.click();}
function input(el:HTMLInputElement|HTMLTextAreaElement,value:string){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
async function dialog(title:string){await vi.waitFor(()=>expect(Array.from(document.querySelectorAll<HTMLElement>('.el-dialog')).some(d=>d.querySelector('.el-dialog__title')?.textContent===title)).toBe(true));return Array.from(document.querySelectorAll<HTMLElement>('.el-dialog')).find(d=>d.querySelector('.el-dialog__title')?.textContent===title)!;}
async function choose(scope:ParentNode,label:string,option:string){const field=Array.from(scope.querySelectorAll('.el-form-item')).find(n=>n.querySelector('label')?.textContent?.includes(label))!;expect(field).toBeTruthy();(field.querySelector('.el-select__wrapper')as HTMLElement).click();await nextTick();await vi.waitFor(()=>expect(Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(n=>n.textContent?.includes(option))).toBe(true));const row=Array.from(document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')).filter(n=>n.textContent?.includes(option)).at(-1)!;row.click();await nextTick();}
async function menu(text:string){const trigger=document.querySelector<HTMLButtonElement>('button[aria-label="管理 资料.md"]')!;expect(trigger).toBeTruthy();trigger.click();await nextTick();await vi.waitFor(()=>expect(Array.from(document.querySelectorAll('[role=menuitem]')).some(n=>n.textContent?.trim()===text)).toBe(true));const row=Array.from(document.querySelectorAll<HTMLElement>('[role=menuitem]')).find(n=>n.textContent?.trim()===text)!;row.click();await nextTick();return row;}
function files(...names:string[]){const el=document.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(el,'files',{configurable:true,value:names.map(name=>new File(['fixture'],name))});el.dispatchEvent(new Event('change',{bubbles:true}));}
async function uploadTarget(d:HTMLElement){await choose(d,'资料所有者','所有者A');await nextTick();}
it('real enterprise route, server search/page without auth identity switch',async()=>{await mount('/admin/library');await vi.waitFor(()=>expect(buttons('管理资料')).toHaveLength(1));expect(root!.querySelector('.el-table')?.classList.contains('el-table--border')).toBe(true);const tenantQuery=root!.querySelector<HTMLInputElement>('input[aria-label="搜索企业"]')!;input(tenantQuery,'小米');expect(buttons('搜索')[0]?.classList.contains('el-button--primary')).toBe(true);click('搜索');await vi.waitFor(()=>expect(fixture.tenants.mock.calls.at(-1)?.[0]).toMatchObject({q:'小米',page:1}));click('重置');await vi.waitFor(()=>expect(fixture.tenants.mock.calls.at(-1)?.[0]).toMatchObject({q:'',page:1}));click('管理资料');await vi.waitFor(()=>expect(root!.textContent).toContain('成员A'));expect(fixture.items).not.toHaveBeenCalled();click('全部目录');await vi.waitFor(()=>expect(fixture.items).toHaveBeenCalled());expect(router.currentRoute.value.params.tenantId).toBe('a');expect(router.currentRoute.value.query.catalog).toBe('all');expect(root!.querySelector('[aria-label="文件夹"]')).toBeTruthy();const q=root!.querySelector<HTMLInputElement>('input[aria-label="搜索全部层级资料"]')!;input(q,'嵌套资料');q.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({q:'嵌套资料',page:1,pageSize:20}));root!.querySelector<HTMLButtonElement>('.el-pagination .btn-next')!.click();await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1].page).toBe(2));click('重置');await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({q:'',state:'ACTIVE',page:1}));});
it('real Vue row proxy, explicit body preview and native body-teleported margin-auto modal',async()=>{await mount();await vi.waitFor(()=>expect(buttons('资料.md')).toHaveLength(1));click('资料.md');const d=await dialog('资料.md');expect(fixture.preview).not.toHaveBeenCalled();expect(d.closest('.el-overlay')?.parentElement).toBe(document.body);expect(getComputedStyle(d).margin).toBe('auto');expect(getComputedStyle(d.querySelector('.el-dialog__body')!).overflowY).toBe('auto');click('预览正文',d);await vi.waitFor(()=>expect(document.body.textContent).toContain('直接管理fixture内容'));expect(fixture.preview.mock.calls[0]?.[0]).toBe('a');});
it('unauthorized mutation disabled; cancel/409 preserve edit state without fake success',async()=>{fixture.items.mockResolvedValueOnce({items:[item('file-a',false)],total:1});await mount();const disabled=await menu('重命名');expect(disabled.getAttribute('aria-disabled')).toBe('true');expect(fixture.command).not.toHaveBeenCalled();fixture.items.mockResolvedValue({items:[item()],total:1});click('刷新');await vi.waitFor(()=>expect(fixture.items).toHaveBeenCalledTimes(2));await menu('重命名');let d=await dialog('重命名');click('取消',d);expect(fixture.command).not.toHaveBeenCalled();await menu('重命名');d=await dialog('重命名');input(d.querySelector<HTMLInputElement>('input[aria-label="新名称"]')!,'新名字.md');fixture.command.mockRejectedValueOnce(new Error('409 资料已更新'));click('确认',d);await vi.waitFor(()=>expect(d.textContent).toContain('409 资料已更新'));expect(d.querySelector<HTMLInputElement>('input[aria-label="新名称"]')!.value).toBe('新名字.md');expect(fixture.command.mock.calls[0]?.[1]).toMatchObject({nodeId:'file-a',expectedUpdatedAt:'2026-11-08T08:00:00Z',expectedVersionId:'v1'});});
it('admin upload locks explicit owner/grant; partial failure retries only failed file with same idempotency key',async()=>{await mount();click('上传资料');const d=await dialog('上传企业资料');files('a.md','b.md');await nextTick();click('开始上传',d);await vi.waitFor(()=>expect(d.textContent).toContain('请选择本企业的有效成员作为所有者'));expect(fixture.upload).not.toHaveBeenCalled();await uploadTarget(d);let failed=false;fixture.upload.mockImplementation(async(_tenant:string,_body:unknown,file:File)=>{if(file.name==='b.md'&&!failed){failed=true;throw new Error('403 授权拒绝fixture');}return {nodeId:file.name};});click('开始上传',d);await vi.waitFor(()=>expect(fixture.upload).toHaveBeenCalledTimes(2));await vi.waitFor(()=>expect(d.textContent).toContain('403 授权拒绝fixture'));expect(fixture.upload.mock.calls[0]?.slice(0,2)).toEqual(['a',expect.objectContaining({ownerUserId:'owner-a',scope:'PRIVATE'})]);expect(fixture.upload.mock.calls[0]?.[1]).not.toHaveProperty('grantId');click('重试失败项',d);await vi.waitFor(()=>expect(fixture.upload).toHaveBeenCalledTimes(3));expect(fixture.upload.mock.calls.map(c=>c[2].name)).toEqual(['a.md','b.md','b.md']);expect(fixture.upload.mock.calls[1]?.[1].requestId).toBe(fixture.upload.mock.calls[2]?.[1].requestId);});
it('tenant change unmounts unsent queue; in-flight request remains frozen, no next file',async()=>{await mount();click('上传资料');const d=await dialog('上传企业资料');await uploadTarget(d);let release:()=>void=()=>{};fixture.upload.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));files('first.md','queued.md');await nextTick();click('开始上传',d);await vi.waitFor(()=>expect(fixture.upload).toHaveBeenCalledTimes(1));fixture.items.mockResolvedValue({items:[],total:0});await router.replace('/admin/library?tenantId=b');await nextTick();release();await new Promise(r=>setTimeout(r,20));expect(fixture.upload).toHaveBeenCalledTimes(1);expect(fixture.upload.mock.calls[0]?.[0]).toBe('a');await vi.waitFor(()=>expect(root!.textContent).toContain('企业B · 资料库'));expect(root!.textContent).not.toContain('资料.md');});
it('file purge disabled, unknown references not false zero, cancel does not delete',async()=>{fixture.items.mockResolvedValue({items:[{...item(),state:'RECYCLED'}],total:1});await mount();const purge=await menu('彻底删除');expect(purge.getAttribute('aria-disabled')).toBe('true');await menu('查看删除影响');const d=await dialog('删除影响');await vi.waitFor(()=>expect(d.textContent).toContain('活动使用未核实'));expect(d.textContent).toContain('不能当作零引用');click('关闭',d);expect(fixture.command).not.toHaveBeenCalled();});
it('recycle confirms into the existing bin and keeps the current owner filter',async()=>{
  await mount('/admin/library/a?member=owner-a');
  await vi.waitFor(()=>expect(fixture.items).toHaveBeenCalled());
  await menu('回收');
  const d=await dialog('回收');
  click('确认',d);
  await vi.waitFor(()=>expect(fixture.command.mock.calls.at(-1)?.[1]).toMatchObject({action:'recycle',nodeId:'file-a'}));
  const notice=await vi.waitFor(()=>{
    const node=[...document.querySelectorAll('.el-message')].find(item=>item.textContent?.includes('已放入回收站'));
    expect(node).toBeTruthy();
    return node!;
  });
  fixture.items.mockClear();
  notice.querySelector('button')!.click();
  await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({state:'RECYCLED',ownerUserId:'owner-a'}));
  expect(root!.textContent).toContain('所有者A');
});

it('cancelled impact request cannot later pollute a reopened rename dialog for the same node',async()=>{await mount();let reject:(error:Error)=>void=()=>{};fixture.impact.mockImplementationOnce(()=>new Promise((_resolve,r)=>{reject=r;}));await menu('回收');let d=await dialog('回收');click('取消',d);await menu('重命名');d=await dialog('重命名');reject(new Error('stale impact failure fixture'));await new Promise(r=>setTimeout(r,10));expect(d.textContent).not.toContain('stale impact failure fixture');expect(fixture.command).not.toHaveBeenCalled();});

it('admin visibility dialog includes all descendants and submits the confirmed revision', async () => {
 fixture.items.mockResolvedValue({items:[{...item(),kind:'FOLDER',currentVersion:null}],total:1});
 fixture.scopeImpact.mockResolvedValue({total:4,changed:4,treeRevision:'c'.repeat(64)});
 await mount();await menu('改为企业共享');const d=await dialog('修改可见性');
 await vi.waitFor(()=>expect(d.textContent).toContain('4 项'));
 click('确认',d);
 await vi.waitFor(()=>expect(fixture.command).toHaveBeenCalledTimes(1));
 expect(fixture.command.mock.calls[0]?.[1]).toMatchObject({scope:'ENTERPRISE',confirmShare:true,confirmUnshare:false,expectedTreeRevision:'c'.repeat(64)});
 expect(fixture.command.mock.calls[0]?.[1]).not.toHaveProperty('grantId');
});

it('enterprise detail opens a member folder tree and keeps it after refresh',async()=>{
 await mount('/admin/library/a');
 await vi.waitFor(()=>expect(root!.textContent).toContain('成员A'));
 expect(root!.querySelector('input[aria-label="搜索全部层级资料"]')).toBeNull();
 click('查看资料',root!);
 await vi.waitFor(()=>expect(router.currentRoute.value.query.member).toBe('owner-a'));
 expect(root!.querySelector('[aria-label="文件夹"]')).toBeTruthy();
 await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({ownerUserId:'owner-a',layer:'children'}));
 click('更多筛选');await nextTick();expect(root!.querySelector('[aria-label="所有者筛选"]')).toBeNull();
 app?.unmount();root?.remove();
 await mount('/admin/library/a?member=owner-a&folder=folder-1');
 await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({ownerUserId:'owner-a',layer:'children',folderId:'folder-1'}));
 expect(root!.textContent).toContain('正在查看 成员A 的资料');
 click('返回成员');
 await vi.waitFor(()=>expect(router.currentRoute.value.query.member).toBeUndefined());
 expect(root!.textContent).toContain('全部目录');
});
it('preview matches console: centered image, pdf bytes in an iframe, word text without extra captions',async()=>{
 if(!URL.createObjectURL)Object.defineProperty(URL,'createObjectURL',{configurable:true,writable:true,value:()=>''});
 if(!URL.revokeObjectURL)Object.defineProperty(URL,'revokeObjectURL',{configurable:true,writable:true,value:()=>{}});
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:pdf-preview');
 vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 fixture.preview.mockResolvedValueOnce({name:'图.png',previewKind:'image',text:null,versionId:'v-img',mimeType:'image/png',originalName:'图.png',parseStatus:'READY',parseReason:'不应出现的图片说明'});
 await mount();
 click('预览');
 await vi.waitFor(()=>expect(document.querySelector('img.library-media')).toBeTruthy());
 const img=document.querySelector<HTMLImageElement>('img.library-media')!;
 expect(img.getAttribute('src')).toContain('inline=1');
 expect(img.classList.contains('library-media')).toBe(true);
 expect(document.body.textContent).not.toContain('图片/视频仅保存');
 expect(document.body.textContent).not.toContain('不应出现的图片说明');
 click('关闭');
 fixture.preview.mockResolvedValueOnce({name:'说明.docx',previewKind:'text',text:'文档正文',versionId:'v-doc',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',originalName:'说明.docx',parseStatus:'READY',parseReason:null});
 click('预览');
 await vi.waitFor(()=>expect(document.querySelector('.library-pre')?.textContent).toContain('文档正文'));
 expect(document.querySelector('iframe.library-pdf')).toBeNull();
 click('关闭');
 fixture.preview.mockResolvedValueOnce({name:'报告.pdf',previewKind:'download_only',text:'不应把提取文字当成页面',versionId:'v-pdf',mimeType:'application/pdf',originalName:'报告.pdf',parseStatus:'READY',parseReason:null});
 vi.mocked(fetch).mockResolvedValue(new Response(new TextEncoder().encode('%PDF-1.4 fixture'),{status:200}));
 click('预览');
 await vi.waitFor(()=>expect(document.querySelector('iframe.library-pdf')?.getAttribute('src')).toBe('blob:pdf-preview'));
 expect(document.body.textContent).not.toContain('不应把提取文字当成页面');
 expect(buttons('下载').at(-1)?.classList.contains('el-button--primary')).toBe(true);
 expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain('/download?');
});
it('enterprise overview enters an independently addressable detail route',async()=>{
 await mount('/admin/library');click('管理资料',root!);
 await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe('/admin/library/a'));
 await vi.waitFor(()=>expect(root!.textContent).toContain('企业A · 资料库'));
 click('返回企业列表',root!);await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe('/admin/library'));
});
