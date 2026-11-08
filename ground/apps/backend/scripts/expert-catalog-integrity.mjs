#!/usr/bin/env node
// Read-only preservation evidence; never print DB credentials or prompt bodies.
import { createRequire } from 'node:module';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env','.env.local']) { const p=resolve(root,name); if(existsSync(p)) for(const line of readFileSync(p,'utf8').split('\n')) {const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}}
const require=createRequire(resolve(root,'package.json'));const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
function canonical(v){if(v instanceof Date)return v.toISOString();if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).filter(k=>k!=='expertDefinition').sort().map(k=>[k,canonical(v[k])]));return v;}
function hash(v){return createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');}
const dest=resolve(root,'src/official-agent/assets/managed/v1/PRESERVATION-BASELINE.json');mkdirSync(dirname(dest),{recursive:true});
try {const [agents,versions,skills,packages,links,grants,documents]=await Promise.all([db.officialAgent.findMany(),db.officialAgentVersion.findMany(),db.officialSkill.findMany(),db.officialSkillPackage.findMany(),db.officialAgentSkillLink.findMany(),db.officialAgentTenantGrant.findMany(),db.officialKbDocument.findMany()]);
const data={agents,versions,skills,packages,links,grants,documents};const summary={experts:agents.length,expertDrafts:agents.filter(x=>x.status==='DRAFT').length,expertPublished:agents.filter(x=>x.status==='PUBLISHED').length,versions:versions.length,skills:skills.length,enabledSkills:skills.filter(x=>x.enabledAt).length,skillPackages:packages.length,links:links.length};
if(process.argv.includes('--capture')) {if(existsSync(dest))throw new Error('Baseline already exists; refusing overwrite');writeFileSync(dest,JSON.stringify({summary,records:Object.fromEntries(Object.entries(data).map(([k,rows])=>[k,rows.map(x=>({id:x.id,...(x.key?{key:x.key}:{}),hash:hash(x)}))]))},null,2)+'\n');console.log('Captured',summary);}
else {const old=JSON.parse(readFileSync(dest,'utf8'));const mismatches=[];for(const [table,rows]of Object.entries(old.records)){const now=new Map(data[table].map(x=>[x.id,x]));for(const r of rows)if(!now.has(r.id)||hash(now.get(r.id))!==r.hash)mismatches.push({table,id:r.id,key:r.key});}const report={before:old.summary,after:summary,preservedOriginalRecords:mismatches.length===0,mismatches};writeFileSync(resolve(dirname(dest),'PRESERVATION-RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(mismatches.length)process.exitCode=1;}
}finally{await db.$disconnect();}
