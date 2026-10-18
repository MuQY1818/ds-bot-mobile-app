import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { conversationStreams } from '../src/logic/conversation-streams.ts';

const require = createRequire(import.meta.url), ts = require('typescript');
function mountChat(deferHistory = false) {
  const slots: any[] = [];
  let cursor = 0, dirty = false, focused = true, current: any;
  let activeStreams = 0, maxStreams = 0, draftReads = 0, historyReads = 0;
  let finishHistory: (() => void) | undefined;
  const effects: Array<() => void> = [];
  const listeners = new Set<(state: string) => void>();
  const same = (a: any[], b: any[]) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const react = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value: any) => { const next = typeof value === 'function' ? value(slots[index]) : value; if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; } }];
    },
    useRef(initial: any) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback(callback: any, deps: any[]) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback }; return slots[index].callback; },
    useEffect(effect: () => void | (() => void), deps: any[]) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  const storage = {
    readCache: async () => null, writeCache: async () => {}, tokenStore: { get: async () => null },
    cache: { getMessages: async () => [], getDraft: async () => { draftReads++; return 'cached draft'; }, setDraft: async () => {}, setMessages: async () => {} },
  };
  const client = {
    messages: async () => {
      historyReads++;
      if (deferHistory) await new Promise<void>(resolve => { finishHistory = resolve; });
      return { messages: [], cursor: null };
    },
    connect: () => {
      activeStreams++; maxStreams = Math.max(maxStreams, activeStreams);
      let closed = false;
      return { close() { if (!closed) { closed = true; activeStreams--; } } };
    },
  };
  const module = { exports: {} as any };
  const source = readFileSync(new URL('../src/hooks/useConversation.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  runInNewContext(output, { module, exports: module.exports, AbortController,
    setTimeout: () => 1, clearTimeout() {},
    require(name: string) {
      if (name === 'react') return react;
      if (name === 'react-native') return { AppState: { currentState: 'active', addEventListener(_name: string, listener: (state: string) => void) { listeners.add(listener); return { remove() { listeners.delete(listener); } }; } } };
      if (name === '../components/ScreenActivity') return { useScreenActivity: () => focused };
      if (name === '../storage') return storage;
      if (name === '../logic/conversation-streams') return { conversationStreams };
      if (name === '@ds-bot/mobile-sdk') return { mergeMessages: (old: any[], next: any[]) => [...old, ...next] };
      if (name === '../logic/mobile-access') return { mobileActionAllowed: () => false };
      if (name === '../types') return { errorText: String };
      if (name === 'expo-crypto' || name === '../logic/submissions') return {};
      throw Error(name);
    },
  });
  const host = { serverId: 'fixture' };
  function render() { cursor = 0; dirty = false; current = module.exports.useConversation(client, host, 'bot:a', {}); for (const effect of effects.splice(0)) effect(); }
  render();
  return {
    async flush() { for (let i = 0; i < 20; i++) { await Promise.resolve(); if (dirty) render(); } },
    focus(value: boolean) { focused = value; render(); },
    foreground(value: boolean) { for (const listener of [...listeners]) listener(value ? 'active' : 'background'); },
    edit(value: string) { current.setDraft(value); render(); },
    draft: () => current.draft,
    stats: () => ({ activeStreams, maxStreams, draftReads, historyReads }),
    finishHistory: () => finishHistory?.(),
    dispose() { for (const slot of slots) slot?.cleanup?.(); conversationStreams.clear(client as any); },
  };
}

test('retained chat detaches on blur, reuses its lease and never rehydrates an edited draft', async () => {
  const chat = mountChat();
  await chat.flush();
  assert.deepEqual(chat.stats(), { activeStreams: 1, maxStreams: 1, draftReads: 1, historyReads: 1 });
  chat.edit('edited while viewing conversation');
  chat.focus(false); await chat.flush();
  assert.equal(chat.stats().activeStreams, 1);
  chat.foreground(false); chat.foreground(true); await chat.flush();
  assert.equal(chat.stats().historyReads, 1);
  chat.focus(true); await chat.flush();
  assert.equal(chat.draft(), 'edited while viewing conversation');
  assert.deepEqual(chat.stats(), { activeStreams: 1, maxStreams: 1, draftReads: 1, historyReads: 2 });
  chat.foreground(false); assert.equal(chat.stats().activeStreams, 0);
  chat.foreground(true); await chat.flush();
  assert.equal(chat.stats().activeStreams, 1);
  assert.equal(chat.stats().draftReads, 1);
  chat.dispose(); assert.equal(chat.stats().activeStreams, 0);
});

test('a slow history read does not block the stream and cannot restart it after background', async () => {
  const chat = mountChat(true);
  await chat.flush();
  assert.equal(chat.stats().historyReads, 1);
  assert.equal(chat.stats().activeStreams, 1);
  chat.foreground(false); chat.focus(false); chat.finishHistory(); await chat.flush();
  assert.equal(chat.stats().activeStreams, 0);
  assert.equal(chat.stats().maxStreams, 1);
  chat.dispose();
});
