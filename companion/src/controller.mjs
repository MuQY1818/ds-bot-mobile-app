export function createDeviceController({ call, now = Date.now }) {
  const listeners = new Set(), requests = new Set()
  let state = { status: null, pairing: null, busy: false, error: '', confirmRevoke: null, copied: false }
  let disposed = false, generation = 0, refreshEpoch = 0, refreshFlight = null, operating = false
  const emit = patch => { if (disposed) return; state = { ...state, ...patch }; for (const listener of listeners) listener() }
  const invoke = async (method, payload) => {
    const request = new AbortController(); requests.add(request)
    try { return await call(method, payload, request.signal) } finally { requests.delete(request) }
  }
  function refresh({ afterCurrent = false } = {}) {
    if (disposed) return Promise.resolve()
    // Polls share one request even when its RTT exceeds the poll interval.
    // Mutations explicitly wait for a new request after any older flight.
    if (refreshFlight) return afterCurrent ? refreshFlight.then(() => refresh()) : refreshFlight
    const issued = refreshEpoch
    refreshFlight = (async () => {
      try {
        const status = await invoke('status', {})
        if (!disposed && issued === refreshEpoch) emit({ status, error: '', ...(status?.enabled === true ? {} : { pairing: null, copied: false }) })
      } catch (error) { if (!disposed && issued === refreshEpoch) emit({ status: null, pairing: null, error: error.message || 'Could not refresh devices.' }) }
    })().finally(() => { refreshFlight = null })
    return refreshFlight
  }
  async function operation(method, payload = {}) {
    if (disposed || operating) return
    operating = true
    const issued = ++generation
    refreshEpoch++
    emit({ busy: true, error: '', ...(method === 'pairing.create' ? { pairing: null, copied: false } : {}) })
    try {
      const value = await invoke(method, payload)
      if (disposed || issued !== generation) return
      if (method === 'pairing.create') {
        const url = new URL(value.url)
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !value.code || !value.serverId || !(value.expiresAt > now())) throw Error('Bridge returned invalid HTTPS pairing data.')
        emit({ pairing: { url: value.url, code: value.code, serverId: value.serverId, expiresAt: value.expiresAt } })
      }
      emit({ confirmRevoke: null })
      refreshEpoch++
      await refresh({ afterCurrent: true })
    } catch (error) { if (!disposed && issued === generation) emit({ error: error.message || 'The device operation failed.' }) }
    finally { if (issued === generation) { operating = false; if (!disposed) emit({ busy: false }) } }
  }
  return {
    snapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    refresh,
    create: () => operation('pairing.create'),
    decide(requestId, approved) {
      if (!state.status?.pending?.some(item => item.requestId === requestId)) return
      return operation(approved ? 'pairing.approve' : 'pairing.deny', { requestId })
    },
    confirmRevoke(id) { if (state.status?.devices?.some(item => item.id === id && !item.revokedAt)) emit({ confirmRevoke: id }) },
    cancelRevoke: () => emit({ confirmRevoke: null }),
    revoke(id) { if (state.confirmRevoke === id) return operation('device.revoke', { id }) },
    tick() { if (state.pairing && state.pairing.expiresAt <= now()) emit({ pairing: null, copied: false }) },
    clearPairing() { generation++; refreshEpoch++; operating = false; for (const request of requests) request.abort(); emit({ pairing: null, copied: false, busy: false, confirmRevoke: null }) },
    async copy(clipboard) {
      const pairing = state.pairing
      if (!pairing || pairing.expiresAt <= now()) return
      try { await clipboard.writeText(JSON.stringify(pairing)); if (!disposed && state.pairing === pairing) emit({ copied: true, error: '' }) }
      catch { emit({ error: 'Copy was denied. Expand manual pairing data to copy it.' }) }
    },
    dispose() { if (disposed) return; disposed = true; generation++; for (const request of requests) request.abort(); state = { ...state, pairing: null, status: null, confirmRevoke: null }; listeners.clear() },
  }
}
