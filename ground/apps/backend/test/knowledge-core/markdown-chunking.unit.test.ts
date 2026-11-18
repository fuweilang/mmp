import 'reflect-metadata';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseKnowledgeBytes} from '../../src/knowledge-core/parser';
import {chunkSections} from '../../src/knowledge-core/chunking';
const source='# Product FAQ\n\n'+Array.from({length:30},(_,i)=>`## Question ${i+1}\nAnswer ${i+1}: ${'Keep original source and useful context. '.repeat(5)}\n\n`).join('');
test('Markdown token controls pack short titled answers rather than forcing one chunk per heading',async()=>{
 const parsed=await parseKnowledgeBytes('faq.md',Buffer.from(source));
 const split=(targetTokens:number,maxTokens:number,overlapTokens:number)=>chunkSections(parsed.sections,{targetTokens,maxTokens,overlapTokens});
 const small=split(150,220,20),large=split(500,650,20),overlap=split(500,650,90);
 assert.ok(small.length>large.length,'target must change actual titled FAQ packing');
 assert.ok(large.length<15,'short heading sections must merge');
 assert.notDeepEqual(large.map(c=>c.sourceStart),overlap.map(c=>c.sourceStart));
 const canonical=parsed.sections.map(s=>s.text).join('');assert.equal(canonical,source,'preserve the original Markdown, including heading separators');
 let covered=0;for(const c of overlap){assert.equal(c.sourceText,source.slice(c.sourceStart,c.sourceEnd));assert.ok(c.sourceStart<=covered);covered=Math.max(covered,c.sourceEnd);assert.ok(c.tokenCount<=650);assert.ok(c.locator.paragraph);assert.ok(!c.text.includes('\ufffd'));}assert.equal(covered,source.length);
 assert.ok(large.some(c=>c.text.includes('## Question 1')&&c.text.includes('## Question 2')));
 const mixed=large.find(c=>c.text.includes('## Question 1')&&c.text.includes('## Question 2'))!;
 assert.deepEqual(mixed.locator.headingPath,['Product FAQ'],'a mixed chunk must not claim only its first child heading');
 assert.ok(mixed.locator.headingPaths?.some(p=>p.includes('Question 2')),'retain every covered heading path');
});
test('packed Markdown title metadata still distinguishes explicitly named methods',async()=>{
 const {focusNamedHeadings}=await import('../../src/knowledge-core/retrieval');
 const rows=[{chunkId:'other',text:'unrelated',locator:{headingPath:['FAQ']}},{chunkId:'matched',text:'source',locator:{headingPath:['FAQ'],headingPaths:[['FAQ','AIDA模型'],['FAQ','RAG说明']]}}] as any;
 assert.equal(focusNamedHeadings(rows,'请解释 AIDA 方法')[0].chunkId,'matched');
});
test('Markdown leading blank lines do not shift original paragraph locations',async()=>{
 const source='\n'.repeat(10)+'# T\n\nParagraph one has five words.\n\n## Next\n\nParagraph two has five words.';
 const parsed=await parseKnowledgeBytes('leading.md',Buffer.from(source));
 assert.equal(parsed.sections[0].paragraphOffsets?.[0].offset,10);
 const chunks=chunkSections(parsed.sections,{targetTokens:4,maxTokens:5,overlapTokens:0});
 const heading=chunks.find(c=>c.text.trim()==='# T');assert.ok(heading);assert.equal(heading.locator.paragraph,1);
 for(const c of chunks)assert.equal(c.sourceText,source.slice(c.sourceStart,c.sourceEnd));
});
