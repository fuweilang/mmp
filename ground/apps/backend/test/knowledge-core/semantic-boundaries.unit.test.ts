import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chunkSections} from '../../src/knowledge-core/chunking';
import {parseKnowledgeBytes} from '../../src/knowledge-core/parser';
const chars={encoding:'test-char',count:(s:string)=>Array.from(s).length};
test('an intact paragraph or sentence may exceed target while remaining within maximum',()=>{
 const sentence='这是一句需要完整保留的中文说明，不能从句子中间截断。';
 const chunks=chunkSections([{text:sentence.repeat(3),locator:{}}],{targetTokens:15,maxTokens:40,overlapTokens:0,tokenCounter:chars});
 assert.equal(chunks[0].sourceText,sentence);
 assert.ok(chunks.every(c=>c.text.endsWith('。')&&c.tokenCount<=40));
 const paragraph='First complete paragraph.\n\n';
 const rows=chunkSections([{text:paragraph.repeat(4),locator:{}}],{targetTokens:15,maxTokens:30,overlapTokens:0,tokenCounter:chars});
 assert.equal(rows[0].text,paragraph);
});
test('Markdown packs neighboring complete questions and never splits a question that fits the maximum',async()=>{
 const blocks=Array.from({length:12},(_,i)=>`## Q${i+1}\nThis is an answer.\n\nThis is its important conclusion.\n\n`);
 const source='# FAQ\n\n'+blocks.join('');const parsed=await parseKnowledgeBytes('faq.md',Buffer.from(source));
 const chunks=chunkSections(parsed.sections,{targetTokens:90,maxTokens:145,overlapTokens:0,tokenCounter:chars});
 for(const c of chunks){assert.ok(c.sourceEnd===source.length||source.slice(c.sourceEnd).startsWith('## Q'),'end at an intact question boundary');assert.equal(c.sourceText,source.slice(c.sourceStart,c.sourceEnd));assert.ok(c.tokenCount<=145);}
 assert.equal(chunks.map(c=>c.text).join(''),source);
});
test('overlap uses complete sentences and is bounded instead of starting inside a sentence',()=>{
 const sentence='这是一个完整句子。';const source=sentence.repeat(20);
 const chunks=chunkSections([{text:source,locator:{}}],{targetTokens:30,maxTokens:40,overlapTokens:14,tokenCounter:chars});
 assert.ok(chunks.some((c,i)=>i>0&&c.sourceStart<chunks[i-1].sourceEnd),'retain real overlap');
 for(const c of chunks){assert.equal(c.sourceStart%sentence.length,0);assert.equal(c.sourceEnd%sentence.length,0);}
 for(let i=1;i<chunks.length;i++){assert.ok(chunks[i].sourceStart>chunks[i-1].sourceStart);assert.ok(chars.count(source.slice(chunks[i].sourceStart,chunks[i-1].sourceEnd))<=14);}
});
test('an oversized unbroken sentence falls back to whole words and ultimately graphemes under the hard maximum',()=>{
 const source='elephant '.repeat(30);const chunks=chunkSections([{text:source,locator:{}}],{targetTokens:13,maxTokens:20,overlapTokens:0,tokenCounter:chars});
 assert.ok(chunks.every(c=>c.text.trim()==='elephant'||c.text.trim()==='elephant elephant'));
 assert.equal(chunks.map(c=>c.text).join(''),source);
 const long='🧑🏽‍💻'.repeat(20);const atoms=chunkSections([{text:long,locator:{}}],{targetTokens:5,maxTokens:8,overlapTokens:0,tokenCounter:chars});
 assert.equal(atoms.map(c=>c.text).join(''),long);assert.ok(atoms.every(c=>c.text.split('🧑🏽‍💻').join('')===''));
});
test('reduce overlap rather than split the next complete sentence when it fits the maximum on its own',()=>{
 const a='甲'.repeat(39)+'。',b='乙'.repeat(19)+'。',c='丙'.repeat(89)+'。',d='丁'.repeat(29)+'。';
 const chunks=chunkSections([{text:a+b+c+d,locator:{}}],{targetTokens:60,maxTokens:100,overlapTokens:20,tokenCounter:chars});
 assert.ok(chunks.some(row=>row.text===c),'the90-character sentence must not be split to retain20 characters of overlap');
 assert.ok(chunks.every(row=>row.tokenCount<=100));
});
test('keep a short preceding question rather than cut the next question just to fill the target',async()=>{
 const source='# FAQ\n\n## A\n'+'甲'.repeat(70)+'\n\n## B\n'+'乙'.repeat(160)+'\n\n';
 const parsed=await parseKnowledgeBytes('faq.md',Buffer.from(source));
 const chunks=chunkSections(parsed.sections,{targetTokens:200,maxTokens:220,overlapTokens:0,tokenCounter:chars});
 assert.equal(chunks[0].sourceEnd,source.indexOf('## B'));
 assert.ok(chunks.some(c=>c.text.includes('## B')&&c.text.includes('乙'.repeat(160))));
});
