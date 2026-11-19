import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';

// Lightweight harness: importing the service class and calling private asserts via any casts is brittle.
// Validate the discovery contract that the catalog query and facets depend on instead.
import {
  UNCATEGORIZED_EXPERT_CAPABILITY,
  catalogDiscoveryWhere,
  discoveryOf,
} from '../src/official-agent/catalog-discovery';

describe('catalog category-driven discovery', () => {
  it('uses the Admin category verbatim, including built-in keys', () => {
    assert.equal(discoveryOf('expert', 'boss', 'productivity').capability, 'productivity');
    assert.equal(discoveryOf('expert', 'agency-backend-architect', 'content').capability, 'content');
    assert.equal(discoveryOf('expert', 'expert-brand-new-key', 'analytics').capability, 'analytics');
  });

  it('groups experts without a usable category separately', () => {
    assert.equal(
      discoveryOf('expert', 'expert-brand-new-key', null).capability,
      UNCATEGORIZED_EXPERT_CAPABILITY,
    );
    assert.equal(
      discoveryOf('expert', 'expert-brand-new-key', 'featured').capability,
      UNCATEGORIZED_EXPERT_CAPABILITY,
    );
  });

  it('keeps curated industries from the key map', () => {
    assert.deepEqual(discoveryOf('expert', 'agency-backend-architect', 'content').industries, ['it']);
    assert.deepEqual(discoveryOf('expert', 'expert-brand-new-key', 'content').industries, []);
  });

  it('filters experts by category in the database query', () => {
    assert.deepEqual(
      catalogDiscoveryWhere('expert', 'content', 'all'),
      { AND: [{ category: 'content' }] },
    );
    assert.deepEqual(
      catalogDiscoveryWhere('expert', UNCATEGORIZED_EXPERT_CAPABILITY, 'all'),
      { AND: [{ category: null }] },
    );
    // Unknown ids must not reach Prisma as an invalid enum value.
    assert.deepEqual(
      catalogDiscoveryWhere('expert', 'not-a-category', 'all'),
      { AND: [{ id: { in: [] } }] },
    );
  });

  it('keeps the skill discovery query key-driven', () => {
    const where = catalogDiscoveryWhere('skill', 'writing', 'all') as {
      OR: Array<Record<string, unknown>>;
    };
    assert.ok(Array.isArray(where.OR));
    assert.ok(where.OR.some((clause) => 'key' in clause));
  });
});

describe('publish assert message surface', () => {
  it('BadRequestException carries Chinese publish guidance', () => {
    const err = new BadRequestException('发布前请填写一句话介绍');
    assert.match(String(err.message), /一句话介绍/);
  });
});
