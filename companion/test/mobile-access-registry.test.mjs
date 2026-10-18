import test from 'node:test'
import assert from 'node:assert/strict'
import { createMobileAccessRegistry, registerMobileAccessProvider } from '../src/mobile-access-registry.mjs'

const web = { id: 'web', label: 'Web', order: 10, render: () => 'web contents' }
const app = { id: 'app', label: 'App', order: 20, render: () => 'app contents' }

test('either independent provider can open and close the shared shell', () => {
  for (const provider of [web, app]) {
    const registry = createMobileAccessRegistry(), access = registry.register(provider)
    assert.equal(access.store.getSnapshot().open, false)
    assert.equal(access.store.getSnapshot().leader, provider.id)
    assert.equal(access.open(), true)
    assert.equal(access.store.getSnapshot().open, true)
    assert.equal(access.store.getSnapshot().activeId, provider.id)
    access.store.close(); assert.equal(access.store.getSnapshot().open, false)
    access.dispose()
    assert.deepEqual(access.store.getSnapshot(), { open: false, activeId: null, leader: null, providers: [] })
    assert.equal(access.open(), false)
  }
})

test('both bundles share one deterministic leader and mode selection', () => {
  const registry = createMobileAccessRegistry()
  const native = registry.register(app), browser = registry.register(web)
  assert.equal(native.store, browser.store)
  assert.equal(native.store.getSnapshot().leader, 'web')
  assert.deepEqual(native.store.getSnapshot().providers.map(item => item.id), ['web', 'app'])
  native.open(); assert.equal(browser.store.getSnapshot().activeId, 'app')
  browser.store.close(); browser.store.open()
  assert.equal(browser.store.getSnapshot().activeId, 'app', 'account entry preserves the selected mode')
  browser.store.select('web'); assert.equal(native.store.getSnapshot().activeId, 'web')
  assert.equal(native.store.select('missing'), false)
  assert.equal(native.store.open('missing'), false)
  browser.dispose(); native.dispose()
})

test('leader disposal hands off without closing a surviving active mode', () => {
  const registry = createMobileAccessRegistry()
  const browser = registry.register(web), native = registry.register(app)
  native.open(); browser.dispose()
  const state = native.store.getSnapshot()
  assert.equal(state.leader, 'app'); assert.equal(state.activeId, 'app'); assert.equal(state.open, true)
  assert.equal(browser.isCurrent(), false); assert.equal(native.isCurrent(), true)
  native.dispose()
})

test('removing the active provider selects an available mode in the open dialog', () => {
  const registry = createMobileAccessRegistry()
  const browser = registry.register(web), native = registry.register(app)
  native.open(); native.dispose()
  assert.equal(browser.store.getSnapshot().activeId, 'web')
  assert.equal(browser.store.getSnapshot().open, true)
  browser.dispose()
})

test('a replaced registration cannot render as leader or dispose its replacement', () => {
  const registry = createMobileAccessRegistry()
  const old = registry.register(web), replacement = registry.register({ ...web, render: () => 'replacement' })
  assert.equal(old.isCurrent(), false); assert.equal(old.open(), false)
  assert.equal(replacement.isCurrent(), true)
  old.dispose(); assert.equal(replacement.store.getSnapshot().providers.length, 1)
  replacement.open(); assert.equal(replacement.store.getSnapshot().open, true)
  replacement.dispose()
})

test('snapshots are stable and immutable until state changes; last disposal drops listeners', () => {
  let emptied = 0, changed = 0
  const registry = createMobileAccessRegistry({ onEmpty: () => emptied++ }), access = registry.register(web)
  const initial = access.store.getSnapshot(), unsubscribe = access.store.subscribe(() => changed++)
  assert.equal(access.store.getSnapshot(), initial)
  assert.ok(Object.isFrozen(initial)); assert.ok(Object.isFrozen(initial.providers)); assert.ok(Object.isFrozen(initial.providers[0]))
  access.store.select('web'); assert.equal(changed, 0)
  access.open(); assert.equal(changed, 1)
  access.dispose(); assert.equal(changed, 2); assert.equal(emptied, 1)
  access.dispose(); unsubscribe(); assert.equal(emptied, 1)
  const next = registry.register(app); next.open(); assert.equal(changed, 2)
  next.dispose()
})

test('registry stores only provider metadata and never invokes or caches rendered secrets', () => {
  let renders = 0
  const registry = createMobileAccessRegistry()
  const access = registry.register({ ...web, url: 'https://secret.invalid', code: 'private-code', token: 'private-token', render() { renders++; return { code: 'private-code' } } })
  access.open(); access.store.close(); access.store.select('web')
  assert.equal(renders, 0)
  assert.deepEqual(Object.keys(access.store.getSnapshot().providers[0]).sort(), ['id', 'instance', 'label', 'order', 'render'])
  assert.doesNotMatch(JSON.stringify(access.store.getSnapshot()), /private-code|private-token|secret\.invalid/)
  access.dispose(); assert.equal(access.store.getSnapshot().providers.length, 0)
})

test('independent module copies coordinate through the versioned Symbol and clean it last', async () => {
  const key = Symbol.for('ds-bot.mobile-access.v1')
  assert.equal(globalThis[key], undefined)
  const copy = await import('../src/mobile-access-registry.mjs?independent-app-copy')
  const browser = registerMobileAccessProvider(web), native = copy.registerMobileAccessProvider(app)
  assert.equal(browser.store, native.store)
  assert.equal(Object.keys(globalThis).includes(String(key)), false)
  browser.dispose(); assert.ok(globalThis[key])
  native.dispose(); assert.equal(globalThis[key], undefined)
  const later = copy.registerMobileAccessProvider(app)
  assert.notEqual(later.store, browser.store)
  later.dispose(); assert.equal(globalThis[key], undefined)
})

test('invalid registrations fail without creating a provider or rendering anything', () => {
  const registry = createMobileAccessRegistry()
  for (const invalid of [{ ...web, id: '' }, { ...web, label: '' }, { ...web, order: Infinity }, { ...web, render: undefined }]) {
    assert.throws(() => registry.register(invalid), TypeError)
  }
  assert.equal(registry.store.getSnapshot().providers.length, 0)
  assert.throws(() => registerMobileAccessProvider({ ...web, render: undefined }), TypeError)
  assert.equal(globalThis[Symbol.for('ds-bot.mobile-access.v1')], undefined)
})
