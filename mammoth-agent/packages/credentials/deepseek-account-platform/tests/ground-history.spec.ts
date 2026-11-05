/** Cloud transcript privacy and account identity admission. */
import { expect, it } from 'vitest'
import { SessionSeq, type SessionEvent, type UserMessage } from '@mammoth-ai/mmp-session'
import type { PlatformSession } from '@mammoth-ai/mmp-deepseek-account'
import { exportHistory, historyTaskState } from '../src/ground-history-export.ts'
import { historyIdentity } from '../src/ground-history.ts'

const user = (seq: number, text: string): SessionEvent<'user/message'> => ({
  type: 'user/message', seq: SessionSeq(seq), time: 1000 + seq, surfaceOp: 'append',
  data: { id: `message-${seq}` as UserMessage['id'], role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] },
})
const assistant = (seq: number): SessionEvent<'assistant/message'> => ({
  type: 'assistant/message', seq: SessionSeq(seq), time: 1000 + seq, surfaceOp: 'append',
  data: { turn: 1, step: 1, stream: [], message: {
    id: `message-${seq}` as UserMessage['id'], role: 'assistant', source: { kind: 'model', provider: 'test', model: 'test' },
    content: [{ type: 'text', text: 'Visible result' }, { type: 'reasoning', text: 'PRIVATE REASONING' }],
  } },
})
it('retains historical turns across context replacement and excludes private reasoning and replacement context', () => {
  const replacement: SessionEvent<'user/message'> = { ...user(2, 'PRIVATE COMPACTION'), surfaceOp: { op: 'replace', startSeq: SessionSeq(0), endSeq: SessionSeq(1) } }
  const output = exportHistory([user(0, 'Original prompt'), assistant(1), replacement, user(3, 'Follow-up')])
  expect(output.messages.map(message => [message.seq, message.role, message.text])).toEqual([
    [0, 'user', 'Original prompt'], [1, 'assistant', 'Visible result'], [3, 'user', 'Follow-up'],
  ])
  expect(JSON.stringify(output)).not.toContain('PRIVATE')
  expect(output.files).toEqual([])
})
it('does not turn reasoning-only assistant steps into visible attachments', () => {
  const event = assistant(1)
  expect(exportHistory([{ ...event, data: { ...event.data, message: { ...event.data.message, content: [{ type: 'reasoning', text: 'PRIVATE' }] } } }]).messages).toEqual([])
})
it('reports the latest task state independently from replicated messages', () => {
  const start: SessionEvent<'turn/start'> = { type: 'turn/start', seq: SessionSeq(0), time: 1, data: { turn: 1 } }
  const end: SessionEvent<'turn/end'> = { type: 'turn/end', seq: SessionSeq(2), time: 3, data: { turn: 1, reason: { kind: 'completed' } } }
  expect(historyTaskState([])).toBe('idle')
  expect(historyTaskState([start])).toBe('running')
  expect(historyTaskState([start, assistant(1), end])).toBe('completed')
})
it('requires a matching verified account and a live normal grant', () => {
  const session = (sub = 'a', userId: string | null = 'a', exp = Date.now() / 1000 + 60): PlatformSession => ({ origin: 'http://ground.test',
    token: `header.${Buffer.from(JSON.stringify({ sub, tenantId: 'enterprise', exp })).toString('base64url')}.signature`, userId: userId as PlatformSession['userId'] })
  expect(historyIdentity(session())).toEqual({ accountId: 'a', tenantId: 'enterprise' })
  expect(historyIdentity(session('b'))).toBeNull()
  expect(historyIdentity(session('a', null))).toBeNull()
  expect(historyIdentity(session('a', 'a', 1))).toBeNull()
  expect(historyIdentity({ ...session(), token: 'malformed' })).toBeNull()
  expect(historyIdentity(null)).toBeNull()
})

it('replicates attachment basenames without references, local paths or binary metadata', () => {
  const event = user(0, '')
  const attachment: Extract<UserMessage['content'][number], { type: 'file' }>['attachment'] = {
    attachmentId: 'private-storage-reference' as Extract<UserMessage['content'][number], { type: 'file' }>['attachment']['attachmentId'],
    name: '/Users/private/project/result.docx', bytes: 1234,
  }
  const output = exportHistory([{ ...event, data: { ...event.data, content: [{ type: 'file', attachment }] } }])
  expect(output.files).toEqual(['result.docx'])
  expect(output.messages).toHaveLength(1)
  expect(JSON.stringify(output)).not.toContain('/Users/private')
  expect(JSON.stringify(output)).not.toContain('private-storage-reference')
  expect(JSON.stringify(output)).not.toContain('1234')
})
