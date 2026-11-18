import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {parseKnowledgeBytes} from '../../src/knowledge-core/parser';
import {chunkSections} from '../../src/knowledge-core/chunking';
import {createTokenCounter} from '../../src/knowledge-core/tokenizer';
const counter=createTokenCounter('cl100k_base');
async function document(){
 const zip=new JSZip();
 const p=(t:string,heading=false)=>`<w:p>${heading?'<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>':''}<w:r><w:t>${t}</w:t></w:r></w:p>`;
 const rows=[p('Chapter A',true),...Array.from({length:35},(_,i)=>p(`Paragraph ${i}: The customer must submit the order number to request a refund. 😀`)),p('Chapter B',true),p('Unrelated second chapter.')];
 zip.file('word/document.xml',`<w:document xmlns:w="urn:word"><w:body>${rows.join('')}</w:body></w:document>`);
 return zip.generateAsync({type:'nodebuffer'});
}
test('Word joins short paragraphs within a heading and preserves canonical source and paragraph ranges',async()=>{
 const parsed=await parseKnowledgeBytes('file.docx',await document());
 assert.equal(parsed.sections.length,2);
 const source=parsed.sections.map(s=>s.text).join('');
 const chunks=chunkSections(parsed.sections,{targetTokens:120,maxTokens:180,overlapTokens:20,tokenCounter:counter});
 assert.ok(chunks.length<20);
 for(const c of chunks){assert.equal(c.sourceText,source.slice(c.sourceStart,c.sourceEnd));assert.ok(c.tokenCount<=180);assert.ok(c.locator.paragraph);assert.ok(c.locator.headingPath?.length);assert.ok(!c.text.includes('\ufffd'));}
 assert.ok(chunks.some(c=>(c.locator.paragraphEnd??0)>(c.locator.paragraph??0)));
 assert.ok(chunks.filter(c=>c.locator.headingPath?.[0]==='Chapter A').every(c=>!c.text.includes('Chapter B')));
});
test('Word target and overlap affect actual chunks; overlap stays inside heading and preserves all source characters',async()=>{
 const p=await parseKnowledgeBytes('file.docx',await document());
 const split=(targetTokens:number,overlapTokens:number)=>chunkSections(p.sections,{targetTokens,maxTokens:200,overlapTokens,tokenCounter:counter});
 const small=split(60,0),large=split(150,0),overlap=split(150,40);
 assert.ok(small.length>large.length);assert.notDeepEqual(overlap.map(c=>c.sourceStart),large.map(c=>c.sourceStart));
 assert.ok(overlap.some((c,i)=>i>0&&c.sourceStart<overlap[i-1].sourceEnd));
 for(const section of p.sections){const rows=overlap.filter(c=>JSON.stringify(c.locator.headingPath)===JSON.stringify(section.locator.headingPath));let covered=section.sourceOffset!;for(const c of rows){assert.ok(c.sourceStart<=covered);covered=Math.max(covered,c.sourceEnd);}assert.equal(covered,section.sourceOffset!+section.text.length);}
});
test('hard maximum constrains paragraph-boundary expansion around the soft target',()=>{
 const text=('word '.repeat(70)+'\n\n').repeat(3);
 const section={text,locator:{paragraph:1},paragraphOffsets:[{offset:0,paragraph:1},{offset:352,paragraph:2},{offset:704,paragraph:3}]};
 const strict=chunkSections([section],{targetTokens:120,maxTokens:125,overlapTokens:0,tokenCounter:counter});
 const roomy=chunkSections([section],{targetTokens:120,maxTokens:180,overlapTokens:0,tokenCounter:counter});
 assert.ok(strict.every(c=>c.tokenCount<=125));assert.ok(roomy.every(c=>c.tokenCount<=180));
 assert.notDeepEqual(strict.map(c=>c.sourceEnd),roomy.map(c=>c.sourceEnd));
});
