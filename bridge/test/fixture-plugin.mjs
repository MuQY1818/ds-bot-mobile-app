// Loopback fixture operator; this module is excluded from the release package.
import { createServer } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { startBridge } from '../index.mjs'
export const name = 'candidate-integration-fixture'
export const inject = ['connection', 'sessionController', 'webServer']
export function apply(ctx, config) {
  ctx.effect(() => {
    let bridge, operator, peer, stopped = false
    const ready = (async () => {
      const dispatcher = ctx.connection.createSharedFetchHandler('/api')
      peer = ctx.connection.createPeer({ principal: { kind: 'owner' } })
      const call = async (endpoint, payload = {}) => {
        const response = await dispatcher.fetch(new Request('http://fixture.invalid/api/bot', { method: 'POST', body: JSON.stringify({ endpoint, payload }) }), peer)
        const result = await response.json()
        if (result.ok !== true) throw Object.assign(Error('Synthetic setup refused'), { code: result.error?.code })
        return result.value
      }
      bridge = await startBridge(ctx, { home: config.home, port: 0, host: '127.0.0.1', devAllowInsecure: true })
      if (stopped) return bridge.close()
      let group
      const createGroup = async () => {
        if (group) return group
        const view = await call('state'), first = view.bots[0]
        const second = await call('create-bot', { name: 'CandidateMember', role: 'Fixture', model: view.defaultModel })
        const room = await call('create-room', { name: 'Candidate group', members: [first.id, second.id], admin: first.id })
        await call('update-room', { id: room.id, mode: 'everyone' })
        group = { id: room.id, members: room.members }
        return group
      }
      operator = createServer(async (request, response) => {
        if (request.headers['x-fixture'] !== 'bridge-test-only') { response.writeHead(403); response.end(); return }
        try {
          const chunks = []; let length = 0
          for await (const chunk of request) { length += chunk.length; if (length > 65536) throw Error('Too large'); chunks.push(chunk) }
          const { endpoint, payload } = JSON.parse(Buffer.concat(chunks).toString())
          let result
          if (endpoint === 'test.seed-secret') { await call('secret-set', { name: 'BRIDGE_FIXTURE_TOKEN', value: 'ds-bot-test-known-secret-123456789', scope: 'all' }); result = { seeded: true } }
          else if (endpoint === 'test.seed-labels') {
            const view = await call('state')
            await call('update-bot', { id: view.bots[0].id, name: 'Bot ds-bot-test-known-secret-123456789' })
            await call('update-room', { id: group.id, name: 'Room ds-bot-test-known-secret-123456789' })
            result = { seeded: true }
          }
          else if (endpoint === 'test.create-group') result = await createGroup()
          else if (endpoint === 'test.group-state') { const value = await call('state'); result = { rooms: value.rooms.map(room => ({ id: room.id, parts: room.parts, members: room.members })) } }
          else if (endpoint === 'test.seed') { const value = await call('state'); result = { bots: value.bots.map(bot => ({ id: bot.id, sessionId: bot.sessionId })) } }
          else result = await bridge.operator(endpoint, payload)
          response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(result))
        } catch (error) { response.writeHead(error.status ?? 500); response.end(JSON.stringify({ code: error.code ?? 'FIXTURE_ERROR' })) }
      })
      await new Promise(resolve => operator.listen(0, '127.0.0.1', resolve))
      const seeded = await createGroup(), view = await call('state')
      await writeFile(config.ready, JSON.stringify({ bridgeUrl: bridge.url, operatorUrl: `http://127.0.0.1:${operator.address().port}`, botId: view.bots[0].id, sessionId: view.bots[0].sessionId, groupId: seeded.id, memberIds: seeded.members }), { mode: 0o600 })
    })()
    ready.catch(error => process.stderr.write(`Candidate fixture startup failed: ${error.code ?? error.name}\n`))
    return async () => { stopped = true; await ready.catch(() => {}); operator?.closeAllConnections(); if (operator) await new Promise(resolve => operator.close(resolve)); await bridge?.close(); await peer?.dispose() }
  })
}
