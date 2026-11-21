import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shellBundleUrls } from './agent-shell-prefetch';

const html = `<html><head><script>globalThis["__MMP_BOOT__"] = ${JSON.stringify({
  rev: '1',
  entries: [
    { id: '@mammoth-ai/mmp-client-ui-renderer' },
    { id: '@mammoth-ai/mmp-client-ui-layout', inject: ['@mammoth-ai/mmp-client-ui-renderer'] },
    { id: 'later' },
  ],
  batches: [
    { phase: 'bootstrap', url: 'plugins/boot.js', entries: ['@mammoth-ai/mmp-client-modules'] },
    { phase: 'application', url: 'plugins/shell.js', entries: ['@mammoth-ai/mmp-client-ui-renderer', '@mammoth-ai/mmp-client-ui-layout'] },
    { phase: 'application', url: 'https://evil.example/plugins/later.js', entries: ['@mammoth-ai/mmp-client-ui-renderer'] },
    { phase: 'application', url: 'plugins/later.js', entries: ['later'] },
  ],
})}</script></head></html>`;

describe('shellBundleUrls', () => {
  it('keeps the shell batches on the agent origin', () => {
    assert.deepEqual(shellBundleUrls(html, 'https://www.mmai.vip/agent/'), [
      'https://www.mmai.vip/agent/plugins/boot.js',
      'https://www.mmai.vip/agent/plugins/shell.js',
    ]);
  });

  it('returns nothing when the page has no boot graph', () => {
    assert.deepEqual(shellBundleUrls('<html></html>', 'https://www.mmai.vip/agent/'), []);
  });
});
