// Isolated visual fixture: real Library.vue + Element Plus, synthetic data only. No service/account access.
import { createApp, h } from 'vue';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import Library from '../../src/views/Library.vue';
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/console/library/:view',component:Library}]});
const item={id:'fixture-short',name:'隔离资料预览.md',kind:'FILE',scope:'PRIVATE',state:'ACTIVE',mine:true,canManage:false,parentId:null,parentPath:[],ownerName:'Fixture',updatedAt:'2026-11-08T08:00:00Z',currentVersion:{id:'fixture-v1',versionNo:1,mimeType:'text/markdown',sizeBytes:128,parseStatus:'READY'}};
// All HTTP is intercepted, including unexpected paths; no token/session is created or read manually.
globalThis.fetch=async(input)=>{
 const path=String(input);
 if(path.includes('/library/config'))return Response.json({maxFileBytes:1000,allowedExtensions:['.md']});
 if(path.includes('/library/items'))return Response.json({items:[item],total:1,page:1,pageSize:20,breadcrumb:[]});
 if(path.includes('/preview'))return Response.json({nodeId:'fixture',versionId:'fixture-v1',versionNo:1,name:path.includes('long')?'很长的资料名称用于测试换行'.repeat(8)+'.md':'隔离资料预览.md',previewKind:'text',parseStatus:'READY',executable:false,text:path.includes('long')?'仅用于检查正文滚动，头尾保持可见。\n'.repeat(160):'这是短内容，弹窗不应拉满半屏。'});
 return Response.json({message:'仅隔离预览fixture，不执行该操作'},{status:403});
};
void router.push('/console/library/mine?preview=fixture-short&version=fixture-v1').then(()=>{
 createApp({render:()=>h(RouterView)}).use(ElementPlus).use(router).mount('#app');
});
let sequence=0;
for(const view of ['recent','mine','shared','trash'])document.querySelector('[data-view='+view+']')?.addEventListener('click',()=>{void router.replace('/console/library/'+view+'?preview=fixture-short-'+(++sequence)+'&version=fixture-v1');});
for(const kind of ['short','long'])document.querySelector('[data-preview='+kind+']')?.addEventListener('click',()=>{void router.replace({query:{preview:'fixture-'+kind+'-'+(++sequence),version:'fixture-v1'}});});
