import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, cp, symlink, chmod, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { resolve, join } from 'node:path'
import { once } from 'node:events'
import { createOperatorClient } from '../src/operator-client.mjs'
import { MobileClient, MemoryTokenStore } from '../../packages/mobile-sdk/index.js'

const root = resolve(import.meta.dirname, '..'), repo = resolve(root, '..'), area = join(root, 'fixture')
await mkdir(area, { recursive: true })
const home = await mkdtemp(join(area, '.dsh-test-delivery-')); await chmod(home, 0o700)
const profile = join(home, 'profiles/web'), bridgeHome = join(home, 'bridge-state')
await mkdir(profile, { recursive: true })
const env = { PATH: process.env.PATH, HOME: home, DSH_HOME: home, TMPDIR: process.env.TMPDIR ?? '/tmp', LANG: 'en_US.UTF-8', npm_config_registry: 'https://registry.npmjs.org', npm_config_cache: join(area, '.npm-cache') }
const children = [], delay = ms => new Promise(done => setTimeout(done, ms))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const sourceHashes = new Map(await Promise.all(['package.json', ...manifest.files].map(async path => [path, digest(await readFile(join(root, path)))])))
let host, cookie, base, client, passed = 0
const pass = label => { passed++; console.log('PASS ' + label) }
function command(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, env, encoding: 'utf8', timeout: 600_000, maxBuffer: 5 * 1024 * 1024 })
  if (result.status !== 0) {
    throw Object.assign(Error('Isolated package command failed'), { privateOutput: result.stdout + result.stderr })
  }
  return result.stdout
}
async function until(run, ms = 60_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try { return await run() } catch { await delay(100) }
  }
  throw Error('Companion delivery condition timed out; see private fixture diagnostics')
}
async function port() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const value = server.address().port; await new Promise(done => server.close(done)); return value
}
function start(label, args, extra = {}) {
  const child = spawn(process.execPath, args, { cwd: profile, env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
  const item = { child, label, output: '' }; children.push(item)
  child.stdout.on('data', bytes => { item.output += bytes }); child.stderr.on('data', bytes => { item.output += bytes })
  return item
}
async function stop(item) {
  if (!item || item.child.exitCode !== null || item.child.signalCode !== null) return
  const exited = once(item.child, 'exit'); item.child.kill('SIGTERM')
  const timer = setTimeout(() => item.child.kill('SIGKILL'), 5000)
  await exited; clearTimeout(timer)
}
async function rpc(channel, method, payload = {}) {
  const response = await fetch(`${base}${channel}/${method}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'companion-delivery', method, payload }), signal: AbortSignal.timeout(45_000) })
  assert.equal(response.status, 200, 'Expected admitted owner RPC')
  const body = await response.json(); assert.equal(body.result?.ok, true, 'Owner RPC refused')
  return body.result.value
}
const manager = (method, payload) => rpc('/companion-test-manager', method, payload)
const operator = (method, payload) => rpc('/mobile-operator', method, payload)
async function boot(mockPort, webPort) {
  host = start('public-dsh', [join(profile, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'web', '--no-open', '--port', String(webPort)], { DEEPSEEK_BASE_URL: `http://127.0.0.1:${mockPort}/v1`, DEEPSEEK_API_KEY: 'ds-bot-test-mock-only' })
  const launch = await until(() => {
    assert.equal(host.child.exitCode, null)
    const match = host.output.match(/dsh web: (http:\/\/[^\s]+\?token=[^\s]+)/)
    assert.ok(match); return match[1]
  })
  base = new URL(launch).origin
  const login = await fetch(launch, { redirect: 'manual' })
  assert.ok([302, 303].includes(login.status))
  cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  assert.ok(cookie, 'Public DSH owner login issued no cookie')
  await until(() => manager('list'))
}
async function applyChange(result, mockPort, webPort) {
  assert.ok(['applied', 'restart-required'].includes(result.application), 'Public manager did not accept lifecycle change')
  if (result.application === 'restart-required') { await stop(host); await boot(mockPort, webPort) }
}

try {
  const archive = process.argv[2] ? resolve(process.argv[2]) : join(home, JSON.parse(command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', home], root))[0].filename)
  await access(archive)
  const bridgeArchive = join(home, JSON.parse(command('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', home], join(repo, 'bridge')))[0].filename)
  // Pin a local package-manager binary rather than depending on Corepack's
  // mutable default or a globally configured private registry.
  command('npm', ['install', '--prefix', join(home, 'tools'), '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', 'pnpm@10.12.1'], home)
  env.PATH = join(home, 'tools/node_modules/.bin') + ':' + env.PATH
  // The reviewed fixture consumes public DSH packages as peer imports. Match
  // the hoisted public fixture layout without linking any production install.
  await writeFile(join(profile, '.npmrc'), `node-linker=hoisted\nstore-dir=${join(area, '.pnpm-store')}\n`)
  await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'isolated-companion-delivery', private: true, packageManager: 'pnpm@10.12.1', dependencies: { '@deepseek-ai/dsh': '0.2.1-rc.2', 'ds-bot-mobile-bridge': `file:${bridgeArchive}` }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'ds-bot-mobile-bridge'] } } }))
  console.log('Preparing a fresh public DSH profile and packed Bridge; no live user profile is used')
  command('pnpm', ['install', '--ignore-scripts', '--registry=https://registry.npmjs.org'], profile)
  assert.equal(JSON.parse(await readFile(join(profile, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version, '0.2.1-rc.2')
  const bot = join(home, 'reviewed-bot-fixture')
  await cp(join(repo, 'bridge/fixture/extended/package'), bot, { recursive: true, filter: path => !path.includes('/node_modules') })
  await symlink(join(profile, 'node_modules'), join(bot, 'node_modules'))
  const bridgePort = await port(), bridgeUrl = `http://127.0.0.1:${bridgePort}`
  await writeFile(join(profile, 'cordis.patch.yml'), `- insert:\n    - id: bot\n      name: ${JSON.stringify(join(bot, 'index.js'))}\n    - id: companion-test-manager\n      name: ${JSON.stringify(join(root, 'test/manager.mjs'))}\n      config:\n        archive: ${JSON.stringify(archive)}\n- id: ds-bot-mobile-bridge\n  config:\n    enabled: true\n    home: ${JSON.stringify(bridgeHome)}\n    host: 127.0.0.1\n    port: ${bridgePort}\n    publicUrl: https://phone.example\n    devAllowInsecure: true\n    allowedOrigins: []\n`)
  const mockPort = await port(), webPort = await port()
  start('mock', [join(repo, 'ds-bot/dev/mock-llm.mjs')], { MOCK_PORT: String(mockPort), MOCK_LOG: join(home, 'mock.jsonl'), MOCK_DELAY_MS: '100', MOCK_JITTER_MS: '0' })
  await boot(mockPort, webPort)
  assert.ok(!(await manager('list')).some(row => row.name === manifest.name))
  const installedPath = join(profile, 'node_modules', manifest.name)
  try { await applyChange(await manager('install'), mockPort, webPort) }
  catch (error) {
    if (!(error instanceof TypeError && error.message === 'fetch failed') && error.name !== 'TimeoutError') throw error
    // Package installation may replace host modules before its response is
    // delivered. A stopped host and exact package checks resolve that state;
    // no request is repeated and no synthetic successful response is invented.
    await stop(host)
    for (const [path, hash] of sourceHashes) assert.equal(digest(await readFile(join(installedPath, path))), hash, 'Interrupted manager install did not persist the exact package')
    await boot(mockPort, webPort)
    console.log('INFO package-manager transport ended during reload; verified installed archive after controlled host restart')
  }
  for (const [path, hash] of sourceHashes) assert.equal(digest(await readFile(join(installedPath, path))), hash, 'Installed companion differs from reviewed source')
  assert.ok((await manager('list')).some(row => row.name === manifest.name && row.version === manifest.version && row.enabled === false))
  pass('official manager installs the exact packed companion without enabling it')
  await applyChange(await manager('select', { name: manifest.name, enabled: true }), mockPort, webPort)
  assert.ok((await manager('plugins')).some(row => row.moduleName === manifest.name))
  const connected = await until(async () => { const status = await operator('status'); assert.equal(status.enabled, true); return status })
  assert.equal(connected.url, 'https://phone.example')
  pass('enabled companion is a standard manager bundle beside the independent Bridge')
  client = new MobileClient({ baseUrl: bridgeUrl, allowInsecure: true, tokenStore: new MemoryTokenStore() })
  const pairing = await operator('pairing.create'), claim = await client.pair(pairing.code, 'Delivery example phone')
  await operator('pairing.approve', { requestId: claim.requestId })
  const session = await client.completePairing(claim.claimToken)
  assert.ok((await client.conversations()).conversations.length > 0)
  pass('owner-approved synthetic phone uses the real SDK with the packaged Bridge')
  const before = await readFile(join(bridgeHome, 'bridge.json'))
  await applyChange(await manager('select', { name: manifest.name, enabled: false }), mockPort, webPort)
  assert.ok((await manager('list')).some(row => row.name === manifest.name && row.enabled === false))
  assert.equal((await operator('status')).enabled, true)
  assert.equal(digest(await readFile(join(bridgeHome, 'bridge.json'))), digest(before))
  assert.equal((await fetch(`${bridgeUrl}/mobile/v1/state`, { headers: { authorization: `Bearer ${session.accessToken}` } })).status, 200)
  pass('disabling App companion preserves the Bridge listener and exact authorization state')
  await applyChange(await manager('select', { name: manifest.name, enabled: true }), mockPort, webPort)
  assert.ok((await manager('list')).some(row => row.name === manifest.name && row.enabled === true))
  assert.equal((await operator('status')).serverId, connected.serverId)
  assert.ok((await operator('status')).devices.some(device => device.id === session.deviceId))
  pass('re-enabling restores the companion with the same Bridge identity')
  await applyChange(await manager('select', { name: 'ds-bot-mobile-bridge', enabled: false }), mockPort, webPort)
  const call = createOperatorClient({ root: base + '/', location: new URL(base), fetchImpl: (url, init) => fetch(url, { ...init, headers: { ...init.headers, cookie } }) })
  await assert.rejects(call('status'), error => ['HTTP_404', 'HTTP_405'].includes(error.code) && error.message.includes('Install and configure'))
  assert.ok((await manager('list')).some(row => row.name === manifest.name && row.enabled === true))
  pass('companion remains selectable without Bridge and reports the actionable setup state')
  await applyChange(await manager('select', { name: 'ds-bot-mobile-bridge', enabled: true }), mockPort, webPort)
  assert.equal((await until(() => operator('status'))).serverId, connected.serverId)
  assert.equal((await fetch(`${bridgeUrl}/mobile/v1/state`, { headers: { authorization: `Bearer ${session.accessToken}` } })).status, 200)
  await applyChange(await manager('select', { name: manifest.name, enabled: false }), mockPort, webPort)
  try { await applyChange(await manager('remove'), mockPort, webPort) }
  catch (error) {
    if (!(error instanceof TypeError && error.message === 'fetch failed') && error.name !== 'TimeoutError') throw error
    await stop(host)
    const remaining = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
    assert.ok(!Object.hasOwn(remaining.dependencies ?? {}, manifest.name), 'Interrupted removal retained the package dependency')
    await assert.rejects(access(join(installedPath, 'package.json')), cause => cause.code === 'ENOENT')
    await boot(mockPort, webPort)
    console.log('INFO package-manager transport ended during removal reload; verified removal after controlled host restart')
  }
  assert.ok(!(await manager('list')).some(row => row.name === manifest.name))
  assert.equal((await operator('status')).enabled, true)
  assert.equal(digest(await readFile(join(bridgeHome, 'bridge.json'))), digest(before))
  pass('official manager removes only App companion while Bridge state remains unchanged')
  for (const [path, hash] of sourceHashes) assert.equal(digest(await readFile(join(root, path))), hash, 'Source changed during delivery; repack required')
  console.log(`${passed} companion packed lifecycle assertions passed; public DSH 0.2.1-rc.2, reviewed Bot fixture and mock model`)
} catch (error) {
  await writeFile(join(home, 'failure.log'), `${error.stack}\n${error.privateOutput ?? ''}\n${children.map(item => `${item.label}\n${item.output}`).join('\n')}`, { mode: 0o600 })
  throw Error('Companion delivery failed; diagnostics are retained only in ignored companion/fixture')
} finally {
  client?.dispose()
  for (const item of [...children].reverse()) await stop(item)
  console.log(`CLEANUP all ${children.length} companion delivery child services stopped`)
}
