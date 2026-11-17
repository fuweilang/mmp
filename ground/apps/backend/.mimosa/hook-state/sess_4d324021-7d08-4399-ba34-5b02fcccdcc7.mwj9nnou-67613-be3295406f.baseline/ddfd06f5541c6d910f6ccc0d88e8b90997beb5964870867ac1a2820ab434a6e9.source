import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkEmbeddingInput } from '../../src/knowledge-core/embedding-input';
import { DEFAULT_TOKEN_COUNTER, countTokens } from '../../src/knowledge-core/tokenizer';

test('method continuations retain their specific heading only in the embedding input', () => {
  const chunk = {text:'欲望激发技巧：描绘拥有后的美好状态。',locator:{headingPath:['文案库','现代说服框架','AIDA模型升级版']}};
  const before=JSON.stringify(chunk);
  const input=chunkEmbeddingInput(chunk,DEFAULT_TOKEN_COUNTER,384);
  assert.ok(input.includes('AIDA模型升级版'));
  assert.ok(input.endsWith(chunk.text));
  assert.equal(JSON.stringify(chunk),before);
});
test('heading context never pushes the original text over the immutable provider token bound', () => {
  const text='必须保留的原文🦣';
  const chunk={text,locator:{headingPath:['不相关祖先'.repeat(1000),'非常长的章节🦣'.repeat(500)]}};
  const input=chunkEmbeddingInput(chunk,DEFAULT_TOKEN_COUNTER,60);
  assert.ok(input.endsWith(text));
  assert.ok(countTokens(input)<=60);
  assert.ok(!input.includes('\ufffd'));
  assert.equal(chunkEmbeddingInput(chunk,DEFAULT_TOKEN_COUNTER,countTokens(text)),text);
});
