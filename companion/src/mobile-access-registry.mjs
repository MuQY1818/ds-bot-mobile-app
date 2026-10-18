// Shared by independently installed bundles. Keep only provider metadata and
// navigation here; pairing material belongs to the mounted provider component.
const REGISTRY_KEY = Symbol.for('ds-bot.mobile-access.v1')

export function createMobileAccessRegistry({ onEmpty = () => {} } = {}) {
  const providers = new Map(), listeners = new Set()
  let serial = 0
  let state = Object.freeze({ open: false, activeId: null, leader: null, providers: Object.freeze([]) })
  const notify = () => { for (const listener of [...listeners]) listener() }
  const publish = patch => {
    if (Object.entries(patch).every(([key, value]) => state[key] === value)) return
    state = Object.freeze({ ...state, ...patch })
    notify()
  }
  const rebuild = () => {
    const available = Object.freeze([...providers.values()].map(entry => entry.provider)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)))
    const activeId = available.some(entry => entry.id === state.activeId) ? state.activeId : available[0]?.id ?? null
    publish({ providers: available, leader: available[0]?.id ?? null, activeId, open: available.length > 0 && state.open })
  }
  const store = Object.freeze({
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    // An ordinary account-menu open preserves the last selected available mode.
    open(id = state.activeId) {
      if (!providers.has(id)) return false
      publish({ open: true, activeId: id })
      return true
    },
    close() { publish({ open: false }) },
    select(id) {
      if (!providers.has(id)) return false
      publish({ activeId: id })
      return true
    },
  })
  return Object.freeze({
    version: 1,
    store,
    register({ id, label, order = 0, render }) {
      if (typeof id !== 'string' || !id.trim() || typeof label !== 'string' || !label.trim() || typeof render !== 'function' || !Number.isFinite(order)) {
        throw new TypeError('A mobile access provider needs an id, label, finite order and render function.')
      }
      const token = Symbol(id)
      const provider = Object.freeze({ id, label, order, render, instance: ++serial })
      providers.set(id, { token, provider })
      rebuild()
      let disposed = false
      const isCurrent = () => !disposed && providers.get(id)?.token === token
      return Object.freeze({
        id,
        store,
        isCurrent,
        open() { return isCurrent() ? store.open(id) : false },
        dispose() {
          if (disposed) return
          const current = isCurrent()
          disposed = true
          if (!current) return
          providers.delete(id)
          rebuild()
          if (!providers.size) {
            // Notify mounted Hosts before dropping their obsolete subscriptions.
            listeners.clear()
            onEmpty()
          }
        },
      })
    },
  })
}

export function registerMobileAccessProvider(provider) {
  let registry = globalThis[REGISTRY_KEY]
  if (!registry) {
    registry = createMobileAccessRegistry({ onEmpty() { if (globalThis[REGISTRY_KEY] === registry) delete globalThis[REGISTRY_KEY] } })
    // A rejected registration must not leave an empty global coordinator behind.
    const access = registry.register(provider)
    Object.defineProperty(globalThis, REGISTRY_KEY, { value: registry, configurable: true })
    return access
  }
  if (registry.version !== 1 || typeof registry.register !== 'function') throw new Error('Incompatible mobile access registry.')
  return registry.register(provider)
}
