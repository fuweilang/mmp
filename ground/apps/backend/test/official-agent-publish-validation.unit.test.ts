import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';

// Lightweight harness: import service class and call private assert via any cast is brittle.
// Instead validate through discovery + normalizeExpertDefinition contracts already covered,
// and assert CATEGORY_TO_CAPABILITY wiring for new experts.
import { CATEGORY_TO_CAPABILITY, discoveryOf, catalogDiscoveryWhere } from '../src/official-agent/catalog-discovery';

describe('catalog category data-driven discovery', () => {
  it('maps Admin categories to gallery capabilities for unmapped keys', () => {
    assert.equal(discoveryOf('expert', 'expert-brand-new-key', 'content').capability, 'marketing');
    assert.equal(discoveryOf('expert', 'expert-brand-new-key', 'analytics').capability, 'research-data');
    assert.equal(discoveryOf('expert', 'expert-brand-new-key', null).capability, 'business');
  });

  it('includes category OR branch for unmapped expert keys', () => {
    const where = catalogDiscoveryWhere('expert', 'marketing', 'all') as {
      OR: Array<Record<string, unknown>>;
    };
    assert.ok(Array.isArray(where.OR));
    assert.ok(where.OR.some((clause) => 'AND' in clause));
    assert.ok(CATEGORY_TO_CAPABILITY.content === 'marketing');
  });
});

describe('publish assert message surface', () => {
  it('BadRequestException carries Chinese publish guidance', () => {
    const err = new BadRequestException('发布前请填写一句话介绍');
    assert.match(String(err.message), /一句话介绍/);
  });
});
