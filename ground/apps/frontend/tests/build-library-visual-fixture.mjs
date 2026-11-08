// Build real Library.vue without starting any service or using accounts/data/env files.
import {build} from 'vite';
import vue from '@vitejs/plugin-vue';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const frontend=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=process.argv[2]||'/tmp/mmp-library-t196-t197-visual';
await mkdir(output,{recursive:true});
const result=await build({root:frontend,configFile:false,envDir:false,plugins:[vue()],resolve:{alias:{'@mammoth/shared':resolve(frontend,'../../packages/shared/src/index.ts')}},build:{write:false,cssCodeSplit:false,lib:{entry:resolve(frontend,'tests/fixtures/library-dialog-visual.ts'),name:'LibraryDialogFixture',formats:['iife']},rollupOptions:{output:{inlineDynamicImports:true}}}});
const files=Array.isArray(result)?result.flatMap(x=>x.output):result.output;
const css=files.filter(x=>x.type==='asset'&&x.fileName.endsWith('.css')).map(x=>String(x.source)).join('\n');
const js=files.filter(x=>x.type==='chunk').map(x=>x.code).join('\n');
const html=`<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'"><title>真实资料弹窗—无凭据隔离fixture</title><style>${css}</style><style>html,body{margin:0;font-family:system-ui;background:#f4f5f7}#app{margin-left:220px;padding:20px;transform:translateZ(0);min-height:90vh}.fixture-controls{position:fixed;bottom:2px;left:2px;z-index:5000;background:white;border:1px solid #aaa;padding:4px;font-size:11px}.fixture-controls button{margin:2px}</style></head><body><div id="app"></div><nav class="fixture-controls">隔离fixture：没有真实账号/资料/服务；缩放viewport验中心与滚动。${['recent','mine','shared','trash'].map(x=>`<button data-view="${x}">${x}</button>`).join('')}<button data-preview="short">短预览</button><button data-preview="long">长预览</button></nav><script>${js.replaceAll('</script','<\/script')}</script></body></html>`;
await writeFile(output+'/console.html',html);
console.log('Standalone real Library.vue visual fixture:',output+'/console.html',Buffer.byteLength(html),'bytes; all network forbidden/intercepted');
