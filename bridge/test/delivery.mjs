import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, access, cp, symlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import WebSocket from 'ws'
import { MobileClient, MemoryTokenStore } from '../../packages/mobile-sdk/index.js'

const root = resolve(import.meta.dirname, '..')
const area = join(root, 'fixture')
const fixtureSource = resolve(process.env.BRIDGE_TEST_BOT ?? join(root, 'fixture/extended/package'))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
assert.match(manifest.version, /^0\.0\.\d+$/)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const inputs = ['package.json', ...manifest.files]
const sourceHashes = new Map(await Promise.all(inputs.map(async path => [path, digest(await readFile(join(root, path)))])))
const verifySources = async () => { for (const [path, hash] of sourceHashes) assert.equal(digest(await readFile(join(root, path))), hash, `Candidate changed during delivery: ${path}; repack required`) }
await mkdir(area, { recursive: true })
const home = await mkdtemp(join(area, '.dsh-test-delivery-'))
const profile = join(home, 'profiles', 'web')
await mkdir(profile, { recursive: true })
const env = { PATH: process.env.PATH, HOME: home, DSH_HOME: home, TMPDIR: process.env.TMPDIR ?? '/tmp', LANG: 'en_US.UTF-8', npm_config_registry: 'https://registry.npmjs.org', npm_config_cache: join(area, '.npm-delivery-cache') }
const children = []
let client, socket, current, cookie, base
let passed = 0
const check = label => { passed++; console.log(`PASS ${label}`) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(run, ms = 60_000) { const end = Date.now() + ms; let error; while (Date.now() < end) { try { return await run() } catch (cause) { error = cause; await delay(100) } } throw error }
function command(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 600_000, maxBuffer: 5 * 1024 * 1024 })
  if (result.status !== 0) throw Object.assign(Error('Isolated package command failed'), { code: `COMMAND_${result.status}` })
  return result.stdout
}
function start(label, args, extra = {}) {
  const child = spawn(process.execPath, args, { cwd: profile, env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
  const item = { child, label, output: '' }; children.push(item)
  child.stdout.on('data', bytes => { item.output += bytes }); child.stderr.on('data', bytes => { item.output += bytes })
  return item
}
async function stop(item) {
  if (!item || item.child.exitCode !== null || item.child.signalCode !== null) return
  item.child.kill('SIGTERM')
  await Promise.race([once(item.child, 'exit'), delay(5000)])
  if (item.child.exitCode === null && item.child.signalCode === null) { item.child.kill('SIGKILL'); await once(item.child, 'exit') }
}
async function port() { const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value }
async function rpc(channel, endpoint, payload = {}, authenticated = true) {
  const response = await fetch(`${base}${channel}/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { cookie } : {}) }, body: JSON.stringify({ type: 'client-request', rpcId: 'delivery', method: endpoint, payload }) })
  if (!authenticated) return response
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.result?.ok, true, body.result?.error?.code)
  return body.result.value
}
async function boot(mockPort, webPort) {
  base = `http://127.0.0.1:${webPort}`
  current = start('public-dsh', [join(profile, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'web', '--no-open', '--port', String(webPort)], { DEEPSEEK_BASE_URL: `http://127.0.0.1:${mockPort}/v1`, DEEPSEEK_API_KEY: 'ds-bot-test-mock-only' })
  const url = await until(() => {
    if (current.child.exitCode !== null) throw Error(`Public DSH exited ${current.child.exitCode}; log bytes=${current.output.length}`)
    const match = current.output.match(/dsh web: (http:\/\/[^\s]+\?token=[^\s]+)/)
    assert.ok(match, 'waiting for public CLI owner login URL')
    return match[1]
  })
  // Synthetic launch credentials stay only in memory; no test operator bypass.
  base = new URL(url).origin
  const login = await fetch(url, { redirect: 'manual' })
  assert.ok([302, 303].includes(login.status), `owner login redirect: ${login.status}`)
  cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  assert.ok(cookie)
  await until(async () => {
    const probe = await rpc('/delivery-manager', 'probe')
    assert.equal(probe.owner, true); assert.equal(probe.manager, true); assert.equal(probe.sessions, true)
    return rpc('/delivery-manager', 'list')
  }, 10_000)
}
try {
  // Reuse the already-created patched fixture, never regenerate/apply its patch.
  await access(join(fixtureSource, 'index.js'))
  const bridgeArchive = process.argv[2] ? resolve(process.argv[2])
    : join(home, JSON.parse(command('npm', ['pack', '--json', '--pack-destination', home]))[0].filename)
  await access(bridgeArchive)
  await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'isolated-public-bridge-delivery', private: true, dependencies: { '@deepseek-ai/dsh': '0.2.1-rc.2', 'ds-bot-mobile-bridge': `file:${bridgeArchive}` }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } }))
  console.log('Installing public DSH and packed bridge into a fresh profile...')
  command('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline', '--registry=https://registry.npmjs.org'], profile)
  // DS Bot is a frozen test fixture, not an installation or patch target. Copy
  // it outside node_modules so installing/removing the bridge cannot prune it.
  const fixtureBot = join(home, 'fixture-ds-bot')
  await cp(fixtureSource, fixtureBot, { recursive: true, filter: source => !source.includes('/node_modules') })
  await symlink(join(profile, 'node_modules'), join(fixtureBot, 'node_modules'))
  const fixturePatch = `- insert:\n    - id: bot\n      name: ${JSON.stringify(join(fixtureBot, 'index.js'))}\n    - id: delivery-manager-fixture\n      name: ${JSON.stringify(join(root, 'test/delivery-operator.mjs'))}\n`
  await writeFile(join(profile, 'cordis.patch.yml'), fixturePatch)
  const installed = JSON.parse(await readFile(join(profile, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'))
  assert.equal(installed.version, '0.2.1-rc.2')
  assert.equal(JSON.parse(await readFile(join(profile, 'node_modules/ds-bot-mobile-bridge/package.json'), 'utf8')).version, manifest.version)
  for (const [path, hash] of sourceHashes) assert.equal(digest(await readFile(join(profile, 'node_modules/ds-bot-mobile-bridge', path))), hash, `Archive source mismatch: ${path}`)
   check(`clean profile installs exact public npm DSH 0.2.1-rc.2 and packed bridge ${manifest.version}`)
  const mockPort = await port(), webPort = await port()
  start('mock-model', [join(root, '../ds-bot/dev/mock-llm.mjs')], { MOCK_PORT: String(mockPort), MOCK_LOG: join(home, 'mock.jsonl'), MOCK_DELAY_MS: '20', MOCK_JITTER_MS: '0' })
  await boot(mockPort, webPort)
  const bundles = await rpc('/delivery-manager', 'list')
  assert.ok(bundles.some(row => row.name === 'ds-bot-mobile-bridge' && row.version === manifest.version && row.enabled === false))
  const enabled = await rpc('/delivery-manager', 'select', { enabled: true })
  assert.ok(['applied', 'restart-required'].includes(enabled.application))
  if (enabled.application === 'restart-required') { await stop(current); await boot(mockPort, webPort) }
  const idle = await until(() => rpc('/mobile-operator', 'status'))
  assert.equal(idle.enabled, false); assert.equal(idle.reason, 'CONFIGURATION_REQUIRED')
  await assert.rejects(access(join(home, 'bridge-owned-state')))
  check('standard bundle discovery/selection remains inert before explicit owner configuration')
  const denied = await rpc('/mobile-operator', 'pairing.create', {}, false)
  assert.equal(denied.status, 401)
  const envelope = JSON.stringify({ type: 'client-request', rpcId: 'origin-check', method: 'status', payload: {} })
  assert.equal((await fetch(`${base}/mobile-operator/status`, { method: 'POST', headers: { cookie, origin: 'https://untrusted.invalid', 'content-type': 'application/json' }, body: envelope })).status, 403)
  assert.equal((await fetch(`${base}/mobile-operator/pairing.create`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: envelope })).status, 400)
  check('real public carrier rejects unauthenticated/cross-origin owner requests and mismatched envelopes')
  await stop(current)
  await writeFile(join(profile, 'cordis.patch.yml'), fixturePatch + `- id: ds-bot-mobile-bridge\n  config:\n    enabled: true\n    home: ${JSON.stringify(join(home, 'bridge-owned-state'))}\n    host: 127.0.0.1\n    port: 0\n    devAllowInsecure: true\n    allowedOrigins: []\n`)
  await boot(mockPort, webPort)
  let status = await until(async () => { const value = await rpc('/mobile-operator', 'status'); assert.equal(value.enabled, true); return value })
  const bridgeUrl = status.url
  const discovery = await (await fetch(`${bridgeUrl}/mobile/v1/info`)).json()
  assert.equal(discovery.capabilities.send, true); assert.equal(discovery.capabilities.history, true); assert.deepEqual(discovery.compatibility.missing, [])
  check('configured packaged entry starts on an allocated port and discovers the existing three-interface fixture')
  client = new MobileClient({ baseUrl: bridgeUrl, allowInsecure: true, tokenStore: new MemoryTokenStore(), WebSocket })
  const pairing = await rpc('/mobile-operator', 'pairing.create')
  const claim = await client.pair(pairing.code, 'Isolated delivery device')
  assert.equal((await client.completePairing(claim.claimToken)).status, 'pending')
  await rpc('/mobile-operator', 'pairing.approve', { requestId: claim.requestId })
  const session = await client.completePairing(claim.claimToken)
  check('real carrier owner principal creates and approves pairing without fixture operator admission')
  const state = await client.state(), bot = state.bots[0]
   const botCall = async (endpoint, payload = {}) => {
     const response = await fetch(`${base}/api/bot`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }) })
     assert.equal(response.status, 200)
     const result = await response.json(); assert.equal(result.ok, true); return result.value
   }
   const member = await botCall('create-bot', { name: 'DeliveryMember', role: 'Fixture', model: state.defaultModel })
   const room = await botCall('create-room', { name: 'Delivery group', members: [bot.id, member.id], admin: bot.id })
   const list = await client.conversations()
   assert.equal(discovery.capabilities.groups, true)
   assert.ok(list.conversations.some(row => row.id === room.id && row.kind === 'room' && row.sessionId === room.id))
   assert.ok((await client.state()).rooms.some(row => row.id === room.id))
   check('exact installed group package exposes a nonempty public group list through the real SDK')
  const request = { conversationId: bot.id, sessionId: bot.sessionId, requestId: 'delivery_stable_1', text: 'public package delivery hello' }
  assert.equal((await client.submit(request)).accepted, true)
  await until(async () => { const page = await client.messages(bot.id); assert.equal(page.messages.filter(row => row.text === request.text).length, 1); assert.ok(page.messages.some(row => row.role === 'assistant')) })
  assert.deepEqual(await client.submission(request.requestId), await client.submit(request))
  check('original SDK packed fixture text send, stable receipt and mock assistant history')
  client.dispose(); client = null
  await stop(current)
  await boot(mockPort, webPort)
  status = await until(() => rpc('/mobile-operator', 'status'))
  assert.ok(status.devices.some(device => device.id === session.deviceId))
  const resumed = await fetch(`${status.url}/mobile/v1/submissions/${request.requestId}`, { headers: { authorization: `Bearer ${session.accessToken}` } })
  assert.equal(resumed.status, 200); assert.equal((await resumed.json()).accepted, true)
  check('stop/restart with dedicated state retains approved device and accepted receipt')
  socket = new WebSocket(status.url.replace('http:', 'ws:') + '/mobile/v1/events')
  await once(socket, 'open')
  const frames = []
  socket.on('message', bytes => frames.push(JSON.parse(bytes)))
  socket.send(JSON.stringify({ type: 'auth', token: session.accessToken, conversationId: bot.id }))
  await until(() => assert.ok(frames.some(frame => frame.type === 'reset')))
  const closed = once(socket, 'close')
  await rpc('/mobile-operator', 'device.revoke', { id: session.deviceId })
  assert.equal((await closed)[0], 4403); socket = null
  assert.equal((await fetch(`${status.url}/mobile/v1/state`, { headers: { authorization: `Bearer ${session.accessToken}` } })).status, 401)
  assert.equal((await fetch(`${status.url}/mobile/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }) })).status, 401)
  check('real owner revocation disconnects WS and rejects both device credentials')
  const disabled = await rpc('/delivery-manager', 'select', { enabled: false })
  assert.ok(['applied', 'restart-required'].includes(disabled.application))
  if (disabled.application === 'restart-required') { await stop(current); await boot(mockPort, webPort) }
  await until(async () => { await assert.rejects(fetch(`${status.url}/mobile/v1/info`)) })
  assert.ok([404, 405].includes((await fetch(`${base}/mobile-operator/status`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'removed', method: 'status', payload: {} }) })).status))
  check(`standard bundle disable ${disabled.application}; operator removed and old listener released`)
  await stop(current)
  command('npm', ['uninstall', 'ds-bot-mobile-bridge', '--ignore-scripts', '--no-audit', '--no-fund'], profile)
  await assert.rejects(access(join(profile, 'node_modules/ds-bot-mobile-bridge/package.json')))
  await boot(mockPort, webPort)
  const remaining = await rpc('/delivery-manager', 'list')
  assert.equal(remaining.some(row => row.name === 'ds-bot-mobile-bridge'), false)
  const botResponse = await fetch(`${base}/api/bot`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: 'state' }) })
  const retained = (await botResponse.json()).value
  assert.ok(retained.bots.some(row => row.id === bot.id && row.sessionId === bot.sessionId))
  assert.ok([404, 405].includes((await fetch(`${base}/mobile-operator/status`, { method: 'POST', headers: { cookie } })).status))
  check('npm uninstall and clean restart restore DS Bot profile with original Bot/Session and no operator')
  await verifySources()
   console.log(`Archive: bytes=${(await readFile(bridgeArchive)).length}; sha256=${digest(await readFile(bridgeArchive))}; source files unchanged=${sourceHashes.size}`)
   console.log(`${passed} delivery lifecycle assertions passed; public npm DSH ${installed.version}; reviewed DS Bot fixture source; mock model.`)
} catch (error) {
  // Never print raw CLI logs, cookies, pair codes, device tokens or profile state.
  console.error(`Delivery failed: ${error.name}; code=${error.code ?? 'ASSERTION_OR_RUNTIME'}; line=${error.stack?.match(/delivery\.mjs:(\d+)/)?.[1] ?? 'unknown'}`)
  for (const item of children) {
    console.error(`${item.label}: exit=${item.child.exitCode}; outputBytes=${item.output.length}`)
  }
  process.exitCode = 1
} finally {
  client?.dispose(); socket?.terminate()
  for (const item of children.toReversed()) await stop(item)
  assert.ok(children.every(item => item.child.exitCode !== null || item.child.signalCode !== null))
  console.log(`Cleanup: all ${children.length} started child services stopped.`)
}
