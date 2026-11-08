import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lexicalQueryVariants as officialVariants } from '../src/official-agent/official-kb.service';
import { lexicalQueryVariants as enterpriseVariants } from '../src/knowledge/knowledge.service';

/** Simulate official-kb OR-contains match used by search(). */
function matchBody(variants: string[], body: string) {
  return variants.filter((term) => body.includes(term));
}

const HELPERS = [
  ['official-kb', officialVariants],
  ['enterprise-knowledge', enterpriseVariants],
] as const;

describe('lexicalQueryVariants (official + enterprise)', () => {
  for (const [label, lexicalQueryVariants] of HELPERS) {
    describe(label, () => {
      it('old bug: full question yields 方法论智囊 / 帮助用户 that hit body without middle-dot', () => {
        const query = '方法论智囊如何帮助用户';
        const body = '方法论智囊 v1.0\n提供极具操作性的实战建议，帮助用户找到系统性的解决方案。';
        const variants = lexicalQueryVariants(query);
        assert.ok(variants.includes('方法论智囊'), `variants=${JSON.stringify(variants)}`);
        assert.ok(variants.includes('帮助用户'), `variants=${JSON.stringify(variants)}`);
        const hits = matchBody(variants, body);
        assert.ok(hits.includes('方法论智囊') || hits.includes('帮助用户'), `hits=${JSON.stringify(hits)}`);
        // Whole sentence must not be required as the only hit path
        assert.equal(body.includes(query), false);
      });

      it('middle-dot query splits so body with · still matches 方法论 / 智囊', () => {
        const query = '方法论·智囊';
        const body = '方法论·智囊 v1.0\n帮助用户找到系统性的解决方案。';
        const variants = lexicalQueryVariants(query);
        assert.ok(variants.includes('方法论智囊') || variants.includes('方法论'), variants.join('|'));
        assert.ok(variants.includes('方法论') && variants.includes('智囊'), variants.join('|'));
        const hits = matchBody(variants, body);
        assert.ok(hits.some((h) => h === '方法论·智囊' || h === '方法论' || h === '智囊'), hits.join('|'));
      });

      it('strips 请结合官方知识库 / 《》 wrappers and still hits 方法论·智囊 body', () => {
        const query = '请结合官方知识库，说明《方法论·智囊 v1.0》能如何帮助用户？';
        const body = '方法论·智囊 v1.0\n帮助用户找到系统性的解决方案。';
        const variants = lexicalQueryVariants(query);
        assert.ok(variants.includes('方法论智囊') || variants.includes('方法论'), variants.join('|'));
        assert.ok(variants.includes('帮助用户'), variants.join('|'));
        // Wrapper phrase must not be the sole surviving contentful token
        assert.equal(variants.some((v) => v.startsWith('请结合官方知识库') && v.length > 20 && !v.includes('方法论')), false);
        const hits = matchBody(variants, body);
        assert.ok(hits.length > 0, `hits=${JSON.stringify(hits)} variants=${JSON.stringify(variants)}`);
      });

      it('keeps 利基市场 from 请结合知识库分析 … 如何选择', () => {
        const query = '请结合知识库分析 利基市场 如何选择';
        const body = '利基市场知识图谱\n本质特征：明确人群、强烈痛点';
        const variants = lexicalQueryVariants(query);
        assert.ok(variants.includes('利基市场'), `variants=${JSON.stringify(variants)}`);
        const hits = matchBody(variants, body);
        assert.ok(hits.includes('利基市场'), hits.join('|'));
      });

      it('CJK 4-window recovers 渠道分析 from longer title query', () => {
        const query = '苹果销售渠道分析';
        const body = '本公司渠道分析报告指出线下占比上升';
        const variants = lexicalQueryVariants(query);
        assert.ok(variants.includes('渠道分析'), variants.join('|'));
        assert.ok(variants.some((v) => v.length === 4 || v.length === 6), 'expected 4/6 CJK windows');
        const hits = matchBody(variants, body);
        assert.ok(hits.includes('渠道分析'), hits.join('|'));
      });
    });
  }

  it('official and enterprise helpers stay behaviorally aligned on the method bug query', () => {
    const q = '方法论智囊如何帮助用户';
    const a = new Set(officialVariants(q));
    const b = new Set(enterpriseVariants(q));
    for (const key of ['方法论智囊', '帮助用户']) {
      assert.equal(a.has(key), true);
      assert.equal(b.has(key), true);
    }
  });
});
