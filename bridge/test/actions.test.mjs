import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context, HostConnectionService, vanilla as install } from './inputs.mjs'
import { createTeamActions, MOBILE_ACTIONS } from '../src/actions.mjs'
async function fixture(t, options = {}) {
  const ctx = new Context(), calls = [], writes = []
  const connection = await ctx.plugin({ name: 'actions-connection', apply(ctx) { new HostConnectionService(ctx, [], { isAuthenticated: () => false }) } })
  t.after(() => connection.dispose())
  let locked = false, current = 'current'
  const state = { revision: 1, bots: { chief: { id: 'chief', name: 'Chief', model: 'mock/model', segments: [{ sessionId: 'past' }] } }, rooms: { room: { id: 'room', sessions: { chief: 'hidden' }, log: [] } }, mainBotIds: ['chief'], agents: {}, questions: {}, prefs: {} }
  const no = () => {}
  const rt = { state, refresh: no, bootstrap: no, catalog: no, load: no, loadSecrets: no, readOnly: () => locked ? 'locked' : undefined,
    cachedCatalog: () => [{ ref: 'mock/model', name: 'Mock' }], cachedDefault: () => 'mock/model', chatOf: () => current,
    secretsView: () => [], capabilityLibraryView: () => [], activityView: () => ({}), workView: () => ({}), roomWorkView: () => ({}), approvalsView: () => [], memoryNews: () => ({}), memoryReviews: () => [], connectorsView: () => [], capabilityStatusesView: () => ({}), noteFailure: no,
    reasoningOf: async () => { await options.prepare?.(); return { efforts: [{ id: 'low', name: 'Low' }] } },
    updateBot: async (id, body) => { writes.push(body); return { id, secret: 'must-not-leave' } }, setFlags: async (id, body) => { writes.push(body); return { id, secret: 'must-not-leave' } },
    usageView: async () => ({ owners: [{ id: 'chief', kind: 'bot', name: 'synthetic-known' }, { id: 'other', kind: 'bot', name: 'foreign' }], models: [], kinds: ['chat'], rows: [['2026-01', 0, 0, 0, 1, 0, 0, 2, 1], ['2026-01', 1, 0, 0, 9, 0, 0, 9, 1]], now: '2026-01' }),
    memoryEndpoint: async (name, body) => { writes.push(body); return { entries: [{ scope: 'own', topic: null, text: 'synthetic-known' }, { scope: 'team', text: 'team-private' }] } },
    scheduleEndpoint: async (name, body) => { if (name !== 'schedules') writes.push(body); return { available: true, tasks: [{ id: 'own', sessionId: 'past', botId: 'chief', title: 'synthetic-known' }, { id: 'foreign', sessionId: 'unrelated', botId: 'chief', title: 'foreign' }, { id: 'hidden-task', sessionId: 'hidden', roomId: 'room', botId: 'chief' }] } },
  }
  const fiber = await ctx.plugin({ name: 'actions-upstream', inject: ['connection'], apply(ctx) { install({ ...rt, ctx: { effect: ctx.effect.bind(ctx), connection: ctx.connection } }) } })
  t.after(() => fiber.dispose())
  const dispatcher = ctx.connection.createSharedFetchHandler('/api'), peer = ctx.connection.createPeer?.({ principal: { kind: 'owner' } })
  t.after(() => peer?.dispose())
  const callTeam = async (endpoint, payload = {}, signal) => {
    calls.push(endpoint)
    const response = await dispatcher.fetch(new Request('http://fixture.invalid/api/bot', { method: 'POST', body: JSON.stringify({ endpoint, payload }), signal }), peer)
    const result = await response.json()
    if (!result.ok) throw Object.assign(new Error('Team refused'), { code: result.error.code })
    return result.value
  }
  const snapshot = async signal => { const value = await callTeam('state', {}, signal); return { ...value, readOnly: locked, conversations: [...value.bots.map(bot => ({ ...bot, kind: 'bot' })), { id: 'room', sessionId: 'room', kind: 'room' }] } }
  const controller = { projections: async () => ({ values: { inbox: { 'next-turn': [{ id: 'q1', source: { kind: 'user', rpcId: 'device_receipt' }, content: [{ type: 'text', text: 'synthetic-known' }] }, { id: 'internal', source: { kind: 'system' }, content: [] }] } } }), updateQueue: async body => writes.push(body), cancel: async body => writes.push(body) }
  const adapter = createTeamActions({ callTeam, snapshot, sessionController: controller, ...(options.noRedactor ? {} : { redactTexts: async ({ texts }) => texts.map(text => text.replaceAll('synthetic-known', '[redacted]')) }) })
  return { adapter, calls, writes, lock: () => { locked = true }, move: () => { current = 'next' } }
}
test('pristine public npm handler accepts scoped model and flags without exposing mutation objects', async t => {
  const f = await fixture(t)
  assert.deepEqual(await f.adapter.action('efforts', { ref: 'mock/model' }), { efforts: [{ id: 'low', name: 'Low' }] })
  assert.deepEqual(await f.adapter.action('update-bot', { id: 'chief', model: 'mock/model', effort: 'low' }), { id: 'chief', changed: true })
  assert.deepEqual(f.writes[0], { id: 'chief', model: 'mock/model', effort: 'low' })
  assert.deepEqual(await f.adapter.action('set-flags', { id: 'room', hidden: true }), { id: 'room', hidden: true })
})
test('strict allowlist, field types, byte bounds, and visible IDs fail before business handlers', async t => {
  const f = await fixture(t)
  for (const name of ['secret-set', 'settings-update', 'plugins-install', 'browser-read', 'memory-ask', 'approval-resolve', 'schedule-update', '__proto__']) await assert.rejects(f.adapter.action(name), { code: 'ACTION_NOT_ALLOWED' })
  for (const body of [{ id: 'chief', instructions: 'no' }, { id: 'chief', effort: 'unknown' }, { id: 'chief', model: 'foreign' }, { id: 'chief', effort: 1 }, { id: 'chief' }]) await assert.rejects(f.adapter.action('update-bot', body), { code: 'INVALID_ACTION' })
  for (const id of ['hidden', 'past', 'current', 'foreign']) await assert.rejects(f.adapter.action('set-flags', { id, pinned: true }), { code: 'TARGET_DENIED' })
  await assert.rejects(f.adapter.action('set-flags', { id: 'chief', pinned: 'true' }), { code: 'INVALID_ACTION' })
  await assert.rejects(f.adapter.action('memory-forget', { botId: 'chief', scope: 'own', text: 'x'.repeat(40000) }), { code: 'INVALID_ACTION' })
  assert.equal(f.writes.length, 0)
  assert.ok(MOBILE_ACTIONS.includes('usage'))
})
test('lock or target rollover during effort discovery prevents the write', async t => {
  let f
  f = await fixture(t, { prepare: () => f.lock() })
  await assert.rejects(f.adapter.action('update-bot', { id: 'chief', effort: 'low' }), { code: 'READ_ONLY' })
  assert.equal(f.writes.length, 0)
  let g
  g = await fixture(t, { prepare: () => g.move() })
  await assert.rejects(g.adapter.action('update-bot', { id: 'chief', effort: 'low' }), { code: 'TARGET_CHANGED' })
  assert.equal(g.writes.length, 0)
})
test('usage and memory own views are bounded projected and redacted', async t => {
  const f = await fixture(t)
  const usage = await f.adapter.action('usage')
  assert.equal(usage.owners.length, 1); assert.equal(usage.rows.length, 1)
  assert.equal(usage.owners[0].name, '[redacted]')
  const memory = await f.adapter.action('memory-view', { botId: 'chief' })
  assert.deepEqual(memory.entries, [{ scope: 'own', topic: null, text: '[redacted]' }])
  await assert.rejects(f.adapter.action('memory-forget', { botId: 'chief', scope: 'team', text: 'x' }), { code: 'INVALID_ACTION' })
  await f.adapter.action('memory-forget', { botId: 'chief', scope: 'own', text: 'x' })
  assert.equal(f.writes.at(-1).scope, 'own')
})
test('schedule ownership rejects unrelated and hidden member Sessions; exact timing keys required', async t => {
  const f = await fixture(t)
  assert.deepEqual((await f.adapter.action('schedules')).tasks.map(task => task.id), ['own'])
  for (const [id, sessionId] of [['foreign', 'unrelated'], ['hidden-task', 'hidden']]) await assert.rejects(f.adapter.action('schedule-delete', { id, sessionId }), { code: 'TASK_DENIED' })
  await f.adapter.action('schedule-delete', { id: 'own', sessionId: 'past' })
  await f.adapter.action('schedule-create', { target: 'room', title: 'Test', prompt: 'Hello', when: { kind: 'daily', time: '10:00', timeZone: 'UTC' } })
  for (const when of [{ kind: 'daily', time: '10:00' }, { kind: 'daily', time: '10:00', timeZone: 'UTC', minutes: 1 }, { kind: 'at', at: '2030-01-01' }, { kind: 'every', minutes: 0 }]) await assert.rejects(f.adapter.action('schedule-create', { target: 'chief', title: 'Test', prompt: 'Hello', when }), { code: 'INVALID_ACTION' })
})
test('queue and cancel use public controller with current target only', async t => {
  const f = await fixture(t)
  assert.deepEqual((await f.adapter.action('queue', { conversationId: 'chief' })).items, [{ id: 'q1', target: 'next-turn', requestId: 'device_receipt', text: '[redacted]' }])
  await assert.rejects(f.adapter.action('queue-remove', { conversationId: 'chief', sessionId: 'past', itemId: 'q1' }), { code: 'INVALID_ACTION' })
  await f.adapter.action('queue-remove', { conversationId: 'chief', sessionId: 'current', itemId: 'q1' })
  await assert.rejects(f.adapter.cancel({ conversationId: 'chief', sessionId: 'past' }), { code: 'TARGET_CHANGED' })
  await assert.rejects(f.adapter.cancel({ conversationId: 'chief', sessionId: 'current', force: true }), { code: 'INVALID_ACTION' })
  await f.adapter.cancel({ conversationId: 'chief', sessionId: 'current' })
  assert.deepEqual(f.writes.at(-1), { sessionId: 'current' })
})
test('missing DS Bot redactor prevents text view advertisement and use', async t => {
  const f = await fixture(t, { noRedactor: true })
  for (const name of ['models', 'efforts', 'usage', 'memory-view', 'memory-forget', 'schedules', 'schedule-create', 'schedule-delete', 'queue', 'queue-remove']) { assert.equal(f.adapter.capabilities().actions.includes(name), false); await assert.rejects(f.adapter.action(name), { code: 'ACTION_NOT_ALLOWED' }) }
})
