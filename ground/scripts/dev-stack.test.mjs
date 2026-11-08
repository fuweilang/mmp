import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const moduleUrl = new URL('./dev-stack.mjs', import.meta.url).href;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Each case uses an isolated Node process and real spawned CLI doubles.
// No Docker daemon, repository .env, database, or user dev processes are touched.
function fixture(scenario = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmp-boot-t180-'));
  try {
    const state = path.join(dir, 'state.json');
    fs.writeFileSync(state, JSON.stringify({ calls: [], context: 'colima', colimaInstalled: true, ...scenario }));
    const cli = `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const file=process.env.DEV_BOOT_FIXTURE,s=JSON.parse(fs.readFileSync(file,'utf8'));
const cmd=path.basename(process.argv[1]),args=process.argv.slice(2);s.calls.push([cmd,...args]);
let code=0,out='';
if(cmd==='docker'&&args[0]==='info'){code=s.dockerMissing?127:(s.dockerReady?0:1);out=code?'fixture Docker unavailable':'29.fixture';}
else if(cmd==='docker'&&args[0]==='context'){out=s.context;}
else if(cmd==='colima'&&args[0]==='version'){code=s.colimaInstalled?0:127;out='fixture colima';}
else if(cmd==='colima'||cmd==='open'){code=s.startExit||0;out='fixture runtime start';if(!code&&!s.neverReady)s.dockerReady=true;}
else if(cmd==='docker'&&args[0]==='compose'){code=s.dbExit||0;out='fixture compose';if(!code&&!s.dbNeverReady)s.dbReady=true;}
else{code=99;out='unexpected fixture CLI';}
fs.writeFileSync(file,JSON.stringify(s));console.log(out);process.exit(code);
`;
    for (const name of ['docker', 'colima', 'open']) fs.writeFileSync(path.join(dir, name), cli, {mode:0o700});
    const source = `import fs from 'node:fs'; import {ensureDatabase} from ${JSON.stringify(moduleUrl)};
const file=process.env.DEV_BOOT_FIXTURE;
try { await ensureDatabase({endpoint:{host:'127.0.0.1',port:5433},probePort:async()=>JSON.parse(fs.readFileSync(file,'utf8')).dbReady===true,dockerTimeoutMs:${scenario.neverReady?400:2000},databaseTimeoutMs:150,pollMs:10,platform:'darwin',desktopInstalled:${scenario.desktopInstalled===true},env:{DOCKER_HOST:${JSON.stringify(scenario.hostOverride || '')}}}); }
catch(error){console.error(error.message);process.exit(error.exitCode??1);}`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',source],{cwd:root,encoding:'utf8',timeout:10000,env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,DEV_BOOT_FIXTURE:state}});
    assert.ifError(result.error);
    return {code:result.status,output:result.stdout+result.stderr,...JSON.parse(fs.readFileSync(state,'utf8'))};
  } finally { fs.rmSync(dir,{recursive:true,force:true}); } // only this fixture's freshly-created temp tree
}
const calls=(f,name)=>f.calls.filter(row=>row[0]===name);
test('already-ready DB does not inspect/start Docker or compose',()=>{const f=fixture({dbReady:true});assert.equal(f.code,0);assert.deepEqual(f.calls,[]);});
test('running Docker is reused; compose targets only postgres with no recreate',()=>{const f=fixture({dockerReady:true});assert.equal(f.code,0);assert.deepEqual(calls(f,'colima'),[]);assert.deepEqual(calls(f,'open'),[]);assert.deepEqual(f.calls.at(-1),['docker','compose','-f','infra/docker-compose.yml','up','-d','--no-recreate','--wait','--wait-timeout','90','postgres']);});
test('stopped Colima starts once then waits for Docker before compose',()=>{const f=fixture();assert.equal(f.code,0);assert.deepEqual(calls(f,'colima'),[['colima','version'],['colima','start']]);assert.equal(calls(f,'docker').filter(r=>r[1]==='compose').length,1);});
test('existing named Colima context preserves exact profile as one argv',()=>{const f=fixture({context:'colima-project-dev'});assert.equal(f.code,0);assert.deepEqual(calls(f,'colima').at(-1),['colima','start','--profile','project-dev']);});
test('Docker Desktop context starts installed app without starting Colima',()=>{const f=fixture({context:'desktop-linux',desktopInstalled:true});assert.equal(f.code,0);assert.deepEqual(calls(f,'open'),[['open','-a','Docker']]);assert.deepEqual(calls(f,'colima'),[]);});
test('default context can use installed Desktop when Colima is absent',()=>{const f=fixture({context:'default',colimaInstalled:false,desktopInstalled:true});assert.equal(f.code,0);assert.equal(calls(f,'open').length,1);});
test('missing runtime reports clearly without installation or compose',()=>{const f=fixture({context:'default',colimaInstalled:false});assert.equal(f.code,1);assert.match(f.output,/无可自动启动/);assert.equal(f.calls.some(r=>r[1]==='compose'),false);});
test('missing Docker CLI preserves 127 and never starts another runtime',()=>{const f=fixture({dockerMissing:true});assert.equal(f.code,127);assert.match(f.output,/未找到 Docker CLI/);assert.equal(f.calls.length,1);});
test('custom context and explicit Docker host are not silently replaced',()=>{for(const scenario of [{context:'remote-team'},{hostOverride:'tcp://fixture.invalid'}]){const f=fixture(scenario);assert.equal(f.code,1);assert.deepEqual(calls(f,'colima'),[]);assert.deepEqual(calls(f,'open'),[]);}});
test('runtime startup failure preserves CLI exit status and stops boot',()=>{const f=fixture({startExit:29});assert.equal(f.code,29);assert.match(f.output,/启动失败/);assert.equal(f.calls.some(r=>r[1]==='compose'),false);});
test('Docker readiness wait is bounded and returns timeout 124',()=>{const f=fixture({neverReady:true});assert.equal(f.code,124);assert.match(f.output,/Docker 就绪超时/);assert.equal(f.calls.some(r=>r[1]==='compose'),false);});
test('compose failure preserves its CLI exit status',()=>{const f=fixture({dockerReady:true,dbExit:43});assert.equal(f.code,43);assert.match(f.output,/数据库启动失败/);});
test('database readiness failure is bounded and does not report success',()=>{const f=fixture({dockerReady:true,dbNeverReady:true});assert.equal(f.code,124);assert.match(f.output,/5433 等待超时/);});
test('real child command argv and nonzero/timeout statuses are preserved',()=>{
 const source=`import {execCapture} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(await execCapture(process.execPath,['-e','process.stdout.write(process.argv[1]);process.exit(23)','one arg; no shell'],1000))); console.log(JSON.stringify(await execCapture(process.execPath,['-e','setTimeout(()=>{},10000)'],50)));`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',source],{cwd:root,encoding:'utf8',timeout:5000});assert.ifError(r.error);assert.equal(r.status,0);const lines=r.stdout.split('\n').filter(l=>l.startsWith('{')).map(l=>JSON.parse(l));assert.equal(lines[0].code,23);assert.equal(lines[0].output,'one arg; no shell');assert.equal(lines[1].code,124);
});
test('root and ground package entries form one nonrecursive dev chain',()=>{
 const g=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),m=JSON.parse(fs.readFileSync(path.join(root,'../package.json'),'utf8'));
 assert.equal(m.scripts.dev,'pnpm --dir ground run dev');assert.equal(g.scripts.dev,'node scripts/dev-stack.mjs');assert.match(g.scripts['dev:prepare'],/--prepare-only$/);
 const script=fs.readFileSync(new URL('./dev-stack.mjs',import.meta.url),'utf8');assert.ok(script.indexOf('await ensureDatabase()')<script.indexOf("run('api', 'pnpm run dev:api')"));assert.match(script,/process.exit\(err.exitCode \?\? 1\)/);
});
