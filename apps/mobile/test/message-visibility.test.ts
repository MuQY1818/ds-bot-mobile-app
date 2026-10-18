import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { URL } from 'node:url';
import * as sdk from '../../../packages/mobile-sdk/index.js';
import { confirmOrSubmit, definitelyRejected } from '../src/logic/submissions.ts';

const require = createRequire(import.meta.url), ts = require('typescript');
const { WebSocket, WebSocketServer } = require('../../../bridge/node_modules/ws');

// The actual hook and SDK run against an isolated HTTP/WS server. A small hook
// host and clock replace React Native rendering, never a user's host/profile.
async function fixture(denyWebSocket = true) {
  const state = { messages: [] as any[], historyReads: 0, deniedUpgrades: 0, posts: 0,
    failReads: false, receiptStatus: 'accepted', receipts: new Map<string, any>(), postGate: null as Promise<void> | null };
  const sockets = new Set<any>();
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, 'http://fixture').pathname;
    const json = (value: unknown, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (path === '/mobile/v1/info') return json({ protocolVersion: 1, serverId: 'fixture' });
    if (request.headers.authorization !== 'Bearer fixture-access') return json({ error: { code: 'UNAUTHORIZED' } }, 401);
    if (path.endsWith('/messages')) {
      state.historyReads++;
      return state.failReads ? json({ error: { code: 'UNAVAILABLE' } }, 503) : json({ messages: state.messages, cursor: null, sessionId: 'part' });
    }
    if (path.endsWith('/target')) return json({ conversationId: 'bot:a', sessionId: 'part', revision: 1 });
    if (path === '/mobile/v1/submissions' && request.method === 'POST') {
      let body = ''; for await (const bytes of request) body += bytes;
      const payload = JSON.parse(body); state.posts++;
      const receipt = { requestId: payload.requestId, conversationId: payload.conversationId, sessionId: payload.sessionId,
        status: state.receiptStatus, createdAt: 1000 };
      state.receipts.set(payload.requestId, receipt);
      if (state.postGate) await state.postGate;
      return json(receipt);
    }
    if (path.startsWith('/mobile/v1/submissions/')) {
      const receipt = state.receipts.get(path.split('/').at(-1)!);
      return receipt ? json(receipt) : json({ error: { code: 'NOT_FOUND' } }, 404);
    }
    json({ error: { code: 'NOT_FOUND' } }, 404);
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    if (denyWebSocket) { state.deniedUpgrades++; socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(request, socket, head, (ws: any) => {
      sockets.add(ws); ws.on('close', () => sockets.delete(ws));
      ws.on('message', () => ws.send(JSON.stringify({ type: 'ready', conversationId: 'bot:a' })));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const cache = new sdk.MemoryCache();
  const tokenStore = new sdk.MemoryTokenStore({ accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
    serverId: 'fixture', deviceId: 'fixture-phone', expiresAt: Date.now() + 3600000 });
  const client = new sdk.MobileClient({ baseUrl: `http://127.0.0.1:${address.port}`, allowInsecure: true,
    cache, tokenStore, WebSocket, reconnectDelayMs: 60000, reconnectMaxDelayMs: 60000 });
  const values = new Map<string, any>();
  const slots: any[] = [], effects: Array<() => void> = [];
  const listeners = new Set<(value: string) => void>();
  const timers = new Map<number, { at: number; callback: () => void }>();
  let cursor = 0, dirty = false, focused = true, now = 0, nextTimer = 0, current: any, uuid = 0;
  const same = (a: any[], b: any[]) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial: any) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value: any) => { const next = typeof value === 'function' ? value(slots[index]) : value; if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; } }]; },
    useRef(initial: any) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback(callback: any, deps: any[]) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { callback, deps }; return slots[index].callback; },
    useEffect(effect: () => void | (() => void), deps: any[]) { const index = cursor++;
      if (!same(slots[index]?.deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; }); },
  };
  const module = { exports: {} as any };
  const source = readFileSync(new URL('../src/hooks/useConversation.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(output, { module, exports: module.exports, AbortController,
    setTimeout(callback: () => void, delay = 0) { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    require(name: string) {
      if (name === 'react') return react;
      if (name === 'react-native') return { AppState: { currentState: 'active', addEventListener(_name: string, callback: (value: string) => void) { listeners.add(callback); return { remove() { listeners.delete(callback); } }; } } };
      if (name === '@ds-bot/mobile-sdk') return sdk;
      if (name === '../components/ScreenActivity') return { useScreenActivity: () => focused };
      if (name === 'expo-crypto') return { randomUUID: () => `fixture-request-${++uuid}` };
      if (name === '../logic/submissions') return { confirmOrSubmit, definitelyRejected };
      if (name === '../logic/mobile-access') return { mobileActionAllowed: () => false };
      if (name === '../types') return { errorText: (error: any) => error?.message || String(error) };
      if (name === '../storage') return { cache, tokenStore, readCache: async (server: string, key: string) => values.get(`${server}:${key}`) ?? null,
        writeCache: async (server: string, key: string, value: any) => { values.set(`${server}:${key}`, value); } };
      throw Error(name);
    },
  });
  let host = { serverId: 'fixture' }, selected = 'bot:a';
  function render() { cursor = 0; dirty = false; current = module.exports.useConversation(client, host, selected, {}); for (const effect of effects.splice(0)) effect(); }
  async function flush() { await new Promise<void>(resolve => setImmediate(resolve)); for (let i = 0; i < 30; i++) { await Promise.resolve(); if (dirty) render(); } }
  async function until(predicate: () => boolean) { for (let i = 0; i < 1500; i++) { await flush(); if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 1)); } assert.fail('fixture condition timed out'); }
  render();
  return { state, client, values, current: () => current, flush, until,
    edit(text: string) { current.setDraft(text); render(); },
    advance(milliseconds: number) { now += milliseconds; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } },
    focus(value: boolean) { focused = value; render(); },
    switchChat(value: string) { selected = value; render(); },
    switchHost(value: string) { host = { serverId: value }; render(); },
    foreground(value: boolean) { for (const listener of listeners) listener(value ? 'active' : 'background'); },
    emit(event: unknown) { for (const socket of sockets) socket.send(JSON.stringify(event)); },
    async close() { for (const slot of slots) slot?.cleanup?.(); client.dispose(); for (const socket of sockets) socket.terminate();
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

test('unknown and rejected receipts retain draft and request identity without inventing a sent bubble or repeating POST', async () => {
  for (const status of ['unknown', 'rejected']) {
    const f = await fixture();
    try {
      await f.until(() => f.current().status === 'reconnecting'); f.state.receiptStatus = status;
      f.edit('Unconfirmed fixture draft'); assert.equal(await f.current().send(), false); await f.flush();
      assert.equal(f.current().messages.length, 0); assert.equal(f.current().draft, 'Unconfirmed fixture draft');
      const requestId = f.current().pending.requestId;
      assert.equal(await f.current().send(), false); await f.flush();
      assert.equal(f.current().pending.requestId, requestId); assert.equal(f.state.posts, 1);
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
