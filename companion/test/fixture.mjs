import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, mkdtemp, readFile, writeFile, symlink, cp, chmod, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { once } from 'node:events'

const root = resolve(import.meta.dirname, '..')
const delay = ms => new Promise(done => setTimeout(done, ms))
async function port() {
  const server = createServer()
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const value = server.address().port
  await new Promise(done => server.close(done))
  return value
}

// Importing this helper never starts a host. Only the explicit preview command
// leaves a fixture running; callers own close() and their process signal policy.
export async function launchFixture({ publishReady = true } = {}) {
  const area = join(root, 'fixture'); await mkdir(area, { recursive: true })
  const home = await mkdtemp(join(area, '.dsh-test-ui-'))
  await chmod(home, 0o700)
  const profile = join(home, 'profiles/web'), deps = resolve(root, '../bridge/fixture/deps/node_modules')
  const version = JSON.parse(await readFile(join(deps, '@deepseek-ai/dsh/package.json'), 'utf8')).version
  if (version !== '0.2.1-rc.2') throw Error('Companion fixture requires public DSH 0.2.1-rc.2')
  const children = [], env = { PATH: process.env.PATH, HOME: home, DSH_HOME: home, TMPDIR: process.env.TMPDIR ?? '/tmp', LANG: 'en_US.UTF-8' }
  let closing
  const diagnostics = () => children.map(item => `${item.label}\n${item.output()}`).join('\n')
  const close = () => closing ??= (async () => {
    for (const { child } of [...children].reverse()) {
      if (child.exitCode !== null || child.signalCode !== null) continue
      const exited = once(child, 'exit'); child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
      await exited; clearTimeout(timer)
    }
    try {
      const ready = JSON.parse(await readFile(join(area, 'ready.json'), 'utf8'))
      if (ready.home === home) await rm(join(area, 'ready.json'))
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  })()
  function start(label, args, extra) {
    const child = spawn(process.execPath, args, { cwd: profile, env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', bytes => { output += bytes }); child.stderr.on('data', bytes => { output += bytes })
    const item = { child, label, output: () => output }; children.push(item)
    return item
  }
  try {
    await mkdir(join(profile, 'node_modules'), { recursive: true })
    await symlink(join(deps, '@deepseek-ai'), join(profile, 'node_modules/@deepseek-ai'))
    await cp(resolve(root, '../bridge/fixture/extended/package'), join(profile, 'node_modules/ds-bot'), { recursive: true, filter: path => !path.includes('/node_modules') })
    for (const [name, path] of [['ds-bot-mobile-app', root], ['ds-bot-mobile-bridge', resolve(root, '../bridge')]]) await symlink(path, join(profile, 'node_modules', name))
    await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'companion-isolated-profile', private: true, dependencies: { 'ds-bot': '0.1.7', 'ds-bot-mobile-app': 'link:' + root, 'ds-bot-mobile-bridge': 'link:' + resolve(root, '../bridge') }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'ds-bot', 'ds-bot-mobile-bridge', 'ds-bot-mobile-app'] } } }))
    const webPort = await port(), bridgePort = await port(), mockPort = await port()
    await writeFile(join(profile, 'cordis.patch.yml'), `- id: ds-bot-mobile-bridge\n  config:\n    enabled: true\n    home: ${JSON.stringify(join(home, 'bridge-home'))}\n    host: 127.0.0.1\n    port: ${bridgePort}\n    publicUrl: https://phone.example\n    devAllowInsecure: true\n    allowedOrigins: []\n`)
    start('mock', [resolve(root, '../ds-bot/dev/mock-llm.mjs')], { MOCK_PORT: String(mockPort), MOCK_LOG: join(home, 'mock.jsonl'), MOCK_DELAY_MS: '100', MOCK_JITTER_MS: '0' })
    const web = start('dsh', [join(deps, '@deepseek-ai/dsh/lib/bin.js'), '--profile', 'web', '--no-open', '--port', String(webPort)], { DEEPSEEK_BASE_URL: `http://127.0.0.1:${mockPort}/v1`, DEEPSEEK_API_KEY: 'ds-bot-test-mock-only' })
    let launch
    for (let attempt = 0; attempt < 600; attempt++) {
      if (children.some(item => item.child.exitCode !== null || item.child.signalCode !== null)) throw Error('Fixture child exited')
      launch = web.output().match(/dsh web: (http:\/\/[^\s]+\?token=[^\s]+)/)?.[1]
      if (launch) break
      await delay(100)
    }
    if (!launch) throw Error('Fixture readiness timeout')
    const urls = { launch, webUrl: `http://127.0.0.1:${webPort}`, bridgeUrl: `http://127.0.0.1:${bridgePort}`, home }
    if (publishReady) {
      await writeFile(join(area, 'ready.json'), JSON.stringify(urls), { mode: 0o600 })
      await chmod(join(area, 'ready.json'), 0o600)
    }
    return { home, urls, close }
  } catch {
    await writeFile(join(home, 'failure.log'), diagnostics(), { mode: 0o600 })
    await close()
    throw Error('Isolated companion fixture failed; see ignored private failure.log')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const fixture = await launchFixture()
  console.log('Companion fixture ready; synthetic private login is in ignored companion/fixture/ready.json')
  const stop = async () => { await fixture.close(); console.log('Companion fixture children stopped') }
  process.once('SIGINT', stop); process.once('SIGTERM', stop)
}
