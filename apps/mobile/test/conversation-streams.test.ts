import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationStreamPool, watchConversationStreamLifecycle } from '../src/logic/conversation-streams.ts';

function fixture() {
  let now = 0, next = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const calls: any[] = [];
  const streams = createConversationStreamPool({
    setTimer: ((run: () => void, delay: number) => { const id = ++next; timers.set(id, { at: now + delay, run }); return id; }) as any,
    clearTimer: ((id: number) => timers.delete(id)) as any,
  });
  const client: any = { connect(options: any) { const call = { options, closed: false }; calls.push(call); options.onStatus('connecting');
    return { close() { if (!call.closed) { call.closed = true; options.onStatus('closed'); } } }; } };
  const listener = () => { const statuses: string[] = [], snapshots: any[] = [];
    return { statuses, snapshots, onStatus: (status: string) => statuses.push(status), onSnapshot: (snapshot: any) => snapshots.push(snapshot), onError() {} }; };
  return { client, streams, calls, listener,
    advance(ms: number) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.run(); } },
  };
}

test('idle leases expire at 30 seconds and the LRU cap keeps at most three idle/four total streams', () => {
  const f = fixture();
  for (const id of ['a', 'b', 'c', 'd']) f.streams.acquire(f.client, 'fixture', id, f.listener()).release();
  assert.equal(f.calls.length, 4); assert.equal(f.calls[0].closed, true);
  assert.equal(f.calls.filter(call => !call.closed).length, 3);
  const active = f.streams.acquire(f.client, 'fixture', 'active', f.listener());
  assert.equal(f.calls.filter(call => !call.closed).length, 4);
  f.advance(29999); assert.equal(f.calls.filter(call => !call.closed).length, 4);
  f.advance(1); assert.equal(f.calls.filter(call => !call.closed).length, 1);
  active.release(); f.advance(30000); assert.equal(f.calls.filter(call => !call.closed).length, 0);
});

test('terminal status invalidates warm entries and reconnecting replay never invents connected', () => {
  const f = fixture();
  let lease = f.streams.acquire(f.client, 'fixture', 'a', f.listener());
  f.calls[0].options.onStatus('connected'); lease.release();
  f.calls[0].options.onStatus('reconnecting');
  const next = f.listener(); lease = f.streams.acquire(f.client, 'fixture', 'a', next);
  assert.equal(next.statuses.at(-1), 'reconnecting'); assert.equal(f.calls.length, 1);
  for (const status of ['unauthorized', 'closed']) {
    f.calls.at(-1).options.onStatus(status);
    assert.equal(f.streams.peek(f.client, 'fixture', 'a'), undefined);
    lease.release(); lease = f.streams.acquire(f.client, 'fixture', 'a', f.listener());
  }
  assert.equal(f.calls.length, 3); f.streams.clear(f.client);
});

test('client/server identity isolates snapshots and lifecycle closes warm entries without a mounted chat', () => {
  const f = fixture(), active: boolean[] = [], stateListeners = new Set<(state: string) => void>();
  const appState = { currentState: 'active', addEventListener(_name: 'change', listener: (state: string) => void) { stateListeners.add(listener); return { remove() { stateListeners.delete(listener); } }; } };
  const stop = watchConversationStreamLifecycle(f.client, appState, value => active.push(value), f.streams);
  f.streams.acquire(f.client, 'first', 'a', f.listener()).release();
  f.calls[0].options.onEvent({ type: 'delta', conversationId: 'a', sessionId: 'p', attemptId: '1', text: 'First host' });
  assert.equal(f.streams.peek({} as any, 'first', 'a'), undefined);
  f.streams.acquire(f.client, 'second', 'a', f.listener()).release();
  assert.equal(f.calls[0].closed, true);
  assert.deepEqual(f.streams.peek(f.client, 'second', 'a')?.snapshot.messages, []);
  for (const listener of stateListeners) listener('background');
  assert.equal(f.calls[1].closed, true); assert.equal(f.streams.peek(f.client, 'second', 'a'), undefined);
  f.streams.acquire(f.client, 'second', 'a', f.listener()).release();
  stop(); assert.equal(f.calls[2].closed, true); assert.equal(stateListeners.size, 0); assert.deepEqual(active, [false]);
});

test('synchronous terminal connect and full active capacity leave no reusable dead entry', () => {
  const f = fixture();
  const terminal: any = { connect(options: any) { options.onStatus('unauthorized'); return { close() {} }; } };
  const listener = f.listener(); f.streams.acquire(terminal, 'fixture', 'a', listener).release();
  assert.equal(listener.statuses.at(-1), 'unauthorized'); assert.equal(f.streams.peek(terminal, 'fixture', 'a'), undefined);
  for (const id of ['a', 'b', 'c', 'd']) f.streams.acquire(f.client, 'fixture', id, f.listener());
  assert.throws(() => f.streams.acquire(f.client, 'fixture', 'e', f.listener()), /Too many/);
  assert.equal(f.calls.filter(call => !call.closed).length, 4); f.streams.clear(f.client);
});
