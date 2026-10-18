const METHODS = new Set(['status', 'pairing.create', 'pairing.approve', 'pairing.deny', 'device.revoke'])
export function createOperatorClient({ root, fetchImpl = fetch, location = globalThis.location, uuid = () => crypto.randomUUID() }) {
  const base = new URL(root)
  const desktop = base.protocol === 'dsh-app:' && base.host === 'app' && base.pathname === '/'
  if ((!['http:', 'https:'].includes(base.protocol) && !desktop) || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/')) throw Error('Invalid DSH application root')
  if (location && (base.protocol !== location.protocol || base.host !== location.host)) throw Error('Cross-origin operator access refused')
  return async (method, payload = {}, signal) => {
    if (!METHODS.has(method)) throw Error('Unsupported device operation')
    const rpcId = uuid()
    const response = await fetchImpl(new URL(`mobile-operator/${method}`, base), { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId, method, payload }), signal })
    if (!response.ok) throw Object.assign(Error(response.status === 404 || response.status === 405 ? 'Mobile Bridge is not enabled. Install and configure the Bridge first.' : response.status === 401 || response.status === 403 ? 'Open this page in the authenticated computer owner session.' : 'Could not reach Mobile Bridge. Check the host connection.'), { code: `HTTP_${response.status}` })
    const body = await response.json()
    if (body?.type !== 'server-response' || body.rpcId !== rpcId || body.result?.ok !== true) throw Error('The device operation was refused. Refresh status before trying again.')
    return body.result.value
  }
}
