/** Narrow safety/metadata checks only. Not a Host integration or sandbox certification. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {publicDiscoveryDetail,expertDiscoveryDetail,normalizeDiscoveryDetail} from '../src/official-agent/discovery-detail.ts';
const mammoth=resolve(import.meta.dirname,'../../../../mammoth-agent');
const {default:Gallery}=await import(pathToFileURL(resolve(mammoth,'packages/preset/official-agent-gallery/lib/index.js')).href);
const passed=[];
for(const method of ['create','createSkill']){
 await assert.rejects(()=>Reflect.apply(Gallery.prototype[method],null,[{}]),/GALLERY_EXECUTION_UNAVAILABLE/);
 passed.push(`${method}: refuses before Ground bind, workspace resolution or session creation`);
}
const unsafe={introduction:'具体用途',outputs:['可读结果'],materials:[],boundaries:[],starters:[{label:'草稿',text:'先整理提供的材料'}],role:'PRIVATE',toolConfig:{secret:'PRIVATE'},sourcePath:'/private'};
const dto=publicDiscoveryDetail(unsafe);
assert.deepEqual(Object.keys(dto).sort(),['schemaVersion','displayRevision','introduction','outputs','materials','boundaries','starters'].sort());
assert(!JSON.stringify(dto).includes('PRIVATE'));passed.push('public detail exact whitelist omits role/tool/path metadata');
assert.throws(()=>normalizeDiscoveryDetail(unsafe),/未允许字段/);passed.push('admin rejects private/unknown detail fields');
assert.throws(()=>normalizeDiscoveryDetail({introduction:'字'.repeat(2001)}),/2000/);
assert.throws(()=>normalizeDiscoveryDetail({schemaVersion:2}),/schemaVersion/);passed.push('length/schema validation rejects invalid input');
assert.throws(()=>normalizeDiscoveryDetail({displayRevision:0},{displayRevision:1}),/已被更新/);passed.push('stale display revision rejected');
const detail=normalizeDiscoveryDetail({introduction:'用途',starters:[{label:'起草',text:'仅草稿'}]});
assert.equal(detail.displayRevision,1);assert.equal(normalizeDiscoveryDetail(detail,detail).displayRevision,1);passed.push('display revision increments only on actual metadata change');
assert.equal(expertDiscoveryDetail({},['旧公开开场白']).starters[0]?.text,'旧公开开场白');
assert.equal(expertDiscoveryDetail({discoveryDetail:{starters:[]}},['旧公开开场白']).starters.length,0);passed.push('legacy public openingQuestions fallback; explicit empty list clears');
const files=['packages/preset/official-agent-gallery/src/admission.ts','packages/preset/official-agent-gallery/src/index.ts'];
const hashes=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(resolve(mammoth,file))).digest('hex')])));
const report={schemaVersion:1,passed,sourceSha256:hashes,executionAvailable:false,scope:'focused unit + built creation-method admission check only',notVerified:['actual Host handshake and scope receipts','cross-entry tools/MCP/subtasks/host helpers integration','symlink/TOCTOU/subprocess/network redirect enforcement','final context load barrier and budget after resume/compression/fallback','cancel/side-effect race and artifact receipt verification','public HTTP authentication and tenant integration','browser visual or UI acceptance'],decision:'Keep enhanced gallery execution closed. No sandbox/permission guarantee is asserted.'};
await writeFile(resolve(import.meta.dirname,'../src/official-agent/assets/managed/enhancement-v2/FOCUSED-CHECK.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:passed.length,executionAvailable:false,notVerified:report.notVerified},null,2));
