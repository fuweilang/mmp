import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { validateKnowledgeProfileDependency } from '../../src/knowledge-core/profiles.service';
import { KNOWLEDGE_PARSER_VERSION } from '../../src/knowledge-core/index-config';
import { parseKnowledgeBytes } from '../../src/knowledge-core/parser';
import { chunkSections } from '../../src/knowledge-core/chunking';
import { KnowledgeHttpAdapter, validateEmbeddingVector } from '../../src/knowledge-core/provider';
import { createServer, Server } from 'node:http';

async function boundary(
  handler: Parameters<typeof createServer>[0],
  run: (endpoint: string) => Promise<void>,
) {
  const server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    await run(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/v1/embeddings`,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
}
const profile = {
  id: 'p',
  task: 'EMBEDDING',
  model: 'test-model',
  dimension: 2,
  tokenizer: 'cl100k_base',
  timeoutMs: 1000,
  batchSize: 2,
  maxInputTokens: 100,
  maxResponseBytes: 4096,
};
const usage: unknown[] = [];
function adapter(endpoint: string, patch: Record<string, unknown> = {}) {
  return new KnowledgeHttpAdapter({
    resolveForRequest: async () => ({
      ...profile,
      endpoint,
      apiKey: 'fake-secret',
      ...patch,
    }),
    recordUsage: async (u: unknown) => {
      usage.push(u);
    },
  } as any);
}

test('CSV quoted multiline cells retain one logical row and repeated header', async () => {
  const out = await parseKnowledgeBytes(
    'x.csv',
    Buffer.from('名称,说明\r\n甲,"第一行\n第二行"\r\n乙,"含,逗号"\r\n'),
  );
  assert.equal(out.status, 'READY');
  assert.equal(out.sections.length, 2);
  assert.deepEqual(
    out.sections.map((s) => [s.locator.rowStart, s.locator.rowEnd]),
    [
      [2, 2],
      [3, 3],
    ],
  );
  assert.equal(out.sections[0].tableHeader, '名称 | 说明');
  assert.match(out.sections[0].text, /第一行\\n第二行/);
});
test('text preserves paragraph and heading locators; extraction limits are PARTIAL', async () => {
  const out = await parseKnowledgeBytes(
    'x.md',
    Buffer.from('# 标题\n\n第一段\n\n末尾'),
    { maxChars: 6 },
  );
  assert.equal(out.status, 'PARTIAL');
  assert.ok(out.sections.length);
  assert.equal(out.truncated, true);
  assert.equal(out.sections[0].locator.paragraph, 1);
});
test('unsupported, invalid UTF8, empty and scanned-like documents never become ready', async () => {
  assert.equal(
    (await parseKnowledgeBytes('x.png', Buffer.from('x'))).status,
    'DOWNLOAD_ONLY',
  );
  assert.equal(
    (await parseKnowledgeBytes('x.txt', Buffer.from([0xff]))).status,
    'FAILED',
  );
  assert.equal(
    (await parseKnowledgeBytes('x.txt', Buffer.from('  '))).status,
    'DOWNLOAD_ONLY',
  );
});
test('DOCX paragraphs survive; expanded XML and entity declarations are bounded', async () => {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    '<w:document><w:body><w:p><w:r><w:t>甲</w:t></w:r></w:p><w:p><w:r><w:t>乙</w:t></w:r></w:p></w:body></w:document>',
  );
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const out = await parseKnowledgeBytes('x.docx', bytes);
  assert.deepEqual(
    out.sections.map((s) => s.text),
    ['甲', '乙'],
  );
  assert.deepEqual(
    out.sections.map((s) => s.locator.paragraph),
    [1, 2],
  );
  assert.equal(
    (await parseKnowledgeBytes('x.docx', bytes, { maxXmlBytes: 20 })).status,
    'PARTIAL',
  );
  zip.file(
    'word/document.xml',
    '<!DOCTYPE x [<!ENTITY x "oops">]><w:document/>',
  );
  assert.equal(
    (
      await parseKnowledgeBytes(
        'x.docx',
        await zip.generateAsync({ type: 'nodebuffer' }),
      )
    ).status,
    'FAILED',
  );
});
test('embedding response reorders valid indexed vectors and batches without fabricated usage', async () => {
  usage.length = 0;
  await boundary(
    (req, res) => {
      let body = '';
      req.on('data', (b) => (body += b));
      req.on('end', () => {
        assert.equal(req.headers.authorization, 'Bearer fake-secret');
        const payload = JSON.parse(body);
        assert.equal(payload.model, 'test-model');
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            data: payload.input
              .map((_: unknown, i: number) => ({
                index: i,
                embedding: [i + 1, 1],
              }))
              .reverse(),
            usage: { total_tokens: 7 },
          }),
        );
      });
    },
    async (endpoint) => {
      const out = await adapter(endpoint).embed('p', ['甲', '乙', '丙']);
      assert.deepEqual(out.vectors, [
        [1, 1],
        [2, 1],
        [1, 1],
      ]);
      assert.equal(out.actualTokens, 14);
      assert.ok(out.estimatedTokens > 0);
    },
  );
});
test('embedding malformed indices, dimensions, zero and nonfinite vectors fail permanently', async () => {
  for (const data of [
    [
      { index: 0, embedding: [1, 2] },
      { index: 0, embedding: [3, 4] },
    ],
    [
      { index: 0, embedding: [1] },
      { index: 1, embedding: [2, 3] },
    ],
    [
      { index: 0, embedding: [0, 0] },
      { index: 1, embedding: [2, 3] },
    ],
    [
      { index: 0, embedding: [1, null] },
      { index: 1, embedding: [2, 3] },
    ],
  ]) {
    await boundary(
      (_req, res) => res.end(JSON.stringify({ data })),
      async (endpoint) => {
        await assert.rejects(
          () => adapter(endpoint).embed('p', ['a', 'b']),
          (e: any) => e.code === 'UPSTREAM_INVALID_RESPONSE' && !e.transient,
        );
      },
    );
  }
});
test('rerank rejects duplicate/out of range indices and never returns upstream document URLs', async () => {
  await boundary(
    (_req, res) =>
      res.end(
        JSON.stringify({
          results: [
            {
              index: 4,
              relevance_score: 0.9,
              document: { text: 'https://secret' },
            },
          ],
        }),
      ),
    async (endpoint) => {
      await assert.rejects(
        () =>
          adapter(endpoint, { task: 'RERANK', dimension: null }).rerank(
            'p',
            'q',
            ['a', 'b'],
            2,
          ),
        (e: any) => e.code === 'UPSTREAM_INVALID_RESPONSE',
      );
    },
  );
  await boundary(
    (_req, res) =>
      res.end(
        JSON.stringify({
          results: [
            {
              index: 0,
              relevance_score: 0.9,
              document: { text: 'https://secret' },
            },
          ],
        }),
      ),
    async (endpoint) => {
      assert.deepEqual(
        (
          await adapter(endpoint, { task: 'RERANK', dimension: null }).rerank(
            'p',
            'q',
            ['a'],
            1,
          )
        ).results,
        [{ index: 0, score: 0.9 }],
      );
    },
  );
});
test('timeout and HTTP errors are safe transient codes; bytes and request tokens are bounded', async () => {
  await boundary(
    (_req, _res) => {},
    async (endpoint) => {
      await assert.rejects(
        () => adapter(endpoint, { timeoutMs: 20 }).embed('p', ['a']),
        (e: any) => e.code === 'UPSTREAM_TIMEOUT' && e.transient,
      );
    },
  );
  await boundary(
    (_req, res) => {
      res.statusCode = 503;
      res.end('fake-secret https://credential.example');
    },
    async (endpoint) => {
      await assert.rejects(
        () => adapter(endpoint).embed('p', ['a']),
        (e: any) =>
          e.code === 'UPSTREAM_UNAVAILABLE' &&
          !JSON.stringify(e).includes('fake-secret'),
      );
    },
  );
  await boundary(
    (_req, res) => res.end('x'.repeat(5000)),
    async (endpoint) => {
      await assert.rejects(
        () => adapter(endpoint).embed('p', ['a']),
        (e: any) => e.code === 'UPSTREAM_RESPONSE_TOO_LARGE',
      );
      await assert.rejects(
        () =>
          adapter(endpoint, { maxInputTokens: 1 }).embed('p', ['hello world']),
        (e: any) => e.code === 'INPUT_TOKEN_LIMIT',
      );
    },
  );
});

test('markdown headings carry into later paragraph sections for citation locators', async () => {
  const out = await parseKnowledgeBytes(
    'x.md',
    Buffer.from('# 一章\n\n正文甲\n\n## 二节\n\n正文乙'),
  );
  const chunks = chunkSections(out.sections);
  assert.ok(chunks.some(chunk => chunk.text.includes('正文') && chunk.locator.headingPath?.includes('一章')));
  assert.ok(chunks.some(chunk => chunk.locator.headingPath?.join('/') === '一章/二节'));
});
test('content addressed storage atomically publishes complete bytes for concurrent duplicates', async () => {
  const { KnowledgeBlobStorage } = await import(
    '../../src/knowledge-core/storage'
  );
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'rag-blobs-'));
  const before = process.env.KNOWLEDGE_CORE_DIR;
  process.env.KNOWLEDGE_CORE_DIR = dir;
  try {
    const store = new KnowledgeBlobStorage(),
      bytes = Buffer.alloc(1024 * 1024, 65);
    const out = await Promise.all(
      Array.from({ length: 20 }, () => store.put(bytes)),
    );
    assert.equal(new Set(out.map((x) => x.storageKey)).size, 1);
    assert.deepEqual(await store.read(out[0].storageKey), bytes);
  } finally {
    if (before === undefined) delete process.env.KNOWLEDGE_CORE_DIR;
    else process.env.KNOWLEDGE_CORE_DIR = before;
    await rm(dir, { recursive: true, force: true });
  }
});

function pdfFixture(pageTexts: (string | null)[]): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageTexts.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  pageTexts.forEach((text, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    const stream =
      text === null ? '' : `BT /F1 12 Tf 20 250 Td (${text}) Tj ET`;
    objects.push(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  });
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(source));
    source += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(source);
}
test('text PDF preserves page numbers and extraction caps; no-text PDF is download-only', async () => {
  const out = await parseKnowledgeBytes(
    'x.pdf',
    pdfFixture(['FirstPage', 'TailPage']),
  );
  assert.equal(out.status, 'READY');
  assert.deepEqual(
    out.sections.map((s) => s.locator.page),
    [1, 2],
  );
  assert.match(out.sections[1].text, /TailPage/);
  const partial = await parseKnowledgeBytes(
    'x.pdf',
    pdfFixture(['FirstPage', 'TailPage']),
    { maxPdfPages: 1 },
  );
  assert.equal(partial.status, 'PARTIAL');
  assert.equal(
    (await parseKnowledgeBytes('scan.pdf', pdfFixture([null]))).status,
    'DOWNLOAD_ONLY',
  );
});

test('CSV extraction record limit is partial while malformed quoting is a parse failure', async () => {
  assert.equal(
    (
      await parseKnowledgeBytes(
        'x.csv',
        Buffer.from('A,B\n"long cell beyond limit",2\n'),
        { maxChars: 10 },
      )
    ).status,
    'PARTIAL',
  );
  assert.equal(
    (await parseKnowledgeBytes('x.csv', Buffer.from('A,B\n"unclosed,2\n')))
      .status,
    'FAILED',
  );
});
test('index configuration rejects invented versions and non-object option containers', async () => {
  const { normalizeKnowledgeIndexConfig } = await import(
    '../../src/knowledge-core/index-config'
  );
  for (const input of [
    [],
    null,
    'x',
    { parserVersion: 'invented' },
    { targetTokens: 0 },
    { targetTokens: 10, maxTokens: 5 },
    { targetTokens: 3, maxTokens: 5, overlapTokens: 3 },
  ]) {
    assert.throws(
      () => normalizeKnowledgeIndexConfig(input as any, 100),
      (e: any) => e.code === 'INVALID_INDEX_CONFIGURATION',
    );
  }
});

test('Markdown chunks use headings active at section entry, then local transitions', async () => {
  const parsed = await parseKnowledgeBytes('headings.md', Buffer.from('# A\n\nIntro\n## B\nBody\n\nTail'));
  const chunks = chunkSections(parsed.sections);
  assert.deepEqual(chunks.find(c => c.sourceText.startsWith('Intro'))?.locator.headingPath, ['A']);
  assert.deepEqual(chunks.find(c => c.sourceText.startsWith('## B'))?.locator.headingPath, ['A', 'B']);
  assert.deepEqual(chunks.find(c => c.sourceText.includes('Tail'))?.locator.headingPath, ['A', 'B']);
});
test('embedding rejects float32 all-zero underflow at the provider boundary', () => {
  assert.throws(() => validateEmbeddingVector([1e-50, 0], 2), { code: 'UPSTREAM_INVALID_RESPONSE' });
  assert.deepEqual(validateEmbeddingVector([1e-40, 0], 2), [1e-40, 0]);
});


test('DOCX inherited heading and outline paths survive actual chunking and new parser identity', async () => {
  const zip = new JSZip();
  zip.file('word/styles.xml', '<w:styles xmlns:w="urn:word"><w:style w:styleId="RefundTitle"><w:basedOn w:val="Heading1"/></w:style></w:styles>');
  zip.file('word/document.xml', '<w:document xmlns:w="urn:word"><w:body><w:p><w:pPr><w:pStyle w:val="RefundTitle"/></w:pPr><w:r><w:t>Refund policy</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Deadlines</w:t></w:r></w:p><w:p><w:r><w:t>Refund within three days.</w:t></w:r></w:p><w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:r><w:t>Other</w:t></w:r></w:p></w:body></w:document>');
  const result = await parseKnowledgeBytes('headings.docx', await zip.generateAsync({type:'nodebuffer'}));
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.sections.map(s=>s.locator.headingPath), [['Refund policy'],['Refund policy','Deadlines'],['Refund policy','Deadlines'],['Other']]);
  const chunks = chunkSections(result.sections, {targetTokens:40,maxTokens:80,overlapTokens:0});
  assert.ok(chunks.some(c=>c.text.includes('three days') && c.locator.headingPath?.join('/') === 'Refund policy/Deadlines'));
  assert.equal(KNOWLEDGE_PARSER_VERSION, 'knowledge-parser-v4');
});


test('rerank uses one globally ranked prefix within immutable profile capacity', async () => {
  const received: string[][]=[];
  await boundary((req,res)=>{let data='';req.on('data',p=>data+=p);req.on('end',()=>{const body=JSON.parse(data);received.push(body.documents);res.setHeader('content-type','application/json');res.end(JSON.stringify({results:body.documents.map((_:string,index:number)=>({index,relevance_score:index})),usage:{total_tokens:2}}));});}, async endpoint=>{
    for (const size of [16,32,3,1]) {
      const texts=Array.from({length:20},(_,i)=>`candidate ${i}`);
      const result=await adapter(endpoint,{task:'RERANK',dimension:null,batchSize:size}).rerank('p','query',texts,20);
      assert.deepEqual(received.at(-1),texts.slice(0,size));
      assert.equal(result.inputCount,Math.min(size,20));
      assert.equal(result.results.length,Math.min(size,20));
    }
  });
});

test('publication and request dependency validation reject invalid immutable capacity explicitly',()=>{
 for(const batchSize of [0,129,1.5])assert.throws(()=>validateKnowledgeProfileDependency({...profile,task:'RERANK',adapter:'COMPATIBLE_RERANK',enabled:true,endpoint:'https://supplier.invalid/rerank',batchSize} as any,{enabled:false,apiKeyEnc:null},'RERANK'),(e:any)=>e.code==='PROFILE_INVALID_CONFIGURATION');
});

test('Markdown keeps a named method and its short paragraphs together without crossing the next heading', async () => {
  const source = '# 文案库\n\n## AIDA模型 🦣\n\nAttention：吸引注意。\n\nInterest：培养兴趣。\n\nDesire：激发欲望。\n\nAction：促成行动。\n\n## PAS方法\n\n这是另一种方法。';
  const parsed = await parseKnowledgeBytes('methods.md', Buffer.from(source));
  const chunks = chunkSections(parsed.sections, { targetTokens: 192, maxTokens: 256, overlapTokens: 0 });
  const method = chunks.find(chunk => chunk.text.includes('AIDA模型') && chunk.text.includes('Action：促成行动'));
  assert.ok(method, 'Heading-only and single-step fragments must not replace the complete short method');
  assert.ok(method.text.includes('Attention：吸引注意') && method.text.includes('Desire：激发欲望'));
  assert.ok(!method.text.includes('PAS方法'));
  assert.ok(source.includes(method.sourceText));
  const canonical = parsed.sections.map(section => section.text).join('');
  for (const chunk of chunks) assert.equal(canonical.slice(chunk.sourceStart, chunk.sourceEnd), chunk.sourceText);
});

test('grouped Markdown retains later paragraph locations and UTF16 source ranges after splitting', async () => {
  const source = '# 方法🦣\n\n' + '第一段内容。'.repeat(120) + '\n\n' + '第二段内容。'.repeat(120) + '\n\n' + '末段完整。'.repeat(80);
  const parsed = await parseKnowledgeBytes('long-method.md', Buffer.from(source));
  const chunks = chunkSections(parsed.sections, {targetTokens:40,maxTokens:80,overlapTokens:0});
  assert.ok(chunks.length > 10);
  assert.equal(chunks.at(-1)?.locator.paragraph, 4);
  assert.ok(chunks.at(-1)?.sourceText.endsWith('末段完整。'));
  const canonical = parsed.sections.map(section => section.text).join('');
  assert.equal(chunks.map(chunk=>chunk.sourceText).join(''), canonical);
  for (const chunk of chunks) assert.equal(canonical.slice(chunk.sourceStart, chunk.sourceEnd), chunk.sourceText);
  const partial = await parseKnowledgeBytes('long-method.md', Buffer.from(source), {maxChars:100});
  assert.equal(partial.status, 'PARTIAL');
  assert.ok(partial.sections.reduce((total,section)=>total+section.text.length,0) <= 100);
});
