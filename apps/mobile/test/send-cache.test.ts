import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { URL } from 'node:url';

const require = createRequire(import.meta.url), ts = require('typescript');

// Execute the production statements with real SQLite. Only Expo's asynchronous
// native transport is replaced; no SQL, ownership rule or cache operation is mocked.
function fixture() {
  const database = new DatabaseSync(':memory:');
  let opens = 0;
  const module = { exports: {} as any };
  const source = readFileSync(new URL('../src/storage/cache.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  runInNewContext(output, { module, exports: module.exports,
    require(name: string) {
      assert.equal(name, 'expo-sqlite');
      return { async openDatabaseAsync(name: string) {
        assert.equal(name, 'ds-bot-mobile.db'); opens++;
        return {
          async execAsync(sql: string) { database.exec(sql); },
          async runAsync(sql: string, ...parameters: any[]) { return database.prepare(sql).run(...parameters); },
          async getFirstAsync(sql: string, ...parameters: any[]) { return database.prepare(sql).get(...parameters) ?? null; },
        };
      } };
    },
  });
  return { ...module.exports, opens: () => opens, close: () => database.close() };
}

test('send ownership claims absent/null slots, updates only its own ID and cannot overwrite another owner', async t => {
  const f = fixture(); t.after(f.close);
  for (const key of ['outgoing:bot:a', 'pending:bot:a']) {
    const original = { requestId: 'first', text: 'Original exact payload', attachments: [{ receiptId: 'upload' }] };
    assert.equal(await f.writeSendCache('host', key, original, null), true);
    assert.deepEqual(JSON.parse(JSON.stringify(await f.readCache('host', key))), original);
    assert.equal(await f.writeSendCache('host', key, { requestId: 'second' }, null), false, 'occupied slot cannot be claimed');
    assert.equal(await f.writeSendCache('host', key, { requestId: 'second' }, 'second'), false, 'different ID cannot update');
    assert.equal((await f.readCache('host', key)).text, original.text);
    assert.equal(await f.writeSendCache('host', key, { ...original, status: 'failed' }, 'first'), true);
    assert.equal((await f.readCache('host', key)).status, 'failed');
    assert.equal(await f.writeSendCache('host', key, null, 'first'), true);
    assert.equal(await f.readCache('host', key), null);
    assert.equal(await f.writeSendCache('host', key, { requestId: 'second', text: 'Newer payload' }, null), true);
    assert.equal(await f.writeSendCache('host', key, null, 'first'), false, 'late cleanup cannot delete a newer send');
    assert.equal((await f.readCache('host', key)).requestId, 'second');
  }
  assert.equal(await f.writeSendCache('host', 'outgoing:missing', { requestId: 'first' }, 'first'), false);
  assert.equal(await f.writeSendCache('other-host', 'outgoing:bot:a', { requestId: 'other' }, null), true);
  assert.equal((await f.readCache('host', 'outgoing:bot:a')).requestId, 'second');
  assert.equal(f.opens(), 1, 'all statements share one initialized database');
});

test('competing mounted senders can claim only one request and stale completion cannot clear its successor', async t => {
  const f = fixture(); t.after(f.close);
  const results = await Promise.all(['a', 'b'].map(requestId => f.writeSendCache('host', 'outgoing:chat', { requestId }, null)));
  assert.equal(results.filter(Boolean).length, 1);
  const owner = (await f.readCache('host', 'outgoing:chat')).requestId;
  assert.equal(await f.writeSendCache('host', 'outgoing:chat', null, owner), true);
  assert.equal(await f.writeSendCache('host', 'outgoing:chat', { requestId: 'successor' }, null), true);
  assert.equal(await f.writeSendCache('host', 'outgoing:chat', null, owner), false);
  assert.equal((await f.readCache('host', 'outgoing:chat')).requestId, 'successor');
});

test('clearing history preserves outgoing plus next draft and pending plus draft, while removing history/metadata', async t => {
  const f = fixture(); t.after(f.close);
  const retained = {
    'outgoing:bot:a': { requestId: 'intent', text: 'Text already moved into a bubble' },
    'draft:bot:a': 'Next draft typed while sending',
    'pending:bot:b': { requestId: 'uncertain', text: 'Uncertain original send' },
    'draft:bot:b': 'Editable pending draft',
    'archive:bot:c': [{ requestId: 'old-pairing' }],
  };
  for (const [key, value] of Object.entries(retained)) await f.writeCache('host', key, value);
  const removed = ['messages:bot:a', 'messages:bot:b', 'team', 'conversations', 'draft:bot:c', 'draft:no-owner', 'draft:null-owner', 'draft:foreign-owner'];
  for (const key of removed) await f.writeCache('host', key, `remove ${key}`);
  await f.writeCache('host', 'outgoing:null-owner', null);
  await f.writeCache('host', 'pending:null-owner', null);
  await f.writeCache('other-host', 'pending:foreign-owner', { requestId: 'foreign' });
  await f.writeCache('other-host', 'messages:bot:a', ['Other host history']);
  await f.clearCachedContent('host');
  for (const [key, value] of Object.entries(retained)) assert.deepEqual(JSON.parse(JSON.stringify(await f.readCache('host', key))), value, key);
  for (const key of removed) assert.equal(await f.readCache('host', key), null, key);
  assert.deepEqual(JSON.parse(JSON.stringify(await f.readCache('other-host', 'messages:bot:a'))), ['Other host history']);
  assert.equal((await f.readCache('other-host', 'pending:foreign-owner')).requestId, 'foreign');
});
