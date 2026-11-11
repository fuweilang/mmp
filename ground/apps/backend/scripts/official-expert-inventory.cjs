require('reflect-metadata');
const {readFile}=require('node:fs/promises');
const {NestFactory}=require('@nestjs/core');
const {PrismaClient}=require('@prisma/client');
const {legacyExpertInventory,shadowMigrationPlan,applyOfficialShadow}=require('../dist/official-agent/legacy-inventory');
async function main(){
 const url=process.env.RAG_TEST_DATABASE_URL;
 if(!url?.startsWith('postgresql://rag_test:')||!url.includes('@127.0.0.1:55441/mmp_rag_acceptance'))throw Error('DEDICATED_DB_REQUIRED');
 process.env.DATABASE_URL=url;
 const arg=key=>{const i=process.argv.indexOf(key);if(i<0||!process.argv[i+1]||process.argv[i+1].startsWith('--'))throw Error(`REQUIRED_ARGUMENT ${key}`);return process.argv[i+1];};
 if(process.argv.includes('--apply-shadow')){
  const actorUserId=arg('--actor'),baseId=arg('--base'),profileId=arg('--profile');
  const plan=JSON.parse(await readFile(arg('--plan'),'utf8'));
  if(plan.operation!=='SHADOW_PLAN_ONLY'||!Array.isArray(plan.items))throw Error('REVIEWED_SHADOW_PLAN_REQUIRED');
  const {KnowledgeCoreModule}=require('../dist/knowledge-core/knowledge-core.module');
  const {KnowledgeCoreService}=require('../dist/knowledge-core/knowledge-core.service');
  const {PrismaService}=require('../dist/prisma/prisma.service');
  const app=await NestFactory.createApplicationContext(KnowledgeCoreModule,{logger:false,abortOnError:false});
  try{console.log(JSON.stringify(await applyOfficialShadow(app.get(PrismaService),app.get(KnowledgeCoreService),{actorUserId,baseId,profileId,items:plan.items}),null,2));}finally{await app.close();}
  return;
 }
 const db=new PrismaClient({datasources:{db:{url}}});
 try{const inventory=await legacyExpertInventory(db);console.log(JSON.stringify(process.argv.includes('--shadow-plan')?shadowMigrationPlan(inventory):inventory,null,2));}finally{await db.$disconnect();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
