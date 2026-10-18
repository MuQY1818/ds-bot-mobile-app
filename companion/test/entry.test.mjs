import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('shared access mode isolates mounted requests and plugin unload removes its provider', async () => {
  let loaded, id = 0
  const rows = [], disposers = [], signals = []
  const react = { createElement(type, props) { return { type, props } }, useEffect() {}, useMemo() {}, useSyncExternalStore() {}, useState() {} }
  const context = {
    URL, AbortController, location: new URL('https://host.example/'), crypto: { randomUUID: () => `entry-${++id}` },
    fetch(_url, init) {
      signals.push(init.signal)
      return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('Aborted isolated request')), { once: true }))
    },
    document: { createElement: () => ({ remove() {} }), head: { append() {} } },
    window: { __ModuleLoader__: { load(definition) { loaded = definition.factory(name => { if (name === 'react-dom') return { createPortal() {} }; assert.equal(name, 'react'); return react }) } } },
  }
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), context)
  loaded.apply({ effect(fn) { disposers.push(fn()) }, slots: { inject(_name, register) { register() }, register(meta, render) { rows.push({ meta, render }); return () => {} } } })
  assert.deepEqual(rows.map(row => row.meta.name), ['shell.overlay', 'plugins.bundle.config'])
  const access = rows[0].meta.inject().access
  assert.equal(rows[1].meta.inject().access, access)
  assert.equal(access.store.getSnapshot().providers.length, 1)
  assert.equal(access.store.getSnapshot().providers[0].id, 'app')
  const createController = access.store.getSnapshot().providers[0].render().props.createController
  const first = createController(), second = createController()
  assert.notEqual(first, second)
  const requests = [first.create(), second.create()]
  assert.equal(signals.length, 2)
  first.dispose()
  assert.equal(signals[0].aborted, true); assert.equal(signals[1].aborted, false)
  assert.equal(second.snapshot().busy, true)
  for (const dispose of disposers) dispose()
  assert.equal(signals[1].aborted, true)
  assert.equal(access.store.getSnapshot().providers.length, 0)
  assert.equal(access.open(), false)
  await Promise.all(requests)
})
