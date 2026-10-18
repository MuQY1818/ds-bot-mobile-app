// Test-only adapter to public pluginManager methods. Uses the real owner
// Connection carrier; there is no fixture credential or synthetic principal.
import { registerOwnerOperator } from '../src/operator.mjs'

export const name = 'bridge-delivery-manager-fixture'
export const inject = ['connection', 'pluginManager', 'sessionController', 'webServer']
export function apply(ctx) {
  console.log('DELIVERY_READINESS', JSON.stringify({ manager: Boolean(ctx.get('pluginManager')), sessions: Boolean(ctx.get('sessionController')), profile: Boolean(ctx.get('profileContext')) }))
  ctx.effect(() => registerOwnerOperator(ctx, '/delivery-manager', async (endpoint, payload, _signal, peer) => {
    if (peer?.principal?.kind !== 'owner') return { ok: false, error: { code: 'OPERATOR_REQUIRED', message: 'Authenticated owner required.', details: {} } }
    try {
      let value
      if (endpoint === 'probe') value = { manager: Boolean(ctx.get('pluginManager')), sessions: Boolean(ctx.get('sessionController')), owner: peer.principal.kind === 'owner' }
      else if (endpoint === 'list') value = await ctx.pluginManager.listBundles()
      else if (endpoint === 'select' && typeof payload?.enabled === 'boolean') value = await ctx.pluginManager.setBundleEnabled('ds-bot-mobile-bridge', payload.enabled)
      else return { ok: false, error: { code: 'NOT_FOUND', message: 'Unknown fixture management operation.', details: {} } }
      return { ok: true, value }
    } catch { return { ok: false, error: { code: 'MANAGEMENT_FAILED', message: 'Public plugin manager refused the operation.', details: {} } } }
  }))
}
