import { afterEach, expect, it, vi } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import ElementPlus from 'element-plus';
import AvatarGenerationDialog from '../src/components/AvatarGenerationDialog.vue';
const api=vi.hoisted(()=>({models:vi.fn(),generate:vi.fn()}));
vi.mock('../src/api/admin/avatar-generation',()=>({avatarGenerationApi:api}));
let app:App|undefined;let root:HTMLElement;
afterEach(()=>{app?.unmount();root?.remove();document.querySelectorAll('.el-overlay').forEach(x=>x.remove());vi.resetAllMocks();});
async function flush(){for(let i=0;i<8;i++)await nextTick();}
async function mount(selected:ReturnType<typeof vi.fn>){
 api.models.mockResolvedValue({models:[{providerId:'sf',providerName:'SiliconFlow 知识库',model:'Kwai-Kolors/Kolors',displayName:'Kolors'}]});
 root=document.createElement('div');document.body.append(root);
 app=createApp(AvatarGenerationDialog,{modelValue:true,onSelected:selected});app.use(ElementPlus);app.mount(root);await flush();
}
it('previews the generated image and applies a pending File only after explicit selection',async()=>{
 const selected=vi.fn();await mount(selected);
 expect(document.querySelector('.avatar-generator .el-select')?.textContent).toContain('Kolors');
 expect(document.querySelector('.avatar-generator .el-select')?.textContent).not.toContain('SiliconFlow');
 const input=document.querySelector('textarea')!;input.value='紫色增长图标';input.dispatchEvent(new Event('input',{bubbles:true}));await flush();
 api.generate.mockResolvedValue({base64:'aGVsbG8=',mimeType:'image/png',model:'Kwai-Kolors/Kolors'});
 const button=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='生成头像')!;button.click();await flush();
 expect(api.generate).toHaveBeenCalledOnce();expect(document.querySelector('img[alt="生成的头像预览"]')).toBeTruthy();expect(selected).not.toHaveBeenCalled();
 [...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='使用这张图')!.click();await flush();
 expect(selected.mock.calls[0][0]).toBeInstanceOf(File);expect(selected.mock.calls[0][0].type).toBe('image/png');
});
it('ignores generation result after dialog cancellation',async()=>{
 const selected=vi.fn();await mount(selected);let resolve:any;
 api.generate.mockReturnValue(new Promise(r=>{resolve=r;}));
 const input=document.querySelector('textarea')!;input.value='avatar';input.dispatchEvent(new Event('input',{bubbles:true}));await flush();
 [...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='生成头像')!.click();await flush();
 [...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='取消')!.click();await flush();resolve({base64:'aGVsbG8=',mimeType:'image/png'});await flush();
 expect(selected).not.toHaveBeenCalled();expect(document.querySelector('img[alt="生成的头像预览"]')).toBeFalsy();
});
