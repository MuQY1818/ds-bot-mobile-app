import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectGroupRecords } from '../src/group-projection.mjs'
const text = value => [{ type: 'text', text: value }]
const event = (type, seq, data) => ({ event: { type, seq, data } })
const call = event('tool/call', 1, { callId: 'relay', name: 'group_relay' })
const result = replies => event('tool/result', 2, { message: { source: { callId: 'relay' }, content: text(JSON.stringify({ replies })) } })
test('room projection allows attributed relay replies and scoped posts only', () => {
  const records = [call, result([{ botId: 'member', name: 'Member', text: 'reply' }, { botId: 'stranger', text: 'private' }, { botId: 'member', kind: 'failed', text: 'failure' }]),
    event('assistant/message', 3, { message: { content: text('relay assistant prose') } }),
    event('user/message', 4, { source: { kind: 'user', rpcId: 'stable' }, content: text('question') }),
    event('user/message', 5, { source: { kind: 'bot', form: 'relay', role: 'post', roomId: 'room', senderSessionId: 'member', senderName: 'Member' }, content: text('[Group post from Member]\nlate reply') }),
    event('user/message', 6, { source: { kind: 'bot', form: 'relay', role: 'post', roomId: 'other', senderSessionId: 'member' }, content: text('cross room') }),
    event('user/message', 7, { source: { kind: 'bot', form: 'relay', role: 'post', roomId: 'room', senderSessionId: 'hidden-session' }, content: text('hidden context') })]
  const rows = projectGroupRecords(records, { sessionId: 'room', members: ['member'] })
  assert.deepEqual(rows.map(row => [row.role, row.text, row.author?.id]), [['assistant', 'reply', 'member'], ['user', 'question', undefined], ['assistant', 'late reply', 'member']])
  assert.equal(rows[0].groupReplyId, 'relay:0')
  assert.equal(rows[1].requestId, 'stable')
})
test('room projection requires the exact committed group_relay call and retains it across frames', () => {
  const frame = result([{ botId: 'member', name: 'Member', text: 'reply' }])
  assert.deepEqual(projectGroupRecords([frame], { sessionId: 'room', members: ['member'] }), [])
  const calls = new Map()
  projectGroupRecords([call], { sessionId: 'room', members: ['member'], calls })
  assert.equal(projectGroupRecords([frame], { sessionId: 'room', members: ['member'], calls }).length, 1)
  assert.deepEqual(projectGroupRecords([event('tool/call', 1, { callId: 'relay', name: 'some_other_tool' }), frame], { sessionId: 'room', members: ['member'] }), [])
})
