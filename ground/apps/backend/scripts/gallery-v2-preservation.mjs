#!/usr/bin/env node
// Read-only database preservation/count evidence for t128. No API exercise, tests, catalog imports or business-data writes.
import {createRequire} from 'node:module';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const name of ['.env','.env.local']){const path=resolve(root,name);if(existsSync(path))for(const line of readFileSync(path,'utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}}
const require=createRequire(resolve(root,'package.json'));
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
const {catalogFacets,displaySummary}=require(resolve(root,'dist/official-agent/catalog-discovery.js'));
const base=resolve(root,'src/official-agent/assets/managed/gallery-v2');
function canonical(value){if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(key=>key!=='customAvatarPath').sort().map(key=>[key,canonical(value[key])]));return value;}
function hash(value){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
try{
 const [agents,versions,skills,packages,links,grants]=await db.$transaction([db.officialAgent.findMany(),db.officialAgentVersion.findMany(),db.officialSkill.findMany(),db.officialSkillPackage.findMany(),db.officialAgentSkillLink.findMany(),db.officialAgentTenantGrant.findMany()],{isolationLevel:'RepeatableRead'});
 const data={agents,versions,skills,packages,links,grants};const before=JSON.parse(readFileSync(resolve(base,'BASELINE.json'),'utf8'));const mismatches=[];
 for(const[table,records]of Object.entries(before.records)){const now=new Map(data[table].map(row=>[row.id,row]));for(const record of records)if(!now.has(record.id)||hash(now.get(record.id))!==record.hash)mismatches.push({table,id:record.id});if(records.length!==now.size)mismatches.push({table,before:records.length,after:now.size});}
 const published=agents.filter(row=>row.status==='PUBLISHED'&&row.onlineVersionId);const enabled=skills.filter(row=>row.enabledAt&&row.currentRevision>0);
 const prior=JSON.parse(readFileSync(resolve(base,'../v1/PRESERVATION-BASELINE.json'),'utf8'));
 function originalCanonical(value){if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(originalCanonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(key=>key!=='expertDefinition').sort().map(key=>[key,originalCanonical(value[key])]));return value;}
 const originalAgentMismatches=prior.records.agents.filter(record=>{const row=agents.find(x=>x.id===record.id);return !row||createHash('sha256').update(JSON.stringify(originalCanonical(row))).digest('hex')!==record.hash;}).map(record=>record.id);
 const report={generatedAt:new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'})+' Asia/Shanghai',schemaChange:'official_skill.custom_avatar_path nullable, default null',before:Object.fromEntries(Object.entries(before.records).map(([key,rows])=>[key,rows.length])),after:{experts:agents.length,published:published.length,draft:agents.filter(row=>row.status==='DRAFT').length,versions:versions.length,skills:skills.length,enabledSkills:enabled.length,packages:packages.length,links:links.length,grants:grants.length},preserved:mismatches.length===0,mismatches,originalExpertFullRowEvidence:{records:prior.records.agents.length,mismatches:originalAgentMismatches,includesPriorAvatarPath:true},iconPaths:{expertsWithUpload:agents.filter(row=>row.customAvatarPath).length,skillsWithUpload:skills.filter(row=>row.customAvatarPath).length,newSkillIconColumnAllNull:skills.every(row=>row.customAvatarPath===null)},facets:{allExperts:catalogFacets('expert',agents.map(row=>row.key)),publishedExperts:catalogFacets('expert',published.map(row=>row.key)),enabledSkills:catalogFacets('skill',enabled.map(row=>row.key))},displayOverrides:{experts:agents.filter(row=>displaySummary(row.key,row.summary)!==row.summary).length,publishedExperts:published.filter(row=>{const version=versions.find(v=>v.id===row.onlineVersionId);return version&&displaySummary(row.key,version.summary)!==version.summary;}).length,skills:enabled.filter(row=>displaySummary(row.key,row.summary)!==row.summary).length},noBusinessDataWrites:true,hashExclusion:'customAvatarPath only (new skill column); all prior content/revisions/status/permissions/timestamps compared'};
 writeFileSync(resolve(base,'PRESERVATION-RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(mismatches.length)process.exitCode=1;
}finally{await db.$disconnect();}
