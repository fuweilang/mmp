import assert from 'node:assert/strict';
import { it } from 'node:test';
import { validateSync } from 'class-validator';
import { UpdateOfficialAgentDto } from '../src/admin/dto/official-agent.dto';
import { expertDiscoveryDetail, normalizeDiscoveryDetail } from '../src/official-agent/discovery-detail';
it('preserves four imported conversation starters through discovery read and write',()=>{
  const starters=['一','二','三','四'].map(text=>({text}));
  const normalized=normalizeDiscoveryDetail({schemaVersion:1,displayRevision:0,starters});
  assert.deepEqual(normalized.starters,starters);
  assert.deepEqual(expertDiscoveryDetail({discoveryDetail:normalized}).starters,starters);
  assert.deepEqual(expertDiscoveryDetail({},starters.map(x=>x.text)).starters,starters);
});
it('accepts an unabridged migrated prompt and still rejects oversized data',()=>{
  assert.equal(validateSync(Object.assign(new UpdateOfficialAgentDto(),{systemPrompt:'中'.repeat(52673)})).length,0);
  assert.ok(validateSync(Object.assign(new UpdateOfficialAgentDto(),{systemPrompt:'中'.repeat(60001)})).length);
});
