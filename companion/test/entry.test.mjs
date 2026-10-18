import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('settings and bundle entries isolate requests while plugin unload disposes both', async () => {
  let loaded, id = 0
  const rows = [], disposers = [], signals = []
  const react = { createElement() {}, useEffect() {}, useMemo() {}, useSyncExternalStore() {}, useState() {} }
  const context = {
    URL, AbortController, location: new URL('https://host.example/'), crypto: { randomUUID: () => `entry-${++id}` },
    fetch(_url, init) {
      signals.push(init.signal)
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('Aborted isolated request')), { once: true }))
    },
    document: { createElement: () => ({ remove() {} }), head: { append() {} } },
    window: { __ModuleLoader__: { load(definition) { loaded = definition.factory(name => { assert.equal(name, 'react'); return react }) } } },
  }
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), context)
  loaded.apply({ effect(fn) { disposers.push(fn()) }, slots: { inject(_name, register) { register() }, register(meta, render) { rows.push({ meta, render }); return () => {} } } })
  assert.deepEqual(rows.map(row => row.meta.name), ['plugins.bundle.config', 'settings.section'])
  assert.equal(rows[1].meta.id, 'ds-bot-mobile-app'); assert.equal(rows[1].meta.label(), '移动设备')
  assert.equal(rows[0].render, rows[1].render)
  const first = rows[0].meta.inject().createController(), second = rows[1].meta.inject().createController()
  assert.notEqual(first, second)
  const requests = [first.create(), second.create()]
  assert.equal(signals.length, 2)
  first.dispose()
  assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false)
  assert.equal(second.snapshot().busy, true)
  for (const dispose of disposers) dispose()
  assert.equal(signals[1].aborted, true)
  await Promise.all(requests)
})
