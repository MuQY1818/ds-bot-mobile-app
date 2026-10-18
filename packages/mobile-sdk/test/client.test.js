import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MobileClient, MobileError, MemoryTokenStore, MemoryCache, validateServerUrl, mergeMessages, applyConversationEvent, acceptedSubmissionMessage } from '../index.js';

const session = (patch = {}) => ({
  accessToken: 'test-access', refreshToken: 'test-refresh', serverId: 'host-1',
  deviceId: 'phone-1', expiresAt: Date.now() + 3600000, ...patch,
});
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const tick = () => new Promise(resolve => setImmediate(resolve));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function clientWith(handler, options = {}) {
  const tokenStore = options.tokenStore || new MemoryTokenStore(session());
  const client = new MobileClient({
    baseUrl: 'https://bot.example', tokenStore,
    fetch: async (url, init) => {
      if (new URL(url).pathname === '/mobile/v1/info') return response({ protocolVersion: 1, serverId: 'host-1' });
      return handler(url, init);
    }, ...options,
  });
  return { client, tokenStore };
}

test('accepted receipts survive caching and reconcile with canonical transcript rows in either arrival order', async () => {
  const payload = { conversationId: 'bot', sessionId: 'part', requestId: 'stable-request', text: 'accepted fixture text' };
  const receipt = { status: 'accepted', requestId: payload.requestId, conversationId: 'bot', sessionId: 'part', createdAt: 1000 };
  const local = acceptedSubmissionMessage(payload, receipt);
  const sending = { ...local, delivery: 'sending' };
  assert.equal(mergeMessages([sending], [local])[0].delivery, undefined, 'acceptance clears the optimistic delivery label');
  const canonical = { ...local, id: 'canonical', seq: 10, localSubmission: undefined };
  for (const [first, second] of [[[local], [canonical]], [[canonical], [local]]]) {
    const result = mergeMessages(first, second);
    assert.equal(result.length, 1); assert.equal(result[0].id, 'canonical');
  }
  const cache = new MemoryCache();
  const { client } = clientWith(async () => response({ messages: [canonical], cursor: null, sessionId: 'part' }), { cache });
  await Promise.all([client.messages('bot'), client.rememberAcceptedSubmission(payload, receipt)]);
  assert.equal((await client.getCachedMessages('bot')).length, 1);
  assert.equal((await client.getCachedMessages('bot'))[0].id, 'canonical');
  for (const status of ['unknown', 'rejected']) assert.throws(() => acceptedSubmissionMessage(payload, { ...receipt, status }), { code: 'invalid_receipt' });
  assert.throws(() => acceptedSubmissionMessage(payload, { ...receipt, requestId: 'other-request' }), { code: 'invalid_receipt' });
  assert.throws(() => acceptedSubmissionMessage(payload, { ...receipt, sessionId: 'other-part' }), { code: 'invalid_receipt' });
  client.dispose();
});

test('1000-message repeated snapshots reuse rows and array identity while an actual changed row updates once', () => {
  const history = Array.from({ length: 1000 }, (_, seq) => ({ id: `m-${seq}`, sessionId: 'history', seq, role: 'assistant',
    text: 'Synthetic long history paragraph. '.repeat(30), createdAt: seq + 1, author: { id: 'fixture-bot', name: 'Fixture Bot' } }));
  for (let i = 0; i < 20; i++) assert.equal(mergeMessages(history, structuredClone(history)), history);
  const update = { ...history[999], text: 'Changed reply' };
  const next = mergeMessages(history, [update]);
  assert.notEqual(next, history); assert.equal(next[0], history[0]); assert.equal(next[999].text, 'Changed reply');
});

test('file attachment requests bind the download to the visible message position', async () => {
  let request
  const { client } = clientWith(async url => { request = new URL(url); return new Response('file-bytes') })
  assert.equal(await (await client.attachment('bot', 'part', 'file', { seq: 12 })).text(), 'file-bytes')
  assert.equal(request.searchParams.get('seq'), '12')
  for (const seq of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => client.attachment('bot', 'part', 'file', { seq }), { code: 'invalid_sequence' })
  client.dispose()
})
test('cancelled requests cannot return late data even when a transport ignores abort', async () => {
  const ready = deferred()
  const began = deferred()
  const { client } = clientWith(async () => { began.resolve(); await ready.promise; return response({ messages: [], cursor: null }) })
  const controller = new AbortController()
  const result = client.messages('bot', { signal: controller.signal })
  await began.promise; controller.abort(); ready.resolve()
  await assert.rejects(result, { code: 'cancelled' })
  client.dispose()
})
test('notification cleanup actions can be cancelled without leaking late results', async () => {
  const ready = deferred(), began = deferred()
  const { client } = clientWith(async (_url, init) => { assert.ok(init.signal); began.resolve(); await ready.promise; return response({ok:true}) })
  const controller = new AbortController()
  const result = client.action('notifications-background-unregister', {}, {signal:controller.signal})
  await began.promise; controller.abort(); ready.resolve()
  await assert.rejects(result, {code:'cancelled'})
  client.dispose()
})
test('cancelling notification cleanup while a shared session refresh is stalled returns immediately and never sends the action', async () => {
  const ready = deferred(), began = deferred();let actions=0
  const { client } = clientWith(async (url) => {
    if(new URL(url).pathname === '/mobile/v1/auth/refresh'){began.resolve();await ready.promise;return response(session());}
    actions++;return response({ok:true})
  },{tokenStore:new MemoryTokenStore(session({expiresAt:Date.now()-1000}))})
  const controller=new AbortController()
  const result=client.action('notifications-background-unregister',{}, {signal:controller.signal})
  await began.promise;controller.abort()
  await assert.rejects(result,{code:'cancelled'})
  assert.equal(actions,0)
  ready.resolve();await tick();assert.equal(actions,0);client.dispose()
})
test('attachment cancellation during response reading discards late bytes', async () => {
  const ready = deferred()
  const began = deferred()
  const { client } = clientWith(async () => ({ status: 200, ok: true, blob: async () => { began.resolve(); await ready.promise; return new Blob(['private bytes']) } }))
  const controller = new AbortController()
  const result = client.attachment('bot', 'part', 'file', { seq: 2, signal: controller.signal })
  await began.promise; controller.abort(); ready.resolve()
  await assert.rejects(result, { code: 'cancelled' })
  client.dispose()
})
test('pre-cancelled transcriptions never upload audio', async () => {
  let sent = 0
  const { client } = clientWith(async () => { sent++; return response({ text: 'speech' }) })
  const controller = new AbortController(); controller.abort()
  await assert.rejects(client.transcribe({ name: 'voice.webm', mediaType: 'audio/webm', body: new Uint8Array([1]), signal: controller.signal }), { code: 'cancelled' })
  assert.equal(sent, 0)
  client.dispose()
})

test('server URLs require HTTPS and never allow embedded credentials or arbitrary paths', () => {
  assert.equal(validateServerUrl('https://bot.example/mobile/v1/'), 'https://bot.example');
  assert.equal(validateServerUrl('http://localhost:3000', { allowInsecure: true }), 'http://localhost:3000');
  assert.equal(validateServerUrl('http://127.0.0.1:3000', { allowInsecure: true }), 'http://127.0.0.1:3000');
  assert.equal(validateServerUrl('http://[::1]:3000', { allowInsecure: true }), 'http://[::1]:3000');
  assert.equal(validateServerUrl('https://[2001:db8:0:0::7]:8788/mobile/v1/'), 'https://[2001:db8::7]:8788');
  assert.equal(validateServerUrl('https://[fd12:3456::1]:8788'), 'https://[fd12:3456::1]:8788');
  for (const url of ['http://localhost', 'http://bot.example', 'https://u:p@bot.example', 'https://bot.example/path', 'https://bot.example?token=secret', 'https://bot.example#token', 'file:///tmp/bot', 'javascript:alert(1)']) {
    assert.throws(() => validateServerUrl(url), MobileError);
  }
  for (const url of ['http://192.168.1.9', 'http://localhost.attacker.example', 'http://[::]', 'http://[2001:db8::7]', 'http://[fd12::1]']) {
    assert.throws(() => validateServerUrl(url, { allowInsecure: true }), { code: 'insecure_url' });
  }
});

test('version and persisted server identity are verified before sending any credential', async () => {
  for (const info of [{ protocolVersion: 2, serverId: 'host-1' }, { protocolVersion: 1, serverId: 'impostor' }]) {
    let authenticated = 0;
    const { client } = clientWith(null, { fetch: async (_url, init) => {
      if (init.headers.Authorization) authenticated++;
      return response(info);
    } });
    await assert.rejects(client.state(), { code: info.protocolVersion === 2 ? 'incompatible_protocol' : 'server_changed' });
    assert.equal(authenticated, 0);
    client.dispose();
  }
});

test('a browser-style fetch receives no arbitrary class instance as its receiver', async () => {
  const { client } = clientWith(null, { fetch: function () {
    assert.equal(this, undefined);
    return Promise.resolve(response({ protocolVersion: 1, serverId: 'host-1' }));
  } });
  assert.equal((await client.info()).serverId, 'host-1');
  client.dispose();
});

test('pairing pending never grants a session; desktop approval persists the returned session', async () => {
  const tokenStore = new MemoryTokenStore();
  let approved = false;
  const { client } = clientWith(async (url, init) => {
    assert.equal(init.headers.Authorization, undefined);
    if (url.endsWith('/pairings')) return response({ requestId: 'pair-1', claimToken: 'test-claim', status: 'pending' }, 202);
    return response(approved ? session() : { status: 'pending' }, approved ? 200 : 202);
  }, { tokenStore });
  assert.equal((await client.pair('123456', 'My phone')).status, 'pending');
  assert.equal((await client.completePairing('test-claim')).status, 'pending');
  assert.equal(await tokenStore.get(), null);
  approved = true;
  assert.equal((await client.completePairing('test-claim')).serverId, 'host-1');
  assert.equal((await tokenStore.get()).deviceId, 'phone-1');
  assert.equal((await tokenStore.get()).serverUrl, 'https://bot.example');
  client.dispose();
});

test('an impostor cannot receive stored credentials by copying the public server identity', async () => {
  let authenticated = false;
  const { client } = clientWith(async () => { authenticated = true; return response({}); }, {
    tokenStore: new MemoryTokenStore(session({ serverUrl: 'https://trusted.example' })),
  });
  await assert.rejects(client.state(), { code: 'server_changed' });
  assert.equal(authenticated, false);
  assert.throws(() => { client.baseUrl = 'http://attacker.example'; }, TypeError);
  client.dispose();
});

test('completing a replacement pairing invalidates requests using the old device session', async () => {
  const entered = deferred();
  const gate = deferred();
  const { client, tokenStore } = clientWith(async url => {
    if (url.endsWith('/pairings/complete')) return response(session({ deviceId: 'phone-2', accessToken: 'replacement-access' }));
    entered.resolve();
    await gate.promise;
    return response({ oldDevice: true });
  });
  const oldRequest = client.state();
  const rejection = assert.rejects(oldRequest, { code: 'session_changed' });
  await entered.promise;
  await client.completePairing('test-replacement-claim');
  gate.resolve();
  await rejection;
  assert.equal((await tokenStore.get()).deviceId, 'phone-2');
  client.dispose();
});

test('concurrent unauthorized requests rotate a refresh token once and reuse the session', async () => {
  let refreshes = 0;
  const gate = deferred();
  const { client, tokenStore } = clientWith(async (url, init) => {
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    if (url.endsWith('/auth/refresh')) {
      refreshes++;
      await gate.promise;
      return response(session({ accessToken: 'test-new-access', refreshToken: 'test-new-refresh' }));
    }
    return init.headers.Authorization === 'Bearer test-access'
      ? response({ error: { code: 'token_expired', message: 'Expired.' } }, 401)
      : response({ online: true });
  });
  const requests = [client.state(), client.state(), client.state()];
  await tick();
  gate.resolve();
  assert.deepEqual(await Promise.all(requests), [{ online: true }, { online: true }, { online: true }]);
  assert.equal(refreshes, 1);
  assert.equal((await tokenStore.get()).accessToken, 'test-new-access');
  client.dispose();
});

test('logout while a refresh is in flight cannot restore old credentials', async () => {
  const entered = deferred();
  const gate = deferred();
  const { client, tokenStore } = clientWith(async url => {
    if (url.endsWith('/auth/refresh')) { entered.resolve(); await gate.promise; return response(session({ accessToken: 'late-token' })); }
    return response({ online: true });
  }, { tokenStore: new MemoryTokenStore(session({ expiresAt: Date.now() - 1 })) });
  const pending = client.state();
  const rejection = assert.rejects(pending, { code: 'session_changed' });
  await entered.promise;
  await client.logout();
  gate.resolve();
  await rejection;
  assert.equal(await tokenStore.get(), null);
  client.dispose();
});

test('logout while an approved pairing response is in flight cannot restore credentials', async () => {
  const entered = deferred();
  const gate = deferred();
  const { client, tokenStore } = clientWith(async () => { entered.resolve(); await gate.promise; return response(session()); }, { tokenStore: new MemoryTokenStore() });
  const pending = client.completePairing('test-claim');
  const rejection = assert.rejects(pending, { code: 'session_changed' });
  await entered.promise;
  await client.logout();
  gate.resolve();
  await rejection;
  assert.equal(await tokenStore.get(), null);
});

test('refresh rejection removes an unusable session and does not retry forever', async () => {
  let requests = 0;
  const { client, tokenStore } = clientWith(async () => {
    requests++;
    return response({ error: { code: 'device_revoked', message: 'Device access was revoked.' } }, 401);
  });
  await assert.rejects(client.state(), { code: 'device_revoked', status: 401 });
  assert.equal(requests, 2);
  assert.equal(await tokenStore.get(), null);
  client.dispose();
});

test('submission failures are not retried automatically and retain the caller request id', async () => {
  let calls = 0;
  const { client } = clientWith(async (_url, init) => {
    calls++;
    assert.equal(JSON.parse(init.body).requestId, 'stable-id');
    throw new Error('internal transport details should not escape');
  });
  await assert.rejects(client.submit({ conversationId: 'chief', sessionId: 's1', requestId: 'stable-id', text: 'Hello' }), { code: 'network_error' });
  assert.equal(calls, 1);
  client.dispose();
});

test('timeout aborts requests with an actionable error, without transport details', async () => {
  const { client } = clientWith((_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('private transport details')), { once: true });
  }), { requestTimeoutMs: 5 });
  await assert.rejects(client.state(), error => error.code === 'timeout' && !error.message.includes('private'));
  client.dispose();
});

test('history pages, cumulative deltas, commits and resets preserve old pages without duplicate bubbles', () => {
  const old = { id: 's0:1', sessionId: 's0', seq: 1, role: 'user', text: 'Old', createdAt: 10 };
  const first = { id: 's1:1', sessionId: 's1', seq: 1, role: 'user', text: 'Hello', createdAt: 20 };
  let messages = mergeMessages([old], [first, first]);
  assert.equal(messages.length, 2);
  messages = applyConversationEvent(messages, { type: 'delta', sessionId: 's1', attemptId: 'a1', text: 'H', index: 1, replace: true });
  messages = applyConversationEvent(messages, { type: 'delta', sessionId: 's1', attemptId: 'a1', text: 'Hello', index: 2, replace: true });
  messages = applyConversationEvent(messages, { type: 'delta', sessionId: 's1', attemptId: 'a1', text: 'H', index: 1, replace: true });
  assert.equal(messages.at(-1).text, 'Hello');
  const final = { id: 's1:2', sessionId: 's1', seq: 2, role: 'assistant', text: 'Hello!', createdAt: 21 };
  messages = applyConversationEvent(messages, { type: 'message', message: final, replaceAttemptId: 'a1' });
  messages = applyConversationEvent(messages, { type: 'message', message: final });
  assert.equal(messages.length, 3);
  assert.equal(messages.some(message => message.pending), false);
  messages = applyConversationEvent(messages, { type: 'delta', sessionId: 's1', attemptId: 'a2', text: 'Work' });
  messages = applyConversationEvent(messages, { type: 'status', attemptId: 'a2', clearAttempt: true });
  assert.equal(messages.length, 3);
  messages = applyConversationEvent(messages, { type: 'delta', sessionId: 's1', attemptId: 'a3', text: 'Work' });
  messages = applyConversationEvent(messages, { type: 'reset', sessionId: 's1', messages: [final] });
  assert.deepEqual(messages.map(message => message.id), ['s0:1', 's1:1', 's1:2']);
});

test('cache and drafts are isolated by server identity and remain usable while offline', async () => {
  const cache = new MemoryCache();
  await cache.setDraft('other-server', 'chief', 'Other draft');
  const { client } = clientWith(() => { throw new Error('Offline'); }, { cache });
  await client.setDraft('chief', 'My draft');
  assert.equal(await client.getDraft('chief'), 'My draft');
  assert.equal(await cache.getDraft('other-server', 'chief'), 'Other draft');
  assert.deepEqual(await client.getCachedMessages('chief'), []);
  await cache.clear('host-1');
  assert.equal(await client.getDraft('chief'), '');
  assert.equal(await cache.getDraft('other-server', 'chief'), 'Other draft');
  client.dispose();
});

test('clearing cached data invalidates an earlier asynchronous history merge', async () => {
  const entered = deferred();
  const gate = deferred();
  let writes = 0;
  let clears = 0;
  class SlowCache extends MemoryCache {
    async getMessages(...args) { entered.resolve(); await gate.promise; return super.getMessages(...args); }
    async setMessages(...args) { writes++; await super.setMessages(...args); }
    async clear(...args) { clears++; await super.clear(...args); }
  }
  const { client } = clientWith(() => response({ sessionId: 's1', cursor: null, messages: [{ id: 's1:1', sessionId: 's1', seq: 1, text: 'Hello', role: 'user', createdAt: 1 }] }), { cache: new SlowCache() });
  const history = client.messages('chief');
  await entered.promise;
  const clear = client.clearCachedData();
  await tick();
  gate.resolve();
  await Promise.all([history, clear]);
  assert.equal(writes, 0);
  assert.equal(clears, 1);
  assert.deepEqual(await client.getCachedMessages('chief'), []);
  client.dispose();
});

class FakeSocket {
  static all = [];
  constructor(url) { this.url = url; this.sent = []; FakeSocket.all.push(this); }
  send(value) { this.sent.push(JSON.parse(value)); }
  open() { this.onopen?.(); }
  event(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.onclose?.({ code: 1000 }); }
  serverClose(code) { this.onclose?.({ code }); }
}

test('stream tokens and status heartbeats never rewrite durable message storage', async () => {
  FakeSocket.all = [];
  let writes = 0;
  class CountingCache extends MemoryCache {
    async setMessages(...args) { writes++; await super.setMessages(...args); }
  }
  const { client } = clientWith(() => response({}), { WebSocket: FakeSocket, cache: new CountingCache() });
  const connection = client.connect({ conversationId: 'chief', onEvent() {} });
  await tick();
  const socket = FakeSocket.all[0];
  socket.open();
  socket.event({ type: 'ready' });
  for (let index = 0; index < 100; index++) {
    socket.event({ type: 'delta', sessionId: 's1', attemptId: 'a1', text: 'Cumulative response', index });
    socket.event({ type: 'status', phase: 'running' });
  }
  await tick();
  assert.equal(writes, 0);
  socket.event({ type: 'message', message: { id: 's1:2', sessionId: 's1', seq: 2, text: 'Done', role: 'assistant', createdAt: 2 } });
  await client.getCachedMessages('chief');
  assert.equal(writes, 1);
  connection.close();
  client.dispose();
});

test('websocket authenticates in a frame, merges reset cache, reconnects, and stops on logout', async () => {
  FakeSocket.all = [];
  const statuses = [];
  const events = [];
  const { client } = clientWith(() => response({}), { WebSocket: FakeSocket, reconnectDelayMs: 2, reconnectMaxDelayMs: 2 });
  client.connect({ conversationId: 'chief', onEvent: event => events.push(event), onStatus: status => statuses.push(status) });
  await tick();
  const first = FakeSocket.all[0];
  assert.equal(first.url, 'wss://bot.example/mobile/v1/events');
  first.open();
  assert.deepEqual(first.sent, [{ type: 'auth', token: 'test-access', conversationId: 'chief' }]);
  first.event({ type: 'ready' });
  first.event({ type: 'reset', conversationId: 'chief', eventSeq: 5, messages: [{ id: 's1:1', sessionId: 's1', seq: 1, role: 'user', text: 'Hello', createdAt: 0 }] });
  assert.equal((await client.getCachedMessages('chief')).length, 1);
  first.serverClose(1006);
  await delay(15);
  assert.equal(FakeSocket.all.length, 2);
  FakeSocket.all[1].open();
  assert.equal(FakeSocket.all[1].sent[0].after, 5);
  await client.logout();
  await delay(15);
  assert.equal(FakeSocket.all.length, 2);
  assert.equal(statuses.at(-1), 'closed');
  assert.equal(events.length, 2);
});

test('revoked websocket credentials stop reconnection after refresh is refused', async () => {
  FakeSocket.all = [];
  const statuses = [];
  const { client, tokenStore } = clientWith(() => response({ error: { code: 'device_revoked', message: 'Revoked.' } }, 401), { WebSocket: FakeSocket, reconnectDelayMs: 1 });
  client.connect({ conversationId: 'chief', onEvent() {}, onStatus: status => statuses.push(status) });
  await tick();
  FakeSocket.all[0].open();
  FakeSocket.all[0].serverClose(4401);
  await delay(15);
  assert.equal(statuses.at(-1), 'unauthorized');
  assert.equal(FakeSocket.all.length, 1);
  assert.equal(await tokenStore.get(), null);
  client.dispose();
});

test('attachment requests encode identities without allowing a remote credential destination', async () => {
  let requested;
  const { client } = clientWith((url) => { requested = new URL(url); return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } }); });
  const result = await client.attachment('chief', 's/1', 'image-id');
  assert.equal(result.type, 'image/png');
  assert.equal(result.size, 4);
  assert.equal(requested.pathname, '/mobile/v1/attachments/image-id');
  assert.equal(requested.searchParams.get('sessionId'), 's/1');
  await client.download('/mobile/v1/attachments/sha256%3Atest-hash?conversationId=chief&sessionId=s1');
  assert.equal(requested.pathname, '/mobile/v1/attachments/sha256%3Atest-hash');
  assert.throws(() => client.download('https://other.example/secret'), { code: 'invalid_download' });
  assert.throws(() => client.download('/mobile/v1/attachments/%2E%2E?sessionId=s1'), { code: 'invalid_download' });
  assert.throws(() => client.download('/mobile/v1/attachments/hash%2Fsecret'), { code: 'invalid_download' });
  client.dispose();
});
