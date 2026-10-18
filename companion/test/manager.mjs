// Test-only adapter. The real Connection admits the owner; no test token or
// synthetic principal can authorize management. Never included in the package.
import { registerOwnerOperator } from '../../bridge/src/operator.mjs'

export const name = 'companion-delivery-manager'
export const inject = ['connection', 'pluginManager', 'webServer']
export function apply(ctx, config) {
  ctx.effect(() => registerOwnerOperator(ctx, '/companion-test-manager', async (method, payload, _signal, peer) => {
    if (peer?.principal?.kind !== 'owner') return { ok: false, error: { code: 'OWNER_REQUIRED' } }
    try {
      let value
      if (method === 'list') value = await ctx.pluginManager.listBundles()
      else if (method === 'plugins') value = await ctx.pluginManager.listPlugins()
      else if (method === 'install') value = await ctx.pluginManager.installBundle(config.archive, { enabled: false, saveExact: true, registry: 'https://registry.npmjs.org' })
      else if (method === 'remove') value = await ctx.pluginManager.removeBundle('ds-bot-mobile-app')
      else if (method === 'select' && ['ds-bot-mobile-app', 'ds-bot-mobile-bridge'].includes(payload.name) && typeof payload.enabled === 'boolean') value = await ctx.pluginManager.setBundleEnabled(payload.name, payload.enabled)
      else return { ok: false, error: { code: 'UNKNOWN_TEST_OPERATION' } }
      return { ok: true, value }
    } catch { return { ok: false, error: { code: 'MANAGER_REFUSED' } } }
  }))
}
