import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { URL } from 'node:url';
import * as sdk from '../../../packages/mobile-sdk/index.js';
import { confirmOrSubmit, definitelyRejected } from '../src/logic/submissions.ts';
import { createConversationStreamPool } from '../src/logic/conversation-streams.ts';
import { outgoingMessage, recoveredIntent } from '../src/logic/outgoing.ts';

const require = createRequire(import.meta.url), ts = require('typescript');
const { WebSocket, WebSocketServer } = require('../../../bridge/node_modules/ws');

// The actual hook and SDK run against an isolated HTTP/WS server. A small hook
// host and clock replace React Native rendering, never a user's host/profile.
async function fixture(denyWebSocket = true, canQueue = false) {
  const state = { messages: [] as any[], historyReads: 0, deniedUpgrades: 0, posts: 0,
    handshakes: [] as string[], failReads: false, receiptStatus: 'accepted', receipts: new Map<string, any>(), postGate: null as Promise<void> | null,
    historyGate: null as Promise<void> | null, cacheGate: null as Promise<void> | null, draftReads: 0,
    tokenGate: null as Promise<void> | null, targetGate: null as Promise<void> | null, sendPersistenceGate: null as Promise<void> | null,
    targetReads: 0, receiptReads: 0, sendWrites: 0, failTarget: false, failSendWrite: false, failPost: false, payloads: [] as any[], draftClearGate: null as Promise<void> | null, draftClearStarted: false };
  const sockets = new Set<any>();
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, 'http://fixture').pathname;
    const json = (value: unknown, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (path === '/mobile/v1/info') return json({ protocolVersion: 1, serverId: 'fixture' });
    if (request.headers.authorization !== 'Bearer fixture-access') return json({ error: { code: 'UNAUTHORIZED' } }, 401);
    if (path.endsWith('/messages')) {
      state.historyReads++;
      if (state.historyGate) await state.historyGate;
      return state.failReads ? json({ error: { code: 'UNAVAILABLE' } }, 503) : json({ messages: state.messages, cursor: null, sessionId: 'part' });
    }
    if (path.endsWith('/target')) { state.targetReads++; if (state.targetGate) await state.targetGate; return state.failTarget ? json({ error: { code: 'UNAVAILABLE' } }, 503) : json({ conversationId: 'bot:a', sessionId: 'part', revision: 1 }); }
    if (path === '/mobile/v1/submissions' && request.method === 'POST') {
      let body = ''; for await (const bytes of request) body += bytes;
      const payload = JSON.parse(body); state.posts++; state.payloads.push(payload);
      const receipt = { requestId: payload.requestId, conversationId: payload.conversationId, sessionId: payload.sessionId,
        status: state.receiptStatus, createdAt: 1000 };
      state.receipts.set(payload.requestId, receipt);
      if (state.postGate) await state.postGate;
      return state.failPost ? json({ error: { code: 'UNAVAILABLE' } }, 503) : json(receipt);
    }
    if (path.startsWith('/mobile/v1/submissions/')) {
      state.receiptReads++; const receipt = state.receipts.get(path.split('/').at(-1)!);
      return receipt ? json(receipt) : json({ error: { code: 'NOT_FOUND' } }, 404);
    }
    json({ error: { code: 'NOT_FOUND' } }, 404);
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on('connection', socket => socket.on('error', () => {}));
  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {});
    if (denyWebSocket) { state.deniedUpgrades++; socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(request, socket, head, (ws: any) => {
      sockets.add(ws); ws.on('close', () => sockets.delete(ws)); ws.on('error', () => {});
      ws.on('message', (data: any) => { const auth = JSON.parse(data); state.handshakes.push(auth.conversationId); ws.conversationId = auth.conversationId; ws.send(JSON.stringify({ type: 'ready', conversationId: auth.conversationId })); });
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const cache = new sdk.MemoryCache();
  const originalSetMessages = cache.setMessages.bind(cache), originalGetDraft = cache.getDraft.bind(cache), originalSetDraft = cache.setDraft.bind(cache);
  cache.setMessages = async (...args: Parameters<typeof originalSetMessages>) => { if (state.cacheGate) await state.cacheGate; return originalSetMessages(...args); };
  cache.getDraft = async (...args: Parameters<typeof originalGetDraft>) => { state.draftReads++; return originalGetDraft(...args); };
  cache.setDraft = async (...args: Parameters<typeof originalSetDraft>) => { if (args[2] === '' && state.draftClearGate) { state.draftClearStarted = true; await state.draftClearGate; } return originalSetDraft(...args); };
  const tokenStore = new sdk.MemoryTokenStore({ accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
    serverId: 'fixture', deviceId: 'fixture-phone', expiresAt: Date.now() + 3600000 });
  const originalGetToken = tokenStore.get.bind(tokenStore);
  tokenStore.get = async () => { if (state.tokenGate) await state.tokenGate; return originalGetToken(); };
  const client = new sdk.MobileClient({ baseUrl: `http://127.0.0.1:${address.port}`, allowInsecure: true,
    cache, tokenStore, WebSocket, reconnectDelayMs: 60000, reconnectMaxDelayMs: 60000 });
  const values = new Map<string, any>();
  const timers = new Map<number, { at: number; callback: () => void }>();
  let now = 0, nextTimer = 0, uuid = 0;
  const conversationStreams = createConversationStreamPool({
    setTimer: ((callback: () => void, delay = 0) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; }) as any,
    clearTimer: ((id: number) => { timers.delete(id); }) as any,
  });
  const mounts: any[] = [];
  const module = { exports: {} as any };
  let compiled = false;
  const runtime = { react: null as any, focused: true, listeners: new Set<(value: string) => void>() };
  const reactProxy = new Proxy({}, { get(_target, name) { return (...args: any[]) => runtime.react[name](...args); } });
  function mount() {
  const slots: any[] = [], effects: Array<() => void> = [];
  const listeners = new Set<(value: string) => void>();
  let cursor = 0, dirty = false, focused = true, current: any;
  const same = (a: any[], b: any[]) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial: any) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value: any) => { const next = typeof value === 'function' ? value(slots[index]) : value; if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; } }]; },
    useRef(initial: any) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback(callback: any, deps: any[]) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { callback, deps }; return slots[index].callback; },
    useEffect(effect: () => void | (() => void), deps: any[]) { const index = cursor++;
      if (!same(slots[index]?.deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; }); },
  };
  if (!compiled) {
  const source = readFileSync(new URL('../src/hooks/useConversation.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(output, { module, exports: module.exports, AbortController,
    setTimeout(callback: () => void, delay = 0) { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    require(name: string) {
      if (name === 'react') return reactProxy;
      if (name === 'react-native') return { AppState: { currentState: 'active', addEventListener(_name: string, callback: (value: string) => void) { const owner = runtime.listeners; owner.add(callback); return { remove() { owner.delete(callback); } }; } } };
      if (name === '@ds-bot/mobile-sdk') return sdk;
      if (name === '../components/ScreenActivity') return { useScreenActivity: () => runtime.focused };
      if (name === '../logic/conversation-streams') return { conversationStreams };
      if (name === 'expo-crypto') return { randomUUID: () => `fixture-request-${++uuid}` };
      if (name === '../logic/submissions') return { confirmOrSubmit, definitelyRejected };
      if (name === '../logic/outgoing') return { outgoingMessage, recoveredIntent };
      if (name === '../logic/mobile-access') return { mobileActionAllowed: () => canQueue };
      if (name === '../types') return { errorText: (error: any) => error?.message || String(error) };
      if (name === '../storage') return { cache, tokenStore, readCache: async (server: string, key: string) => values.get(`${server}:${key}`) ?? null,
        writeCache: async (server: string, key: string, value: any) => { values.set(`${server}:${key}`, value); },
        writeSendCache: async (server: string, key: string, value: any, expected: string | null) => {
          state.sendWrites++; if (state.sendPersistenceGate) await state.sendPersistenceGate;
          if (state.failSendWrite) throw new Error('Fixture SQLite failure');
          const storageKey = `${server}:${key}`, old = values.get(storageKey);
          if (expected === null ? old != null : old?.requestId !== expected) return false;
          values.set(storageKey, structuredClone(value)); return true;
        } };
      throw Error(name);
    },
  });
  compiled = true; }
  let host = { serverId: 'fixture' }, selected = 'bot:a';
  function render() { runtime.react = react; runtime.focused = focused; runtime.listeners = listeners; cursor = 0; dirty = false; current = module.exports.useConversation(client, host, selected, {}); for (const effect of effects.splice(0)) effect(); }
  async function flush() { await new Promise<void>(resolve => setImmediate(resolve)); for (let i = 0; i < 30; i++) { await Promise.resolve(); if (dirty) render(); } }
  async function until(predicate: () => boolean) { for (let i = 0; i < 1500; i++) { await flush(); if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.fail('fixture condition timed out'); }
  render();
  const mounted = { current: () => current, flush, until,
    render,
    tap(attachments: any[] = []) { const operation = current.beginSend(attachments, attachments[0]?.sessionId); render(); return operation; },
    edit(text: string) { current.setDraft(text); render(); },
    focus(value: boolean) { focused = value; render(); },
    switchChat(value: string) { selected = value; render(); },
    switchHost(value: string) { host = { serverId: value }; render(); },
    foreground(value: boolean) { for (const listener of listeners) listener(value ? 'active' : 'background'); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
  mounts.push(mounted); return mounted;
  }
  const primary = mount();
  return { ...primary, state, client, values, mount,
    advance(milliseconds: number) { now += milliseconds; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } },
    emit(event: unknown, conversationId?: string) { for (const socket of sockets) if (!conversationId || socket.conversationId === conversationId) socket.send(JSON.stringify(event)); },
    streams: conversationStreams,
    async close() { for (const mounted of mounts) mounted.unmount(); conversationStreams.clear(client); client.dispose(); for (const socket of sockets) socket.terminate();
      await new Promise<void>(resolve => wss.close(() => resolve())); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

test('HTTP accepted renders and persists immediately with WS 403; fallback reads later Bot output and deduplicates the send', async () => {
  const f = await fixture();
  try {
    await f.until(() => f.current().status === 'reconnecting');
    assert.equal(f.state.deniedUpgrades, 1);
    f.edit('Isolated fixture message');
    assert.equal(await f.current().send(), true); await f.flush();
    assert.equal(f.current().messages.length, 1);
    assert.equal(f.current().messages[0].role, 'user');
    assert.equal(f.current().messages[0].localSubmission, true);
    assert.equal(f.current().draft, ''); assert.equal(f.current().pending, null);
    assert.equal((await f.client.getCachedMessages('bot:a')).length, 1);
    f.state.failReads = true; f.advance(0);
    await f.until(() => f.state.historyReads === 2); await f.flush();
    assert.equal(f.current().messages.length, 1); assert.equal(f.state.posts, 1);
    f.state.failReads = false;
    const [receipt] = f.state.receipts.values();
    f.state.messages = [{ id: 'canonical-user', sessionId: 'part', seq: 1, role: 'user', text: 'Isolated fixture message', createdAt: 1000, requestId: receipt.requestId },
      { id: 'canonical-bot', sessionId: 'part', seq: 2, role: 'assistant', text: 'Isolated fixture reply', createdAt: 2000 }];
    f.advance(6000); await f.until(() => f.current().messages.some((message: any) => message.id === 'canonical-bot'));
    assert.equal(f.current().messages.length, 2);
    assert.equal(f.current().messages.filter((message: any) => message.localSubmission).length, 0);
    const snapshot = f.current().messages;
    f.advance(3000); await f.until(() => f.state.historyReads === 4); await f.flush();
    assert.equal(f.current().messages, snapshot, 'identical snapshots do not churn the list');
    f.focus(false); f.advance(60000); await f.flush(); assert.equal(f.state.historyReads, 4);
    assert.equal(f.state.posts, 1);
  } finally { await f.close(); }
});

test('healthy WS and accepted HTTP confirmation race into one user message; background polling stays stopped', async () => {
  const f = await fixture(false);
  try {
    await f.until(() => f.current().status === 'connected');
    f.edit('Isolated accepted send'); assert.equal(await f.current().send(), true); await f.flush();
    const [receipt] = f.state.receipts.values();
    const canonical = { id: 'host-user', sessionId: 'part', seq: 1, role: 'user', text: 'Isolated accepted send', createdAt: 1000, requestId: receipt.requestId };
    f.emit({ type: 'message', conversationId: 'bot:a', message: canonical });
    await f.until(() => f.current().messages[0]?.id === 'host-user');
    f.emit({ type: 'message', conversationId: 'bot:a', message: canonical }); await f.flush();
    assert.equal(f.current().messages.length, 1);
    f.foreground(false); f.advance(60000); await f.flush(); assert.equal(f.state.historyReads, 1);
    assert.equal(f.state.posts, 1);
  } finally { await f.close(); }
});

test('unknown and rejected receipts retain an explicitly unconfirmed bubble and request identity without repeating POST', async () => {
  for (const status of ['unknown', 'rejected']) {
    const f = await fixture();
    try {
      await f.until(() => f.current().status === 'reconnecting'); f.state.receiptStatus = status;
      f.edit('Unconfirmed fixture draft'); assert.equal(await f.current().send(), false); await f.flush();
      assert.equal(f.current().messages.length, 1); assert.equal(f.current().draft, '');
      assert.equal(f.current().messages[0].delivery, status === 'rejected' ? 'rejected' : 'unconfirmed');
      f.edit('Independent next draft');
      const requestId = f.current().pending.requestId;
      assert.equal(await f.current().send(), false); await f.flush();
      assert.equal(f.current().pending.requestId, requestId); assert.equal(f.state.posts, 1);
      assert.equal(f.current().draft, 'Independent next draft');
    } finally { await f.close(); }
  }
});

test('a late accepted send cannot append to a different chat or host, clear its draft, or unlock a newer send', async () => {
  for (const destination of ['chat', 'host']) {
    const f = await fixture(); let release!: () => void;
    try {
      await f.until(() => f.current().status === 'reconnecting');
      f.state.postGate = new Promise<void>(resolve => { release = resolve; });
      f.edit('Original scoped draft'); const send = f.current().send();
      await f.until(() => f.state.posts === 1);
      if (destination === 'chat') f.switchChat('bot:b'); else f.switchHost('another-fixture');
      await f.flush(); f.edit('New screen draft'); release();
      assert.equal(await send, false); await f.flush();
      assert.equal(f.current().messages.length, 0); assert.equal(f.current().draft, 'New screen draft');
      assert.equal(f.current().pending, null); assert.equal(f.current().busy, false);
      assert.equal(f.state.posts, 1);
      assert.equal((await f.client.getCachedMessages('bot:a')).length, 1);
    } finally { release?.(); await f.close(); }
  }
});

test('an accepted send completing in background is retained without polling and survives foreground refresh', async () => {
  const f = await fixture(); let release!: () => void;
  try {
    await f.until(() => f.current().status === 'reconnecting');
    f.state.postGate = new Promise<void>(resolve => { release = resolve; });
    f.edit('Background accepted draft'); const send = f.current().send(); await f.until(() => f.state.posts === 1);
    f.foreground(false); release(); assert.equal(await send, true); await f.flush();
    f.advance(60000); await f.flush(); assert.equal(f.state.historyReads, 1);
    assert.equal(f.current().messages.length, 1); assert.equal(f.current().draft, '');
    f.foreground(true); await f.until(() => f.state.historyReads === 2); await f.flush();
    assert.equal(f.current().messages.length, 1); assert.equal(f.state.posts, 1);
  } finally { release?.(); await f.close(); }
});

test('slow REST and cache writes cannot delay WS ready; warm focus reuses one authenticated handshake', async () => {
  const f = await fixture(false, true);
  let releaseHistory!: () => void, releaseCache!: () => void;
  try {
    f.state.historyGate = new Promise<void>(resolve => { releaseHistory = resolve; });
    f.state.cacheGate = new Promise<void>(resolve => { releaseCache = resolve; });
    await f.until(() => f.state.historyReads === 1 && f.current().status === 'connected');
    assert.deepEqual(f.state.handshakes, ['bot:a']);
    f.edit('Keep this edited draft');
    f.focus(false); await f.flush();
    f.emit({ type: 'delta', conversationId: 'bot:a', sessionId: 'part', attemptId: 'attempt', index: 1, text: 'Cumulative detached text', busy: true,
      queue: [{ id: 'queued', text: 'next', target: 'next-turn' }] }, 'bot:a');
    await f.flush();
    assert.equal(f.current().messages.length, 0, 'detached UI receives no callbacks');
    f.focus(true); await f.until(() => f.current().messages.some((item: any) => item.text === 'Cumulative detached text'));
    assert.equal(f.current().status, 'connected'); assert.equal(f.current().running, true);
    assert.equal(f.current().draft, 'Keep this edited draft');
    assert.equal(f.current().queue[0]?.id, 'queued');
    assert.equal(f.state.draftReads, 1);
    assert.deepEqual(f.state.handshakes, ['bot:a']);
    releaseHistory(); await f.flush();
    assert.equal(f.current().status, 'connected', 'SQLite reconciliation remains independent of transport');
    releaseCache(); await f.flush();
  } finally { releaseHistory?.(); releaseCache?.(); await f.close(); }
});

test('A to B to A isolates streams and replays detached canonical/accepted state without another A handshake', async () => {
  const f = await fixture(false);
  try {
    await f.until(() => f.current().status === 'connected');
    const accepted = { id: 'accepted:request', sessionId: 'part', requestId: 'request', role: 'user', text: 'Accepted', createdAt: 1000, seq: Number.MAX_SAFE_INTEGER, localSubmission: true };
    f.emit({ type: 'message', conversationId: 'bot:a', message: accepted }, 'bot:a');
    await f.until(() => f.current().messages.length === 1);
    f.switchChat('bot:b'); await f.until(() => f.state.handshakes.length === 2 && f.current().status === 'connected');
    const canonical = { ...accepted, id: 'canonical', localSubmission: false, seq: 1 };
    f.emit({ type: 'message', conversationId: 'bot:a', message: canonical }, 'bot:a');
    f.emit({ type: 'delta', conversationId: 'bot:a', sessionId: 'part', attemptId: 'a', index: 1, text: 'Only A' }, 'bot:b');
    await f.flush(); assert.equal(f.current().messages.length, 0);
    f.switchChat('bot:a'); await f.until(() => f.current().messages[0]?.id === 'canonical');
    assert.deepEqual(f.state.handshakes, ['bot:a', 'bot:b']);
    assert.equal(f.current().messages.length, 1); assert.equal(f.current().status, 'connected');
    f.foreground(false); await f.until(() => f.streams.peek(f.client, 'fixture', 'bot:a') === undefined);
    assert.equal(f.streams.peek(f.client, 'fixture', 'bot:b'), undefined);
    f.foreground(true); await f.until(() => f.state.handshakes.length === 3 && f.current().status === 'connected');
    assert.deepEqual(f.state.handshakes, ['bot:a', 'bot:b', 'bot:a']);
  } finally { await f.close(); }
});


function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }

test('tap frame clears the composer and displays sending before SQLite, token or target; fresh delivery skips receipt GET', async () => {
  for (const blocked of ['sendPersistenceGate', 'tokenGate', 'targetGate'] as const) {
    const f = await fixture(); const paused = gate();
    try {
      await f.until(() => f.current().status === 'reconnecting');
      f.edit('Original immediate text'); await f.flush(); f.state[blocked] = paused.promise;
      const attachment = { id: 'file', name: 'fixture.txt', type: 'file', sessionId: 'part' };
      const send = f.tap([attachment]);
      assert.ok(send); assert.equal(f.current().draft, ''); assert.equal(f.current().busy, true);
      assert.equal(f.current().messages.length, 1); assert.equal(f.current().messages[0].text, 'Original immediate text');
      assert.equal(f.current().messages[0].delivery, 'sending'); assert.equal(f.current().messages[0].attachments[0].id, 'file');
      assert.equal(f.current().receipt, ''); assert.equal(f.state.posts, 0);
      await f.flush(); assert.equal(f.state.posts, 0, blocked + ' prevents network dispatch');
      f.edit('Original immediate text'); assert.equal(f.current().draft, 'Original immediate text');
      assert.equal(f.current().beginSend(), null);
      paused.release(); assert.equal(await send, true); await f.flush();
      assert.equal(f.current().draft, 'Original immediate text', 'an identical next draft is never cleared as the submitted draft');
      assert.equal(await f.client.cache.getDraft('fixture', 'bot:a'), 'Original immediate text');
      assert.equal(f.state.posts, 1); assert.equal(f.state.receiptReads, 0);
      assert.equal(f.current().messages[0].delivery, undefined); assert.equal(f.current().receipt, 'Sent');
    } finally { paused.release(); await f.close(); }
  }
});

test('pending HTTP remains sending while canonical WS can replace the optimistic bubble first', async () => {
  const f = await fixture(false); const paused = gate();
  try {
    await f.until(() => f.current().status === 'connected'); f.state.postGate = paused.promise;
    f.edit('Canonical wins'); const send = f.tap(); await f.until(() => f.state.posts === 1);
    assert.equal(f.current().messages[0].delivery, 'sending'); assert.equal(f.current().receipt, '');
    f.edit('Next independent message'); const payload = f.state.payloads[0];
    f.emit({ type: 'message', conversationId: 'bot:a', message: { id: 'canonical-first', ...payload, role: 'user', seq: 1, createdAt: 1000 } });
    await f.until(() => f.current().messages[0]?.id === 'canonical-first');
    assert.equal(f.current().messages.length, 1); assert.equal(f.current().messages[0].delivery, undefined);
    paused.release(); assert.equal(await send, true); await f.flush();
    assert.equal(f.current().messages.length, 1); assert.equal(f.current().messages[0].id, 'canonical-first');
    assert.equal(f.current().draft, 'Next independent message'); assert.equal(f.state.posts, 1);
  } finally { paused.release(); await f.close(); }
});

test('target and storage failures retain intent, never POST early, and retry the same request receipt-first', async () => {
  for (const failure of ['failTarget', 'failSendWrite'] as const) {
    const f = await fixture();
    try {
      await f.until(() => f.current().status === 'reconnecting'); f.edit('Retained original'); await f.flush();
      f.state[failure] = true; assert.equal(await f.tap(), false); await f.flush();
      assert.equal(f.state.posts, 0); assert.equal(f.current().messages[0].text, 'Retained original');
      assert.equal(f.current().messages[0].delivery, 'unconfirmed'); const requestId = f.current().outgoing.requestId;
      f.edit('Next draft survives'); f.state[failure] = false;
      assert.equal(await f.current().retry(), true); await f.flush();
      assert.equal(f.state.posts, 1); assert.equal(f.state.receiptReads, 1); assert.equal(f.state.payloads[0].requestId, requestId);
      assert.equal(f.current().draft, 'Next draft survives');
    } finally { await f.close(); }
  }
});

test('restored sends do not replay and a detached old failure cannot overwrite a newer durable request', async () => {
  const f = await fixture(); const first = gate(), second = gate();
  try {
    await f.until(() => f.current().status === 'reconnecting'); f.state.postGate = first.promise;
    f.edit('First request'); const oldSend = f.tap(); await f.until(() => f.state.posts === 1);
    const firstId = f.current().outgoing.requestId; f.unmount();
    const next = f.mount(); await next.until(() => !!next.current().outgoing);
    assert.equal(next.current().outgoing.requestId, firstId); assert.equal(next.current().messages[0].delivery, 'unconfirmed');
    assert.equal(f.state.posts, 1); assert.equal(await next.current().retry(), true); await next.flush();
    assert.equal(f.state.posts, 1); assert.equal(f.state.receiptReads, 1);
    next.edit('Second request'); f.state.postGate = second.promise; const newSend = next.tap();
    await next.until(() => f.state.posts === 2); const secondId = next.current().outgoing.requestId;
    f.state.failPost = true; first.release(); assert.equal(await oldSend, false); await next.flush();
    assert.equal(f.values.get('fixture:outgoing:bot:a').requestId, secondId);
    assert.equal(f.values.get('fixture:pending:bot:a').requestId, secondId);
    assert.equal(next.current().outgoing.requestId, secondId); assert.equal(next.current().busy, true);
    f.state.failPost = false; second.release(); assert.equal(await newSend, true); await next.flush();
  } finally { first.release(); second.release(); await f.close(); }
});

test('an initial clear delayed across unmount cannot erase a newer hook draft', async () => {
  const f = await fixture(); const paused = gate();
  try {
    await f.until(() => f.current().status === 'reconnecting'); f.edit('Old text'); await f.flush();
    f.state.draftClearGate = paused.promise; const oldSend = f.tap();
    await f.until(() => f.state.draftClearStarted); f.unmount();
    const next = f.mount(); await next.until(() => !!next.current().outgoing); next.edit('New text after remount');
    paused.release(); assert.equal(await oldSend, false); await next.flush();
    assert.equal(await f.client.cache.getDraft('fixture', 'bot:a'), 'New text after remount');
    assert.equal(next.current().draft, 'New text after remount'); assert.equal(f.state.posts, 0);
  } finally { paused.release(); await f.close(); }
});

test('restored rejection keeps new drafts and session-moved attachments can be recomposed without POST', async () => {
  const f = await fixture();
  try {
    await f.until(() => f.current().status === 'reconnecting'); f.edit('Files need a new target');
    const attachment = { id: 'file', name: 'fixture.txt', sessionId: 'old-part' };
    assert.equal(await f.tap([attachment]), false); await f.flush();
    assert.equal(f.state.posts, 0); assert.equal(f.current().rejected, true);
    f.unmount(); const next = f.mount(); await next.until(() => !!next.current().outgoing);
    assert.equal(next.current().rejected, true); next.edit('A new draft');
    assert.equal(await next.current().recompose(), undefined); await next.flush(); assert.equal(next.current().draft, 'A new draft');
    next.edit(''); const restored = await next.current().recompose(); await next.flush();
    assert.equal(restored[0].id, 'file'); assert.equal(next.current().draft, 'Files need a new target');
    assert.equal(next.current().outgoing, null); assert.equal(f.state.posts, 0);
  } finally { await f.close(); }
});

test('a failed claim preserves the original durable send and stops before target and POST', async () => {
  const f = await fixture();
  try {
    await f.until(() => f.current().status === 'reconnecting');
    // Start this local-claim scenario after the initial REST snapshot has been
    // applied; a WS status alone does not mean that independent read has ended.
    await f.until(() => f.streams.peek(f.client, 'fixture', 'bot:a')?.snapshot.cursor === null);
    const original = { requestId: 'another-hook', conversationId: 'bot:a', text: 'Existing durable original', attachments: [], createdAt: 1, delivery: 'unconfirmed' };
    f.values.set('fixture:outgoing:bot:a', original); f.edit('My unsent text');
    assert.equal(await f.tap(), false); await f.flush();
    assert.equal(f.values.get('fixture:outgoing:bot:a').requestId, original.requestId);
    assert.equal(f.current().messages[0].text, 'My unsent text'); assert.match(f.current().error, /Reopen this conversation/);
    assert.equal(f.state.targetReads, 0); assert.equal(f.state.posts, 0);
  } finally { await f.close(); }
});
