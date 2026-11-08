#!/usr/bin/env node
// t149 read-only repeatable snapshot. Only counts, IDs and hashes are persisted.
import {createRequire} from 'node:module';
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env','.env.local']) { const p=resolve(root,name); if(existsSync(p)) for(const line of readFileSync(p,'utf8').split('\n')) {const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}}
const require=createRequire(resolve(root,'package.json'));const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();

const dest=process.env.MMP_GALLERY_EVIDENCE_DIR ? resolve(process.env.MMP_GALLERY_EVIDENCE_DIR) : resolve(root,'src/official-agent/assets/managed/business-v3');
mkdirSync(dest,{recursive:true});
function canonical(v){if(v instanceof Date)return v.toISOString();if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
try{
 const rows=await db.$transaction([db.officialAgent.findMany({orderBy:{id:'asc'}}),db.officialAgentVersion.findMany({orderBy:{id:'asc'}}),db.officialSkill.findMany({orderBy:{id:'asc'}}),db.officialSkillPackage.findMany({orderBy:{id:'asc'}}),db.officialAgentSkillLink.findMany({orderBy:{id:'asc'}}),db.officialAgentTenantGrant.findMany({orderBy:{id:'asc'}})],{isolationLevel:'RepeatableRead'});
 const names=['experts','versions','skills','packages','links','grants'];
 const records=Object.fromEntries(names.map((name,i)=>[name,rows[i].map(row=>({id:row.id,hash:hash(row)}))]));
 const counts={experts:rows[0].length,published:rows[0].filter(r=>r.status==='PUBLISHED').length,draft:rows[0].filter(r=>r.status==='DRAFT').length,versions:rows[1].length,skills:rows[2].length,enabledSkills:rows[2].filter(r=>r.enabledAt).length,packages:rows[3].length,links:rows[4].length,grants:rows[5].length};
 const report={capturedAt:new Date().toISOString(),counts,hashes:Object.fromEntries(names.map(name=>[name,hash(records[name])])),records,exclusion:'none: all six-table fields including discoveryDetail and timestamps included'};
 const before=resolve(dest,'BASELINE.json');
 if(process.argv.includes('--capture')){if(existsSync(before))throw Error('Baseline exists, no overwrite');writeFileSync(before,JSON.stringify(report,null,2)+'\n');}
 else{const previous=JSON.parse(readFileSync(before,'utf8'));report.before=previous.counts;report.mismatches=names.filter(name=>previous.hashes[name]!==report.hashes[name]);report.preserved=report.mismatches.length===0;writeFileSync(resolve(dest,'RESULT.json'),JSON.stringify(report,null,2)+'\n');if(!report.preserved)process.exitCode=1;}
 console.log(JSON.stringify({counts,hashes:report.hashes,preserved:report.preserved,mismatches:report.mismatches},null,2));
}finally{await db.$disconnect();}
