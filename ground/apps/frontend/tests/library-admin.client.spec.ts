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
beforeEach(()=>{vi.resetAllMocks();fixture.tenants.mockResolvedValue({items:[{id:'a',name:'企业A',status:'active',activeFiles:1,memberCount:1,sharedFiles:0,folderCount:0,linkCount:0,usedBytes:4,failed:0,recycledCount:0,admins:[{name:'管理员甲',phone:'13800000001'},{name:'管理员乙',phone:'13800000002'}]}],total:1});fixture.options.mockImplementation(async(id:string)=>options(id));fixture.items.mockResolvedValue({items:[item()],total:41});fixture.detail.mockResolvedValue({versions:[],versionCount:0,versionsTruncated:false,audit:[]});fixture.preview.mockResolvedValue({name:'资料.md',previewKind:'text',text:'直接管理fixture内容',versionId:'v1'});fixture.impact.mockResolvedValue({versionCount:1,bytes:4,children:0,referenceStatus:'UNVERIFIED',activeUseStatus:'UNVERIFIED',canPurge:false,blockedReason:'活动使用未核实'});fixture.command.mockResolvedValue({nodeId:'file-a'});fixture.folder.mockResolvedValue({nodeId:'folder-a'});fixture.upload.mockResolvedValue({nodeId:'upload-a'});sheet=document.createElement('style');sheet.textContent=css;document.head.append(sheet);vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('DOM fixture forbids live requests'));});
afterEach(async()=>{ElMessageBox.close();ElMessage.closeAll();app?.unmount();root?.remove();sheet.remove();app=undefined;root=undefined;document.querySelectorAll('.el-overlay,.el-popper,.el-message').forEach(n=>n.remove());await nextTick();});
async function mount(path='/admin/library/a?catalog=all'){root=document.createElement('div');root.style.transform='translateX(90px)';document.body.append(root);router=createRouter({history:createMemoryHistory(),routes:[{path:'/admin/library',component:AdminLibrary},{path:'/admin/library/:tenantId',component:AdminLibrary}]});await router.push(path);app=createApp({render:()=>h(RouterView)}).use(ElementPlus).use(router);app.mount(root);await nextTick();await vi.waitFor(()=>expect(root!.textContent).toContain(path.includes('/admin/library/a')?'全部成员':'企业资料库'));await nextTick();expect(root!.textContent).not.toContain('代管授权');}
const buttons=(text:string,scope:ParentNode=document)=>Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).filter(n=>n.textContent?.trim()===text);
function click(text:string,scope:ParentNode=document){const n=buttons(text,scope).at(-1);expect(n).toBeTruthy();n!.click();}
function input(el:HTMLInputElement|HTMLTextAreaElement,value:string){el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
async function dialog(title:string){await vi.waitFor(()=>expect(Array.from(document.querySelectorAll<HTMLElement>('.el-dialog')).some(d=>d.querySelector('.el-dialog__title')?.textContent===title)).toBe(true));return Array.from(document.querySelectorAll<HTMLElement>('.el-dialog')).find(d=>d.querySelector('.el-dialog__title')?.textContent===title)!;}
async function choose(scope:ParentNode,label:string,option:string){const field=Array.from(scope.querySelectorAll('.el-form-item')).find(n=>n.querySelector('label')?.textContent?.includes(label))!;expect(field).toBeTruthy();(field.querySelector('.el-select__wrapper')as HTMLElement).click();await nextTick();await vi.waitFor(()=>expect(Array.from(document.querySelectorAll('.el-select-dropdown__item')).some(n=>n.textContent?.includes(option))).toBe(true));const row=Array.from(document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')).filter(n=>n.textContent?.includes(option)).at(-1)!;row.click();await nextTick();}
async function menu(text:string){const trigger=document.querySelector<HTMLButtonElement>('button[aria-label="管理 资料.md"]')!;expect(trigger).toBeTruthy();trigger.click();await nextTick();await vi.waitFor(()=>expect(Array.from(document.querySelectorAll('[role=menuitem]')).some(n=>n.textContent?.trim()===text)).toBe(true));const row=Array.from(document.querySelectorAll<HTMLElement>('[role=menuitem]')).find(n=>n.textContent?.trim()===text)!;row.click();await nextTick();return row;}
function files(...names:string[]){const el=document.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(el,'files',{configurable:true,value:names.map(name=>new File(['fixture'],name))});el.dispatchEvent(new Event('change',{bubbles:true}));}
async function uploadTarget(d:HTMLElement){await choose(d,'资料所有者','所有者A');await nextTick();}
it('real enterprise route, server search/page without auth identity switch',async()=>{await mount('/admin/library');await vi.waitFor(()=>expect(buttons('管理资料')).toHaveLength(1));expect(root!.querySelector('.el-table')?.classList.contains('el-table--border')).toBe(true);expect(root!.textContent).toContain('企业管理员');expect(root!.textContent).toContain('管理员甲');expect(root!.textContent).toContain('13800000002');const tenantQuery=root!.querySelector<HTMLInputElement>('input[aria-label="搜索企业"]')!;input(tenantQuery,'小米');expect(buttons('搜索')[0]?.classList.contains('el-button--primary')).toBe(true);click('搜索');await vi.waitFor(()=>expect(fixture.tenants.mock.calls.at(-1)?.[0]).toMatchObject({q:'小米',page:1}));click('重置');await vi.waitFor(()=>expect(fixture.tenants.mock.calls.at(-1)?.[0]).toMatchObject({q:'',page:1}));click('管理资料');await vi.waitFor(()=>expect(router.currentRoute.value.params.tenantId).toBe('a'));await vi.waitFor(()=>expect(fixture.items).toHaveBeenCalled());expect(root!.textContent).toContain('全部成员');expect(root!.textContent).toContain('成员A');expect(root!.querySelector('[aria-label="资料目录"]')).toBeTruthy();const q=root!.querySelector<HTMLInputElement>('input[aria-label="搜索全部层级资料"]')!;input(q,'嵌套资料');q.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true}));await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({q:'嵌套资料',page:1,pageSize:10}));root!.querySelector<HTMLButtonElement>('.el-pagination .btn-next')!.click();await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1].page).toBe(2));click('重置');await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({q:'',state:'ALL',page:1}));});
it('real Vue row proxy, explicit body preview and native body-teleported margin-auto modal',async()=>{await mount();await vi.waitFor(()=>expect(buttons('资料.md')).toHaveLength(1));click('资料.md');const d=await dialog('资料.md');expect(fixture.preview).not.toHaveBeenCalled();expect(d.closest('.el-overlay')?.parentElement).toBe(document.body);expect(getComputedStyle(d).margin).toBe('auto');expect(getComputedStyle(d.querySelector('.el-dialog__body')!).overflowY).toBe('auto');click('预览正文',d);await vi.waitFor(()=>expect(document.body.textContent).toContain('直接管理fixture内容'));expect(fixture.preview.mock.calls[0]?.[0]).toBe('a');});
it('unauthorized rename disabled; prompt submits the name and reports a conflict',async()=>{
 fixture.items.mockResolvedValueOnce({items:[item('file-a',false)],total:1});
 await mount();
 const disabled=await menu('重命名');
 expect(disabled.getAttribute('aria-disabled')).toBe('true');
 expect(fixture.command).not.toHaveBeenCalled();
 fixture.items.mockResolvedValue({items:[item()],total:1});
 click('刷新');await vi.waitFor(()=>expect(fixture.items).toHaveBeenCalledTimes(2));
 const prompt=vi.spyOn(ElMessageBox,'prompt').mockResolvedValue({value:'新名字.md',action:'confirm'} as never);
 await menu('重命名');
 await vi.waitFor(()=>expect(fixture.command).toHaveBeenCalledTimes(1));
 expect(fixture.command.mock.calls[0]?.[1]).toMatchObject({action:'rename',nodeId:'file-a',name:'新名字.md',expectedUpdatedAt:'2026-11-08T08:00:00Z',expectedVersionId:'v1'});
 await vi.waitFor(()=>expect(buttons('刷新')[0]?.disabled).toBe(false));
 fixture.command.mockRejectedValueOnce(new Error('409 资料已更新'));
 prompt.mockResolvedValueOnce({value:'冲突名.md',action:'confirm'} as never);
 await menu('重命名');
 await vi.waitFor(()=>expect(fixture.command).toHaveBeenCalledTimes(2));
 await vi.waitFor(()=>expect(root!.textContent).toContain('409 资料已更新'));
});
it('replacement upload uses the enterprise console single-file dialog',async()=>{
 await mount();
 await menu('替换新版本');
 const d=await dialog('上传新版本');
 expect(d.textContent).toContain('替换版本一次只选择一个文件。');
 expect(d.textContent).not.toContain('目标企业：');
 expect(d.textContent).not.toContain('资料所有者');
 expect(buttons('选择文件夹',d)).toHaveLength(0);
 files('new.md');
 await nextTick();
 click('开始上传',d);
 await vi.waitFor(()=>expect(fixture.upload).toHaveBeenCalledTimes(1));
 expect(fixture.upload.mock.calls[0]?.[1]).toMatchObject({action:'replace',nodeId:'file-a',expectedVersionId:'v1'});
 expect(fixture.upload.mock.calls[0]?.[4]).toBe(true);
});

it('admin upload locks explicit owner/grant; partial failure retries only failed file with same idempotency key',async()=>{await mount();click('上传资料');const d=await dialog('上传企业资料');files('a.md','b.md');await nextTick();click('开始上传',d);await vi.waitFor(()=>expect(d.textContent).toContain('请选择本企业的有效成员作为所有者'));expect(fixture.upload).not.toHaveBeenCalled();await uploadTarget(d);let failed=false;fixture.upload.mockImplementation(async(_tenant:string,_body:unknown,file:File)=>{if(file.name==='b.md'&&!failed){failed=true;throw new Error('403 授权拒绝fixture');}return {nodeId:file.name};});click('开始上传',d);await vi.waitFor(()=>expect(fixture.upload).toHaveBeenCalledTimes(2));await vi.waitFor(()=>expect(d.textContent).toContain('403 授权拒绝fixture'));expect(fixture.upload.mock.calls[0]?.slice(0,2)).toEqual(['a',expect.objectContaining({ownerUserId:'owner-a',scope:'PRIVATE'})]);expect(fixture.upload.mock.calls[0]?.[1]).not.toHaveProperty('grantId');click('重试失败项',d);await vi.waitFor(()=>expect(fixture.upload).toHaveBeenCalledTimes(3));expect(fixture.upload.mock.calls.map(c=>c[2].name)).toEqual(['a.md','b.md','b.md']);expect(fixture.upload.mock.calls[1]?.[1].requestId).toBe(fixture.upload.mock.calls[2]?.[1].requestId);});
it('admin folder upload creates the same path under the locked owner and uploads into it',async()=>{
 fixture.folder.mockImplementation(async (_tenant:string,body:{name:string})=>({nodeId:`folder-${body.name}`}));
 await mount();click('上传资料');const d=await dialog('上传企业资料');await uploadTarget(d);
 Object.defineProperty(HTMLInputElement.prototype,'webkitdirectory',{configurable:true,value:true});
 const folderInput=d.querySelector<HTMLInputElement>('input[aria-label="选择文件夹"]')!;
 const first=new File(['a'],'a.md');Object.defineProperty(first,'webkitRelativePath',{configurable:true,value:'团队资料/a.md'});
 const second=new File(['b'],'b.md');Object.defineProperty(second,'webkitRelativePath',{configurable:true,value:'团队资料/子目录/b.md'});
 Object.defineProperty(folderInput,'files',{configurable:true,value:[first,second]});
 folderInput.dispatchEvent(new Event('change',{bubbles:true}));
 await nextTick();
 click('开始上传',d);
 await vi.waitFor(()=>expect(fixture.folder).toHaveBeenCalledWith('a',expect.objectContaining({name:'团队资料',ownerUserId:'owner-a',scope:'PRIVATE',reuseExisting:true})));
 await vi.waitFor(()=>expect(fixture.folder).toHaveBeenCalledWith('a',expect.objectContaining({name:'子目录',ownerUserId:'owner-a',scope:'PRIVATE',parentId:'folder-团队资料',reuseExisting:true})));
 await vi.waitFor(()=>expect(fixture.upload).toHaveBeenCalledTimes(2));
 expect(fixture.upload.mock.calls[0]?.[1]).toMatchObject({parentId:'folder-团队资料',ownerUserId:'owner-a'});
 expect(fixture.upload.mock.calls[1]?.[1]).toMatchObject({parentId:'folder-子目录'});
});

it('admin move uses a folder picker with breadcrumb and parent navigation',async()=>{
 const base=options('a');
 fixture.options.mockResolvedValue({...base,members:[{id:'owner-a',name:'成员A',fileCount:1}],owners:[{id:'owner-a',name:'所有者A'}],folders:[
  {id:'folder-1',name:'项目A',parentId:null,ownerUserId:'owner-a',scope:'PRIVATE',updatedAt:'2026-11-20T00:00:00Z'},
  {id:'folder-2',name:'子目录',parentId:'folder-1',ownerUserId:'owner-a',scope:'PRIVATE',updatedAt:'2026-11-20T00:00:00Z'},
  {id:'folder-3',name:'共享夹',parentId:null,ownerUserId:'owner-a',scope:'ENTERPRISE',updatedAt:'2026-11-20T00:00:00Z'},
 ]});
 fixture.items.mockResolvedValue({items:[item()],total:1});
 await mount('/admin/library/a');
 await menu('移动');
 const d=await dialog('移动');
 expect(d.textContent).toContain('根目录');
 expect(d.textContent).toContain('项目A');
 expect(d.textContent).toContain('共享夹');
 expect(d.textContent).not.toContain('所有者：');
 expect(d.textContent).toContain('共 2 个文件夹');
 expect(d.textContent).toContain('移入共享目录会共享该资料及其子项。');
 expect([...d.querySelectorAll<HTMLButtonElement>('button')].some(button=>button.textContent?.trim()==='上一级')).toBe(false);
 [...d.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.trim()==='项目A')!.click();
 await nextTick();
 expect(d.textContent).toContain('根目录/项目A');
 expect([...d.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.trim()==='上一级')?.disabled).toBe(false);
 [...d.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.trim()==='子目录')!.click();
 await nextTick();
 expect(d.textContent).toContain('根目录/项目A/子目录');
 click('保存',d);
 await vi.waitFor(()=>expect(fixture.command.mock.calls[0]?.[1]).toMatchObject({action:'move',nodeId:'file-a',parentId:'folder-2'}));
});

it('tenant change unmounts unsent queue; in-flight request remains frozen, no next file',async()=>{await mount();click('上传资料');const d=await dialog('上传企业资料');await uploadTarget(d);let release:()=>void=()=>{};fixture.upload.mockImplementation(()=>new Promise<void>(resolve=>{release=resolve;}));files('first.md','queued.md');await nextTick();click('开始上传',d);await vi.waitFor(()=>expect(fixture.upload).toHaveBeenCalledTimes(1));fixture.items.mockResolvedValue({items:[],total:0});await router.replace('/admin/library?tenantId=b');await nextTick();release();await new Promise(r=>setTimeout(r,20));expect(fixture.upload).toHaveBeenCalledTimes(1);expect(fixture.upload.mock.calls[0]?.[0]).toBe('a');await vi.waitFor(()=>expect(fixture.options).toHaveBeenCalledWith('b'));expect(root!.textContent).not.toContain('资料.md');});
it('opens a recycled folder from the all-materials member view and lists its recycled files',async()=>{
 const base=options('a');
 fixture.options.mockResolvedValue({...base,members:[{id:'owner-a',name:'成员A',fileCount:1}],owners:[{id:'owner-a',name:'所有者A'}],folders:[]});
 const recycledFolder={...item(),id:'folder-r',name:'3',kind:'FOLDER',state:'RECYCLED',scope:'ENTERPRISE',fileType:'folder',currentVersion:null,purgeBlockedReason:null};
 fixture.items.mockResolvedValueOnce({items:[recycledFolder],total:1});
 await mount('/admin/library/a?owner=owner-a');
 await vi.waitFor(()=>expect(root!.textContent).toContain('3'));
 root!.querySelector<HTMLTableRowElement>('.el-table__body tbody tr')!.dispatchEvent(new MouseEvent('click',{bubbles:true}));
 await vi.waitFor(()=>expect(router.currentRoute.value.query.folder).toBe('folder-r'));
 await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({folderId:'folder-r',layer:'children',state:'ALL'}));
 expect(fixture.items.mock.calls.at(-1)?.[1].fileType).toBeUndefined();
});

it('recycle range lists recycled files for the selected member',async()=>{
 const base=options('a');
 fixture.options.mockResolvedValue({...base,members:[{id:'owner-a',name:'成员A',fileCount:1}],owners:[{id:'owner-a',name:'所有者A'}],folders:[]});
 await mount('/admin/library/a?owner=owner-a');
 const range=root!.querySelector<HTMLElement>('.library-toolbar .el-select')!;
 range.querySelector<HTMLElement>('.el-select__wrapper')!.click();
 await vi.waitFor(()=>expect([...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].some(node=>node.textContent?.includes('回收站'))).toBe(true));
 [...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(node=>node.textContent?.includes('回收站'))!.click();
 await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({state:'RECYCLED',ownerUserId:'owner-a'}));
 expect(fixture.items.mock.calls.at(-1)?.[1].fileType).toBeUndefined();
});

it('recycled rows expose only valid actions and no delete-impact entry',async()=>{fixture.items.mockResolvedValue({items:[{...item(),state:'RECYCLED'}],total:1});await mount();const purge=await menu('彻底删除');expect(purge.getAttribute('aria-disabled')).toBe('true');const labels=[...document.querySelectorAll('.el-dropdown-menu__item')].map(node=>node.textContent?.trim());expect(labels.some(text=>text?.includes('查看删除影响'))).toBe(false);expect(labels.some(text=>text?.includes('重命名'))).toBe(false);expect(labels.some(text=>text?.includes('撤销共享'))).toBe(false);expect(labels).toEqual(expect.arrayContaining(['恢复','彻底删除']));expect(fixture.command).not.toHaveBeenCalled();});
it('recycle matches the enterprise admin confirmation and keeps the current owner filter',async()=>{
  const confirm=vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm');
  await mount('/admin/library/a?member=owner-a');
  await vi.waitFor(()=>expect(fixture.items).toHaveBeenCalled());
  await menu('回收');
  await vi.waitFor(()=>expect(confirm).toHaveBeenCalled());
  const [body,title,options]=confirm.mock.calls[0] as [{props?:{name?:string;description?:string}},string,{confirmButtonText?:string}];
  expect(title).toBe('移入回收站？');
  expect(body.props?.description).toBe('移入回收站后可以恢复。文件夹会连同里面的资料一起回收。');
  expect(options.confirmButtonText).toBe('移入回收站');
  await vi.waitFor(()=>expect(fixture.command.mock.calls.at(-1)?.[1]).toMatchObject({action:'recycle',nodeId:'file-a'}));
  const notice=await vi.waitFor(()=>{
    const node=[...document.querySelectorAll('.el-message')].find(item=>item.textContent?.includes('已移入回收站'));
    expect(node).toBeTruthy();
    return node!;
  });
  fixture.items.mockClear();
  notice.querySelector('button')!.click();
  await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({state:'RECYCLED',ownerUserId:'owner-a'}));
  expect(root!.textContent).toContain('成员A');
});

it('cancelling the recycle confirmation sends no command',async()=>{
 const confirm=vi.spyOn(ElMessageBox,'confirm').mockRejectedValue('cancel');
 await mount();await menu('回收');
 await vi.waitFor(()=>expect(confirm).toHaveBeenCalled());
 expect(fixture.command).not.toHaveBeenCalled();
});

it('purge matches the enterprise admin confirmation and sends one delete request',async()=>{
 fixture.items.mockResolvedValue({items:[{...item(),kind:'FOLDER',state:'RECYCLED',purgeBlockedReason:null,currentVersion:null}],total:1});
 const confirm=vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm');
 await mount();await menu('彻底删除');
 await vi.waitFor(()=>expect(confirm).toHaveBeenCalled());
 const [body,title,options]=confirm.mock.calls[0] as [{props?:{name?:string;description?:string}},string,{confirmButtonText?:string}];
 expect(title).toBe('彻底删除资料？');
 expect(body.props?.description).toBe('彻底删除该资料及其中的全部内容与版本；旧引用会显示来源不可用，不会改指向其它版本。');
 expect(options.confirmButtonText).toBe('彻底删除');
 await vi.waitFor(()=>expect(fixture.command).toHaveBeenCalledTimes(1));
 expect(fixture.command.mock.calls[0][1]).toMatchObject({action:'purge',nodeId:'file-a',confirmPurge:true});
});

it('admin visibility confirm matches the enterprise admin copy and submits the revision', async () => {
 fixture.items.mockResolvedValue({items:[{...item(),kind:'FOLDER',currentVersion:null}],total:1});
 fixture.scopeImpact.mockResolvedValue({total:4,changed:4,treeRevision:'c'.repeat(64)});
 const confirm=vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm');
 await mount();await menu('共享到企业');
 await vi.waitFor(()=>expect(confirm).toHaveBeenCalledWith(expect.stringContaining('当前位置的全部内容会一起共享'),'确认共享',expect.objectContaining({customClass:'library-message-box'})));
 expect(confirm.mock.calls[0]?.[0]).toContain('3 项');
 await vi.waitFor(()=>expect(fixture.command).toHaveBeenCalledTimes(1));
 expect(fixture.command.mock.calls[0]?.[1]).toMatchObject({scope:'ENTERPRISE',confirmShare:true,confirmUnshare:false,expectedTreeRevision:'c'.repeat(64)});
 expect(fixture.command.mock.calls[0]?.[1]).not.toHaveProperty('grantId');
});

it('enterprise detail shows members as a tree and filters without leaving the page',async()=>{
 const base=options('a');
 fixture.options.mockResolvedValue({...base,members:[{id:'owner-a',name:'成员A',fileCount:2}],owners:[{id:'owner-a',name:'所有者A'}],folders:[
  {id:'folder-1',name:'项目A',parentId:null,ownerUserId:'owner-a',scope:'PRIVATE'},
  {id:'folder-2',name:'共享夹',parentId:null,ownerUserId:'owner-a',scope:'ENTERPRISE'},
  {id:'folder-3',name:'子目录',parentId:'folder-1',ownerUserId:'owner-a',scope:'PRIVATE'},
 ]});
 await mount('/admin/library/a');
 await vi.waitFor(()=>expect(root!.textContent).toContain('成员A'));
 expect(root!.textContent).not.toContain('查看资料');
 expect(root!.querySelector('[aria-label="资料目录"]')).toBeTruthy();
 expect(root!.querySelector('[aria-label="搜索全部层级资料"]')).toBeTruthy();
 expect(root!.querySelector('.admin-tree-icon')).toBeTruthy();
 expect(root!.querySelector('.admin-scope-value')).toBeTruthy();
 expect([...root!.querySelectorAll('th .cell')].slice(0,2).map(cell=>cell.textContent?.trim())).toEqual(['所有者','名称']);
 click('更多筛选');await nextTick();
 expect(root!.querySelector('[aria-label="所有者筛选"]')).toBeTruthy();
 const user=[...root!.querySelectorAll<HTMLElement>('.el-tree-node__content')].find(node=>node.textContent?.includes('成员A'))!;
 user.click();
 await vi.waitFor(()=>expect(router.currentRoute.value.query.owner).toBe('owner-a'));
 await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({ownerUserId:'owner-a',layer:'children'}));
 expect(fixture.items.mock.calls.at(-1)?.[1].fileType).toBe('folder');
 expect(fixture.items.mock.calls.at(-1)?.[1].status).toBeUndefined();
 expect([...root!.querySelectorAll('th .cell')].slice(0,1).map(cell=>cell.textContent?.trim())).toEqual(['名称']);
 expect(root!.querySelector('[aria-label="所有者筛选"]')).toBeNull();
 expect(root!.querySelector('[aria-label="文件类型筛选"]')).toBeNull();
 expect(root!.querySelector('[aria-label="处理状态筛选"]')).toBeNull();
 await vi.waitFor(()=>expect(root!.querySelector('.admin-tree-shared')?.textContent).toContain('共享'));
 const treeMore=root!.querySelector<HTMLButtonElement>('[aria-label="共享夹 更多"]');
 expect(treeMore).toBeTruthy();
 treeMore!.click();
 await vi.waitFor(()=>expect([...document.querySelectorAll('.el-dropdown-menu__item')].some(node=>node.textContent?.trim()==='撤销共享')).toBe(true));
 document.querySelectorAll('.el-popper').forEach(node=>node.remove());
 const folder=[...root!.querySelectorAll<HTMLElement>('.el-tree-node__content')].find(node=>node.textContent?.includes('项目A'))!;
 folder.click();
 await vi.waitFor(()=>expect(router.currentRoute.value.query.folder).toBe('folder-1'));
 await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({folderId:'folder-1',layer:'children'}));
 expect(fixture.items.mock.calls.at(-1)?.[1].ownerUserId).toBeUndefined();
 click('全部成员');
 await vi.waitFor(()=>expect(router.currentRoute.value.query.owner).toBeUndefined());
 await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({layer:'children'}));
});
it('left member tree shows recycled top-level items with a red badge and restores them in place',async()=>{
 const base=options('a');
 const version={id:'v1',versionNo:1,originalName:'根目录回收.pdf',mimeType:'application/pdf',sizeBytes:4,parseStatus:'READY',parseReason:null,createdAt:'2026-11-08T08:00:00Z',createdByUserId:'owner-a'};
 fixture.options.mockResolvedValue({...base,members:[{id:'owner-a',name:'成员A',fileCount:1}],owners:[{id:'owner-a',name:'所有者A'}],folders:[],recycled:[
  {id:'folder-r',name:'回收文件夹',kind:'FOLDER',scope:'ENTERPRISE',parentId:null,ownerUserId:'owner-a',ownerName:'成员A',updatedAt:'2026-11-08T08:00:00Z',fileType:'folder',currentVersion:null,canWrite:true},
  {id:'file-in',name:'文件夹内文件.md',kind:'FILE',scope:'ENTERPRISE',parentId:'folder-r',ownerUserId:'owner-a',ownerName:'成员A',updatedAt:'2026-11-08T08:00:00Z',fileType:'text',currentVersion:null,canWrite:true},
  {id:'file-r',name:'根目录回收.pdf',kind:'FILE',scope:'PRIVATE',parentId:null,ownerUserId:'owner-a',ownerName:'成员A',updatedAt:'2026-11-08T08:00:00Z',fileType:'pdf',currentVersion:version,canWrite:true},
 ]});
 await mount('/admin/library/a?owner=owner-a');
 await vi.waitFor(()=>expect(root!.textContent).toContain('回收文件夹'));
 expect(root!.textContent).toContain('根目录回收.pdf');
 expect(root!.textContent).not.toContain('文件夹内文件.md');
 expect(root!.querySelectorAll('.admin-tree-recycled')).toHaveLength(2);
 expect(root!.querySelector('[aria-label="恢复 回收文件夹"]')).toBeNull();
 root!.querySelector<HTMLButtonElement>('[aria-label="回收文件夹 更多"]')!.click();
 const recycledMenu=[...document.querySelectorAll<HTMLElement>('.el-popper')].filter(popper=>popper.textContent?.trim()==='彻底删除恢复').at(-1)!;
 expect(recycledMenu).toBeTruthy();
 expect([...recycledMenu.querySelectorAll<HTMLElement>('[role=menuitem]')].map(node=>node.textContent?.trim())).toEqual(['彻底删除','恢复']);
 [...recycledMenu.querySelectorAll<HTMLElement>('[role=menuitem]')].find(node=>node.textContent?.trim()==='恢复')!.click();
 await vi.waitFor(()=>expect(fixture.command.mock.calls.at(-1)?.[1]).toMatchObject({action:'restore',nodeId:'folder-r'}));
});

it('opening a recycled folder keeps the current member tree expanded',async()=>{
 const base=options('a');
 fixture.options.mockResolvedValue({...base,members:[{id:'owner-a',name:'成员A',fileCount:1}],owners:[{id:'owner-a',name:'所有者A'}],folders:[],recycled:[
  {id:'folder-r',name:'回收文件夹',kind:'FOLDER',scope:'ENTERPRISE',parentId:null,ownerUserId:'owner-a',ownerName:'成员A',updatedAt:'2026-11-08T08:00:00Z',fileType:'folder',currentVersion:null,canWrite:true},
 ]});
 fixture.items.mockResolvedValue({items:[{...item(),parentId:'folder-r',state:'RECYCLED'}],total:1});
 await mount('/admin/library/a?owner=owner-a');
 const folder=[...root!.querySelectorAll<HTMLElement>('.el-tree-node__content')].find(node=>node.textContent?.includes('回收文件夹'))!;
 folder.click();
 await vi.waitFor(()=>expect(router.currentRoute.value.query.folder).toBe('folder-r'));
 expect(router.currentRoute.value.query.owner).toBe('owner-a');
 await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({folderId:'folder-r',layer:'children'}));
});

it('owner filter only filters the current all-members list',async()=>{
 const base=options('a');
 fixture.options.mockResolvedValue({...base,members:[{id:'owner-a',name:'成员A',fileCount:2}],owners:[{id:'owner-a',name:'所有者A'}],folders:[{id:'folder-1',name:'项目A',parentId:null,ownerUserId:'owner-a',scope:'PRIVATE'}]});
 await mount('/admin/library/a');
 await vi.waitFor(()=>expect(root!.textContent).toContain('全部成员'));
 click('更多筛选');await nextTick();
 const firstSelect=root!.querySelector<HTMLElement>('.library-filters .el-select')!;
 firstSelect.querySelector<HTMLElement>('.el-select__wrapper')!.click();
 await vi.waitFor(()=>expect([...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].some(node=>node.textContent?.includes('成员A'))).toBe(true));
 [...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(node=>node.textContent?.includes('成员A'))!.click();
 await vi.waitFor(()=>expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({ownerUserId:'owner-a',layer:'children'}));
 expect(fixture.items.mock.calls.at(-1)?.[1].fileType).toBeUndefined();
 expect(router.currentRoute.value.query.owner).toBeUndefined();
 expect(root!.textContent).toContain('全部成员');
 expect(root!.textContent).not.toContain('成员A 的资料');
 expect(root!.querySelector('[aria-label="所有者筛选"]')).toBeTruthy();
 expect([...root!.querySelectorAll('th .cell')].some(cell=>cell.textContent?.includes('所有者'))).toBe(true);
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
it('shows recycled items in the default all-materials list with a lifecycle status',async()=>{
 fixture.items.mockResolvedValue({items:[{...item(),state:'RECYCLED',purgeBlockedReason:null}],total:1});
 await mount('/admin/library/a');
 await vi.waitFor(()=>expect(fixture.items).toHaveBeenCalled());
 expect(fixture.items.mock.calls.at(-1)?.[1]).toMatchObject({state:'ALL'});
 expect([...root!.querySelectorAll('th .cell')].some(cell=>cell.textContent?.includes('资料状态'))).toBe(true);
 expect(root!.textContent).toContain('回收站');
});

it('file rows use the client-style colored file type icons',async()=>{
 fixture.items.mockResolvedValue({items:[
  {...item('pdf'),name:'方案.pdf',fileType:'pdf'},
  {...item('word'),name:'方案.docx',fileType:'word'},
  {...item('excel'),name:'统计.xlsx',fileType:'excel'},
  {...item('image'),name:'图片.png',fileType:'image'},
 ],total:4});
 await mount();
 for(const kind of ['pdf','word','excel','image'])await vi.waitFor(()=>expect(root!.querySelector(`.library-file-type-icon.is-${kind}`)).toBeTruthy());
 expect(root!.querySelector('.library-file-type-icon.is-pdf')?.getAttribute('width')).toBe('18');
});

it('enterprise overview enters an independently addressable detail route',async()=>{
 await mount('/admin/library');click('管理资料',root!);
 await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe('/admin/library/a'));
 await vi.waitFor(()=>expect(root!.textContent).toContain('全部成员'));
 root!.querySelector<HTMLButtonElement>('[aria-label="返回企业列表"]')!.click();await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe('/admin/library'));
});
