import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OfficialTabularAnalyzeService, resolveGroupByFromGoal } from '../src/official-agent/tabular-analyze.service';
import { OfficialWebFetchService } from '../src/official-agent/web-fetch.service';

describe('OfficialTabularAnalyzeService', () => {
  const svc = new OfficialTabularAnalyzeService();

  it('aggregates CSV deterministically', () => {
    const csv = [
      'city,orders,revenue',
      '上海,10,100',
      '上海,5,40',
      '北京,8,80',
      '北京,2,10',
      '广州,3,30',
      '广州,1,5',
      '深圳,4,40',
      '深圳,6,60',
      '杭州,7,70',
      '杭州,9,90',
    ].join('\n');
    const result = svc.analyze({ content: csv, format: 'csv', groupBy: 'city', metrics: ['revenue', 'orders'] });
    assert.equal(result.rowCount, 10);
    assert.equal(result.columnCount, 3);
    const shanghai = result.groupSummary?.find((row) => row.city === '上海');
    assert.ok(shanghai);
    assert.equal(shanghai!.revenue__sum, 140);
    assert.equal(shanghai!.orders__sum, 15);
    const revenue = result.columns.find((c) => c.name === 'revenue');
    assert.equal(revenue?.inferredType, 'number');
    assert.equal(revenue?.sum, 525);
  });

  it('rejects empty, path-like, and formula-heavy payloads', () => {
    assert.throws(() => svc.analyze({ content: '   ' }), /粘贴/);
    assert.throws(() => svc.analyze({ content: '/etc/passwd\na,b\n1,2' }), /文件路径/);
    const formulas = ['a,b', ...Array.from({ length: 20 }, (_, i) => `=A${i}+B${i},=SUM(A${i})`)].join('\n');
    assert.throws(() => svc.analyze({ content: formulas }), /公式/);
  });

  it('parses JSON object arrays', () => {
    const result = svc.analyze({
      content: JSON.stringify([
        { sku: 'A', qty: 2 },
        { sku: 'B', qty: 3 },
      ]),
      format: 'json',
    });
    assert.equal(result.format, 'json');
    assert.equal(result.rowCount, 2);
    assert.equal(result.columns.find((c) => c.name === 'qty')?.sum, 5);
  });
});

describe('OfficialWebFetchService SSRF guards', () => {
  const svc = new OfficialWebFetchService();

  it('rejects localhost and private IPs', async () => {
    await assert.rejects(() => svc.fetchUrl('http://127.0.0.1/'), /本地|内网/);
    await assert.rejects(() => svc.fetchUrl('http://localhost:8080/'), /本地/);
    await assert.rejects(() => svc.fetchUrl('http://192.168.1.1/'), /内网/);
    await assert.rejects(() => svc.fetchUrl('file:///etc/passwd'), /http/);
  });
});


describe('resolveGroupByFromGoal', () => {
  const cols = [
    { name: 'city', inferredType: 'string' as const },
    { name: 'orders', inferredType: 'number' as const },
    { name: 'revenue', inferredType: 'number' as const },
  ];

  it('maps 城市 / 按城市 to city column', () => {
    assert.equal(resolveGroupByFromGoal('按城市汇总收入', cols), 'city');
    assert.equal(resolveGroupByFromGoal('各城市收入合计', cols), 'city');
    assert.equal(resolveGroupByFromGoal('group by city revenue', cols), 'city');
  });

  it('does not silently pick first string column without match', () => {
    assert.equal(resolveGroupByFromGoal('看看整体收入合计是多少', cols), undefined);
    assert.equal(resolveGroupByFromGoal(undefined, cols), undefined);
  });

  it('analyze with goal applies groupBy deterministically', () => {
    const svc = new OfficialTabularAnalyzeService();
    const csv = [
      'city,orders,revenue',
      '上海,10,100',
      '上海,5,40',
      '北京,8,80',
      '北京,2,10',
    ].join('\n');
    const result = svc.analyze({ content: csv, format: 'csv', goal: '各城市收入合计' });
    assert.equal(result.appliedGroupBy, 'city');
    assert.ok(result.groupSummary);
    const sh = result.groupSummary!.find((r) => r.city === '上海');
    assert.equal(sh!.revenue__sum, 140);
  });
});
