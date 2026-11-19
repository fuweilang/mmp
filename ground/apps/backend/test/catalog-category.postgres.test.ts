import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrismaService } from '../src/prisma/prisma.service';
import { OfficialSkillService } from '../src/official-skill/official-skill.service';
import { CatalogCategoryService } from '../src/catalog-category/catalog-category.service';
const url = process.env.CATEGORY_TEST_DATABASE_URL;
if (!url || !/^postgresql:\/\/category_test:[^@]+@127\.0\.0\.1:\d+\/category_acceptance(?:\?|$)/.test(url)) throw new Error('Dedicated CATEGORY_TEST_DATABASE_URL required; never use application DB');
const db = new PrismaService({datasources:{db:{url}}});
test('real database preserves assignments, renames/reorders, protects references, deletes unused and rejects concurrent overwrite',async()=>{
 try {
  const actor=await db.user.create({data:{phone:`category-${Date.now()}`,passwordHash:'test-only',name:'分类测试'}});
  const service=new CatalogCategoryService(db);
  assert.equal((await db.officialAgent.findUniqueOrThrow({where:{id:'category-fixture-agent'}})).category,'productivity');
  assert.deepEqual((await db.officialSkill.findUniqueOrThrow({where:{id:'category-fixture-skill'}})).categories,['office','writing']);
  for(const kind of ['expert','skill']) {
   const initial=await service.read(kind);
   const next=await service.save(kind,{version:initial.version,items:[{name:'__pending_common'},...initial.items.map(({key,name})=>({key,name}))]},actor.id);
   const added=next.items[0];
   assert.match(added.key,/^cat-/);
   const renamed=await service.save(kind,{version:next.version,items:[...next.items.slice(1),{key:added.key,name:'已改名'}]},actor.id);
   assert.equal(renamed.items.at(-1)?.name,'已改名');
   if(kind==='expert') await db.officialAgent.update({where:{id:'category-fixture-agent'},data:{category:added.key}});
   else await db.officialSkill.update({where:{id:'category-fixture-skill'},data:{categories:[added.key,'writing']}});
   if(kind==='skill') {
    await db.officialSkill.update({where:{id:'category-fixture-skill'},data:{enabledAt:new Date(),currentRevision:1}});
    const publicService=Object.assign(Object.create(OfficialSkillService.prototype),{prisma:db}) as OfficialSkillService;
    const facets=await publicService.catalogFacets();
    assert.equal(facets.capabilities.find(item=>item.id===added.key)?.name,'已改名');
    assert.equal(facets.capabilities.find(item=>item.id===added.key)?.count,1);
    const page=await publicService.catalogPage({capability:added.key});
    assert.equal(page.items[0]?.key,'category-fixture-skill');
    assert.equal(page.items[0]?.discovery.capability,added.key);
    const secondary=await publicService.catalogPage({capability:'writing'});
    assert.equal(secondary.items[0]?.key,'category-fixture-skill');
   }
   const remove={version:renamed.version,items:renamed.items.filter(item=>item.key!==added.key)};
   await assert.rejects(service.save(kind,remove,actor.id),/仍被1个/);
   assert.equal((await service.read(kind)).version,renamed.version);
   if(kind==='expert') await db.officialAgent.update({where:{id:'category-fixture-agent'},data:{category:'productivity'}});
   else await db.officialSkill.update({where:{id:'category-fixture-skill'},data:{categories:['office','writing']}});
   const removed=await service.save(kind,remove,actor.id);
   assert.equal(removed.items.some(item=>item.key===added.key),false);
   const same={version:removed.version,items:removed.items};
   const saves=await Promise.allSettled([service.save(kind,same,actor.id),service.save(kind,same,actor.id)]);
   assert.equal(saves.filter(x=>x.status==='fulfilled').length,1);
   assert.equal(saves.filter(x=>x.status==='rejected').length,1);
  }
  await assert.rejects(db.officialSkill.update({where:{id:'category-fixture-skill'},data:{categories:['missing-category']}}));
  await assert.rejects(db.officialAgent.update({where:{id:'category-fixture-agent'},data:{category:'missing-category'}}));
 } finally {await db.$disconnect();}
});
