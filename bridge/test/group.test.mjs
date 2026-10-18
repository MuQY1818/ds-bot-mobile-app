import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context, HostConnectionService, extended, vanilla } from './inputs.mjs'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createAdapter } from '../src/adapter.mjs'
import { createMobileServer } from '../src/server.js'
import { startBridge } from '../index.mjs'
import { MobileClient, MemoryTokenStore } from '../../packages/mobile-sdk/index.js'
const root = resolve(import.meta.dirname, '..')
async function fixture(t, { install = extended, prepare = async () => {}, prompt = async () => ({ accepted: true }), fixtureText = false, catalog = [], secretBarrier = async () => {} } = {}) {
  const ctx = new Context()
  const connectionFiber = await ctx.plugin({ name: 'connection-fixture', apply(ctx) { new HostConnectionService(ctx, [], { isAuthenticated: () => false }) } })
  t.after(() => connectionFiber.dispose())
  let current = 'current', readOnly
  const state = { revision: 1, bots: { chief: { id: 'chief', name: 'Fixture Chief', segments: [{ sessionId: 'past' }] } }, rooms: { room: { id: 'room', name: 'Fixture group', members: ['chief'], admin: 'chief', mode: 'admin', sessions: { chief: 'hidden' }, log: [] } }, mainBotIds: ['chief'], agents: {}, questions: {}, exchangeTurns: { current: [77] }, prefs: {}, secretRequests: { FAKE_SECRET: 'must not leave state' } }
  const no = () => {}
  const sessionController = { prompt, async *follow() { yield { type: 'snapshot', cursor: 9, records: [{ event: { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'hello password=synthetic' }] } } }, { event: { type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text: 'synthetic-known-key' }] } } } }] }; }, page: async () => ({ records: [], cursor: 0 }) }
  const rt = { state, refresh: no, load: no, bootstrap: no, catalog: no, loadSecrets: secretBarrier, cachedCatalog: () => catalog, cachedDefault: no, readOnly: () => readOnly,
    chatOf: () => current, secretsView: () => [{ name: 'SYNTHETIC' }], capabilityLibraryView: () => [], activityView: () => ({}), workView: () => ({}), roomWorkView: () => ({}), approvalsView: () => [], memoryNews: () => ({}), memoryReviews: () => [], connectorsView: () => [], capabilityStatusesView: () => ({}), ensureCapabilities: prepare,
    redactSecrets: text => text.replaceAll('synthetic-known-key', '[redacted]'), noteFailure: no,
  }
  const fiber = await ctx.plugin({ name: 'upstream-fixture', inject: ['connection'], apply(ctx) { install({ ...rt, ctx: { effect: ctx.effect.bind(ctx), connection: ctx.connection, sessionController } }) } })
  t.after(() => fiber.dispose())
  const adapter = createAdapter({ connection: ctx.connection, sessionController, fixtureText })
  t.after(() => adapter.dispose())
  await adapter.initialize()
  return { ctx, adapter, sessionController, state, move: () => { current = 'next' }, lock: () => { readOnly = 'Held elsewhere' }, unload: () => fiber.dispose() }
}
const signal = () => AbortSignal.timeout(5000)
test('vanilla 0.1.7 advertises reads accurately and refuses reliable send and raw history', async t => {
  const f = await fixture(t, { install: vanilla })
  const caps = f.adapter.capabilities()
  assert.equal(caps.conversations, true)
  for (const key of ['send', 'history', 'stream', 'groups', 'attachments', 'secrets']) assert.equal(caps[key], false)
  await assert.rejects(f.adapter.history('chief', {}, signal()), { code: 'REDACTED_PROJECTION_REQUIRED' })
  await assert.rejects(f.adapter.submit({ conversationId: 'chief' }, signal()), { code: 'STABLE_SUBMIT_REQUIRED' })
  const view = await f.adapter.state(signal())
  assert.equal('secrets' in view, false); assert.equal('secretRequests' in view, false); assert.equal('hiddenTurns' in view, false)
  assert.match(view.readOnly, /upstream bridge submit extension/)
  assert.deepEqual(view.models, [])
  assert.equal(view.memory, false)
  for (const key of ['modelSelection', 'queue', 'parts', 'search', 'context', 'tools', 'reasoning']) assert.equal(caps[key], false)
})
test('original SDK pairs and lists pristine upstream over HTTP while chat stays read-only', async t => {
  const f = await fixture(t, { install: vanilla })
  await mkdir(`${root}/fixture/test-homes`, { recursive: true })
  const home = await mkdtemp(`${root}/fixture/test-homes/sdk-vanilla-`)
  const server = await createMobileServer({ home, config: { port: 0, devAllowInsecure: true }, adapter: f.adapter })
  t.after(() => server.close())
  const client = new MobileClient({ baseUrl: server.url, allowInsecure: true, tokenStore: new MemoryTokenStore() })
  t.after(() => client.dispose())
  const info = await client.info()
  assert.equal(info.capabilities.send, false); assert.equal(info.capabilities.history, false)
  const pairing = await server.operator('pairing.create')
  const claim = await client.pair(pairing.code, 'SDK fixture')
  assert.equal((await client.completePairing(claim.claimToken)).status, 'pending')
  await server.operator('pairing.approve', { requestId: claim.requestId })
  await client.completePairing(claim.claimToken)
  const [state, list, target] = await Promise.all([client.state(), client.conversations(), client.target('chief')])
  assert.match(state.readOnly, /upstream bridge submit extension/)
  assert.equal(list.conversations[0].id, 'chief')
  assert.deepEqual(target, { conversationId: 'chief', sessionId: 'current', revision: 1, kind: 'bot' })
  await assert.rejects(client.messages('chief'), { code: 'REDACTED_PROJECTION_REQUIRED', status: 501 })
  await assert.rejects(client.submit({ conversationId: 'chief', sessionId: 'current', requestId: 'sdk_vanilla', text: 'hello' }), { code: 'STABLE_SUBMIT_REQUIRED', status: 501 })
  await assert.rejects(client.action('queue', { conversationId: 'chief' }), { code: 'ACTION_NOT_ALLOWED', status: 403 })
})
test('App bootstrap projects only safe model and Bot display fields', async t => {
  const f = await fixture(t, { catalog: [{ ref: 'fixture/model', name: 'Fixture model', providerName: 'Fixture', apiKey: 'synthetic-secret', provider: { apiKey: 'synthetic-secret' }, endpoint: 'private-host' }] })
  Object.assign(f.state.bots.chief, { role: 'Chief', model: 'fixture/model', color: 'blue', waiting: false, pinned: true, instructions: 'private instruction', workDir: '/private-path' })
  const view = await f.adapter.state(signal())
  assert.deepEqual(view.models, [{ ref: 'fixture/model', name: 'Fixture model', providerName: 'Fixture' }])
  assert.equal(view.bots[0].role, 'Chief')
  assert.equal(view.bots[0].model, 'fixture/model')
  assert.equal(view.bots[0].pinned, true)
  assert.equal(view.mainBotId, 'chief')
  assert.equal(view.readOnly, null)
  for (const value of ['synthetic-secret', 'private-host', 'private instruction', '/private-path']) assert.equal(JSON.stringify(view).includes(value), false)
})
test('committed message and turn status schema matches the original App consumer', async t => {
  const f = await fixture(t)
  f.sessionController.follow = async function* () {
    yield { type: 'snapshot', cursor: 0, records: [] }
    yield { type: 'event', event: { type: 'turn/start', seq: 1 } }
    yield { type: 'event', event: { type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'reasoning', text: 'private thought' }] } } } }
    yield { type: 'event', event: { type: 'assistant/message', seq: 3, data: { message: { content: [{ type: 'text', text: 'hello' }, { type: 'reasoning', text: 'private thought' }] } } } }
    yield { type: 'event', event: { type: 'turn/end', seq: 4 } }
  }
  const frames = []
  for await (const frame of f.adapter.follow('chief', {}, signal())) frames.push(frame)
  assert.deepEqual(frames.map(frame => frame.type), ['reset', 'status', 'message', 'status'])
  assert.equal(frames[1].busy, true); assert.equal(frames[1].phase, 'running')
  assert.equal(frames[3].busy, false); assert.equal(frames[3].phase, 'idle')
  assert.deepEqual(frames[2].message, { id: 'current:3', sessionId: 'current', seq: 3, createdAt: 0, role: 'assistant', text: 'hello' })
  assert.equal(JSON.stringify(frames).includes('private thought'), false)
})
test('unknown or malformed extension descriptions cannot advertise transcript or sending', async t => {
  for (const description of [null, {}, { version: 2, redactedText: true, stableRequestId: true }]) {
    const adapter = createAdapter({ connection: { createSharedFetchHandler: () => ({ fetch: async request => {
      const { endpoint } = await request.json()
      return Response.json({ ok: true, value: endpoint === 'state' ? { bots: [], rooms: [] } : description })
    } }) }, sessionController: {} })
    t.after(() => adapter.dispose())
    await adapter.initialize()
    for (const key of ['send', 'history', 'stream']) assert.equal(adapter.capabilities()[key], false)
    await assert.rejects(adapter.history('chief', {}, signal()), { code: 'REDACTED_PROJECTION_REQUIRED' })
    assert.match((await adapter.state(signal())).readOnly, /upstream bridge submit extension/)
  }
})
test('extended upstream redacts known key values and labels without exposing tools or secrets', async t => {
  const f = await fixture(t)
  const page = await f.adapter.history('chief', {}, signal())
  assert.equal(page.messages[0].text, 'hello password=[redacted]')
  assert.equal(page.messages[1].text, '[redacted]')
  assert.equal(page.cursor !== null, true)
  assert.equal(JSON.stringify(page).includes('synthetic-known-key'), false)
})
test('cursor cannot cross conversations, unrelated Sessions or hidden group member Sessions', async t => {
  const f = await fixture(t)
  for (const sessionId of ['unrelated', 'hidden']) {
    const cursor = Buffer.from(JSON.stringify({ v: 1, conversationId: 'chief', sessionId })).toString('base64url')
    await assert.rejects(f.adapter.history('chief', { cursor }, signal()), { code: 'SESSION_DENIED' })
  }
  const cursor = Buffer.from(JSON.stringify({ v: 1, conversationId: 'other', sessionId: 'past' })).toString('base64url')
  await assert.rejects(f.adapter.history('chief', { cursor }, signal()), { code: 'INVALID_CURSOR' })
  assert.equal((await f.adapter.target('room', signal())).sessionId, 'room')
})
test('submit forwards stable caller identity only through existing DS Bot owned handler', async t => {
  const prompts = []
  const f = await fixture(t, { prompt: async value => { prompts.push(value); return { accepted: true } } })
  const result = await f.adapter.submit({ conversationId: 'chief', sessionId: 'current', requestId: 'device_client', text: 'hello' }, signal())
  assert.equal(result.accepted, true)
  assert.deepEqual(prompts, [{ requestId: 'device_client', sessionId: 'current', mode: 'queue', content: [{ type: 'text', text: 'hello' }] }])
  await assert.rejects(f.adapter.submit({ conversationId: 'chief', sessionId: 'past', requestId: 'device_other', text: 'hello' }, signal()), { code: 'TARGET_CHANGED' })
  await assert.rejects(f.adapter.submit({ conversationId: 'chief', sessionId: 'current', requestId: 'device_ref', text: 'dsh-session:other' }, signal()), { code: 'INVALID_CONTENT' })
})
test('DS Bot patch rechecks rollover after the capability preparation barrier', async t => {
  let f, prompted = false
  f = await fixture(t, { prepare: async () => f.move(), prompt: async () => { prompted = true; return { accepted: true } } })
  await assert.rejects(f.adapter.submit({ conversationId: 'chief', sessionId: 'current', requestId: 'device_1', text: 'hello' }, signal()), { code: 'bot/stale' })
  assert.equal(prompted, false)
})
test('DS Bot patch rechecks team write ownership after capability preparation', async t => {
  let f, prompted = false
  f = await fixture(t, { prepare: async () => f.lock(), prompt: async () => { prompted = true; return { accepted: true } } })
  await assert.rejects(f.adapter.submit({ conversationId: 'chief', sessionId: 'current', requestId: 'device_1', text: 'hello' }, signal()), { code: 'bot/read-only' })
  assert.equal(prompted, false)
})
test('route unload fails closed and Peer resources dispose once', async t => {
  const f = await fixture(t)
  await f.unload()
  await assert.rejects(f.adapter.state(signal()), { code: 'TEAM_UNAVAILABLE' })
  let disposed = 0
  const peer = { principal: { kind: 'owner' }, dispose() { disposed++ } }
  const adapter = createAdapter({ connection: { createPeer: () => peer, createSharedFetchHandler: () => ({ fetch: async (_request, actual) => { assert.equal(actual, peer); return Response.json({ ok: true, value: {} }) } }) }, sessionController: {} })
  await adapter.dispose(); await adapter.dispose(); assert.equal(disposed, 1)
})
test('production entry requires a separate explicit state home', async () => {
  await assert.rejects(startBridge({}, {}), /dedicated bridge home/)
  const old = process.env.DSH_HOME
  process.env.DSH_HOME = `${root}/fixture/.dsh-test-home`
  try { await assert.rejects(startBridge({}, { home: process.env.DSH_HOME }), /separate from DSH_HOME/) } finally { if (old === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = old }
})
test('HTTP ledger preserves uncertain receipts across restart without replaying', async t => {
  await mkdir(`${root}/fixture/test-homes`, { recursive: true })
  const home = await mkdtemp(`${root}/fixture/test-homes/receipt-`)
  let prompts = 0
  const adapter = { capabilities: () => ({ send: true }), async submit() { prompts++; throw Error('Connection lost after admission') }, dispose() {} }
  const config = { port: 0, devAllowInsecure: true }
  let server = await createMobileServer({ home, config, adapter })
  t.after(() => server.close())
  async function request(path, token, body) { const response = await fetch(`${server.url}/mobile/v1/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); return { status: response.status, value: await response.json() } }
  const pairing = await server.operator('pairing.create')
  const claim = (await request('pairings', null, { code: pairing.code, deviceName: 'Fixture' })).value
  await server.operator('pairing.approve', { requestId: claim.requestId })
  const session = (await request('pairings/complete', null, { claimToken: claim.claimToken })).value
  const message = { conversationId: 'chief', sessionId: 'current', requestId: 'uncertain', text: 'hello' }
  assert.equal((await request('submissions', session.accessToken, message)).status, 500)
  await server.close()
  server = await createMobileServer({ home, config, adapter })
  const retry = await request('submissions', session.accessToken, message)
  assert.equal(retry.status, 200); assert.equal(retry.value.status, 'unknown'); assert.equal(prompts, 1)
  assert.equal((await request('submissions', session.accessToken, { ...message, text: 'changed' })).status, 409)
})

test('group target uses room public Session; hidden parts are never group targets', async t => {
  const f = await fixture(t)
  const view = await f.adapter.state(signal())
  assert.equal(f.adapter.capabilities().groups, true)
  assert.deepEqual(view.rooms[0].parts, [])
  assert.equal(view.rooms[0].sessionId, 'room')
  assert.equal((await f.adapter.target('room', signal())).kind, 'room')
  await assert.rejects(f.adapter.target('hidden', signal()), { code: 'CONVERSATION_NOT_FOUND' })
  await assert.rejects(f.adapter.submit({ conversationId: 'room', sessionId: 'hidden', requestId: 'hidden', text: 'hello' }, signal()), { code: 'TARGET_CHANGED' })
})
test('group submit preserves request ID and reuses prompt on public room Session', async t => {
  const prompts = []
  const f = await fixture(t, { prompt: async value => { prompts.push(value); return { accepted: true } } })
  await f.adapter.submit({ conversationId: 'room', sessionId: 'room', requestId: 'group_stable', text: 'hello group' }, signal())
  assert.deepEqual(prompts, [{ requestId: 'group_stable', sessionId: 'room', mode: 'queue', content: [{ type: 'text', text: 'hello group' }] }])
})
test('group submit rechecks membership, admin, mode, room deletion and lock after barrier', async t => {
  for (const change of [f => f.state.rooms.room.members.push('new'), f => { f.state.rooms.room.admin = null }, f => { f.state.rooms.room.mode = 'everyone' }, f => { delete f.state.rooms.room }, f => f.lock()]) {
    let f, prompted = false
    f = await fixture(t, { prepare: async () => change(f), prompt: async () => { prompted = true; return { accepted: true } } })
    await assert.rejects(f.adapter.submit({ conversationId: 'room', sessionId: 'room', requestId: 'group_changed', text: 'hello' }, signal()))
    assert.equal(prompted, false)
  }
})
test('group history redacts text and author names and rejects member Session cursor', async t => {
  const f = await fixture(t)
  f.sessionController.follow = async function* () { yield { type: 'snapshot', cursor: 3, records: [
    { event: { type: 'tool/call', seq: 1, data: { callId: 'relay', name: 'group_relay' } } },
    { event: { type: 'tool/result', seq: 2, data: { message: { source: { callId: 'relay' }, content: [{ type: 'text', text: JSON.stringify({ replies: [{ botId: 'chief', name: 'synthetic-known-key', text: 'synthetic-known-key' }] }) }] } } } },
  ] } }
  const page = await f.adapter.history('room', {}, signal())
  assert.equal(page.messages[0].text, '[redacted]')
  assert.deepEqual(page.messages[0].author, { id: 'chief', name: '[redacted]' })
  const cursor = Buffer.from(JSON.stringify({ v: 1, conversationId: 'room', sessionId: 'hidden' })).toString('base64url')
  await assert.rejects(f.adapter.history('room', { cursor }, signal()), { code: 'SESSION_DENIED' })
})

test('group live frames retain relay call attribution and redact author metadata', async t => {
  const f = await fixture(t)
  f.sessionController.follow = async function* () {
    yield { type: 'snapshot', cursor: 0, records: [] }
    yield { type: 'event', event: { type: 'tool/call', seq: 1, data: { callId: 'relay', name: 'group_relay' } } }
    yield { type: 'event', event: { type: 'tool/result', seq: 2, data: { message: { source: { callId: 'relay' }, content: [{ type: 'text', text: JSON.stringify({ replies: [{ botId: 'chief', name: 'synthetic-known-key', text: 'synthetic-known-key' }] }) }] } } } }
  }
  const frames = []
  for await (const frame of f.adapter.follow('room', {}, signal())) frames.push(frame)
  assert.deepEqual(frames.map(frame => frame.type), ['reset', 'message'])
  assert.equal(frames[1].message.text, '[redacted]')
  assert.equal(frames[1].message.author.name, '[redacted]')
})
test('group redaction refuses membership changed while loading known secret values', async t => {
  let f, armed = false, count = 0
  f = await fixture(t, { secretBarrier: async () => { if (armed && ++count === 2) f.state.rooms.room.members = [] } })
  armed = true
  await assert.rejects(f.adapter.history('room', {}, signal()), { code: 'bot/stale' })
})

test('room result pagination resolves only same-room public call evidence', async t => {
  const f = await fixture(t)
  const result = { event: { type: 'tool/result', seq: 8, data: { message: { source: { callId: 'relay' }, content: [{ type: 'text', text: JSON.stringify({ replies: [{ botId: 'chief', name: 'Chief', text: 'reply' }] }) }] } } } }
  f.sessionController.follow = async function* () { yield { type: 'snapshot', cursor: 8, hasMore: true, records: [result] } }
  f.sessionController.page = async request => {
    assert.deepEqual(request.address, { kind: 'session', sessionId: 'room' })
    assert.equal(request.beforeSeq, 8)
    return { records: [{ event: { type: 'tool/call', seq: 7, data: { callId: 'relay', name: 'group_relay' } } }], hasMore: false }
  }
  const page = await f.adapter.history('room', { limit: 1 }, signal())
  assert.equal(page.messages[0].text, 'reply')
  assert.ok(page.cursor)
})
