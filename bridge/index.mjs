import { isAbsolute, resolve } from 'node:path'
import { createAdapter } from './src/adapter.mjs'
import { createMobileServer } from './src/server.js'
import { validateConfig } from './src/config.mjs'
import { registerOwnerOperator } from './src/operator.mjs'
export { Config } from './src/config.mjs'

export const name = 'ds-bot-mobile-bridge'
export const inject = ['connection', 'sessionController', 'webServer']
export async function startBridge(ctx, config) {
  validateConfig(config)
  if (!config?.home || !isAbsolute(config.home)) throw new Error('Set an absolute, dedicated bridge home; no DSH_HOME default is used.')
  const home = resolve(config.home)
  if (home === resolve(process.env.DSH_HOME ?? '/__unset__')) throw new Error('Bridge home must be separate from DSH_HOME.')
  // Synthetic transcript mode is intentionally unavailable in the production entry.
  const adapter = createAdapter({ connection: ctx.connection, sessionController: ctx.sessionController })
  try {
    await adapter.initialize()
    const server = await createMobileServer({ home, config, adapter })
    return { ...server, adapter }
  } catch (error) { await adapter.dispose(); throw error }
}
export function apply(ctx, config = {}) {
  validateConfig(config)
  ctx.effect(() => {
    let stopped = false
    let bridge
    let unregister
    const ready = (config.enabled === true ? startBridge(ctx, config) : Promise.resolve(null)).then(async value => {
      bridge = value
      if (stopped) return value?.close()
      unregister = registerOwnerOperator(ctx, '/mobile-operator', async (endpoint, payload, _signal, peer) => {
        // The Connection carrier authenticates the operator; explicitly fail
        // closed if a runtime does not provide its public owner principal.
        if (peer?.principal?.kind !== 'owner') return { ok: false, error: { code: 'OPERATOR_REQUIRED', message: 'An authenticated computer owner is required.', details: {} } }
        if (!bridge) return endpoint === 'status'
          ? { ok: true, value: { enabled: false, reason: 'CONFIGURATION_REQUIRED', message: 'Set enabled, a dedicated absolute home, and HTTPS transport before pairing.' } }
          : { ok: false, error: { code: 'CONFIGURATION_REQUIRED', message: 'Configure and enable the mobile bridge first.', details: {} } }
        try { return { ok: true, value: await bridge.operator(endpoint, payload) } }
        catch { return { ok: false, error: { code: 'OPERATOR_REFUSED', message: 'The operator request was refused.', details: {} } } }
      })
    }).catch(async error => { await bridge?.close(); throw error })
    // Keep the rejection observed without printing URLs, pairing credentials or state.
    ready.catch(() => ctx.emit?.('internal/error', new Error('Mobile bridge startup failed; verify dedicated config and team route readiness.')))
    return async () => { stopped = true; await ready.catch(() => {}); await unregister?.(); await bridge?.close() }
  }, 'ds-bot-mobile-bridge')
}
