import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, mkdtemp, readFile, writeFile, symlink, cp, chmod } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { once } from 'node:events'
import { pathToFileURL } from 'node:url'
const root = resolve(import.meta.dirname, '..')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function port() { const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value }
export async function launchFixture() {
  await mkdir(join(root, 'fixture'), { recursive: true })
  const home = await mkdtemp(join(root, 'fixture/.dsh-test-candidate-'))
  await chmod(home, 0o700)
  const deps = resolve(process.env.BRIDGE_TEST_DEPS ?? join(root, 'fixture/deps/node_modules'))
  const dsh = JSON.parse(await readFile(join(deps, '@deepseek-ai/dsh/package.json'), 'utf8'))
  if (dsh.version !== '0.2.1-rc.2') throw Error('Fixture requires public DSH 0.2.1-rc.2')
  const children = [], env = { PATH: process.env.PATH, HOME: home, DSH_HOME: home, TMPDIR: process.env.TMPDIR ?? '/tmp', LANG: 'en_US.UTF-8' }
  const close = async () => {
    for (const { child } of [...children].reverse()) {
      if (child.exitCode !== null || child.signalCode !== null) continue
      const exited = once(child, 'exit'); child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
      await exited; clearTimeout(timer)
    }
    console.log(`CLEANUP all ${children.length} candidate child services stopped`)
  }
  const diagnostics = () => children.map(item => `${item.label}: exit=${item.child.exitCode}\n${item.output()}`).join('\n')
  function start(label, args, extra) {
    const child = spawn(process.execPath, args, { cwd: root, env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk }); child.stderr.on('data', chunk => { output += chunk })
    children.push({ child, label, output: () => output })
  }
  try {
    await mkdir(join(home, 'profiles/web/node_modules'), { recursive: true })
    await cp(resolve(process.env.BRIDGE_TEST_BOT ?? join(root, 'fixture/extended/package')), join(home, 'profiles/web/node_modules/ds-bot'), { recursive: true, filter: source => !source.includes('/node_modules') })
    await symlink(join(deps, '@deepseek-ai'), join(home, 'profiles/web/node_modules/@deepseek-ai'))
    await writeFile(join(home, 'profiles/web/package.json'), JSON.stringify({ name: 'candidate-isolated-profile', private: true, dependencies: { 'ds-bot': '0.1.7' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'ds-bot'] } } }))
    const ready = join(home, 'ready.json'), patch = join(home, 'fixture.patch.yml')
    await writeFile(patch, `- insert:\n    - id: candidate-fixture\n      name: ${JSON.stringify(join(root, 'test/fixture-plugin.mjs'))}\n      config:\n        home: ${JSON.stringify(join(home, 'bridge-home'))}\n        ready: ${JSON.stringify(ready)}\n`)
    const mockPort = await port(), webPort = await port()
    start('mock-model', [resolve(root, '../ds-bot/dev/mock-llm.mjs')], { MOCK_PORT: String(mockPort), MOCK_LOG: join(home, 'mock.jsonl'), MOCK_DELAY_MS: '200', MOCK_JITTER_MS: '0' })
    start('public-dsh', [join(deps, '@deepseek-ai/dsh/lib/bin.js'), '--profile', 'web', '--patch', patch, '--no-open', '--port', String(webPort)], { DEEPSEEK_BASE_URL: `http://127.0.0.1:${mockPort}/v1`, DEEPSEEK_API_KEY: 'ds-bot-test-mock-only' })
    let urls
    for (let attempt = 0; attempt < 600; attempt++) {
      if (children.some(item => item.child.exitCode !== null)) throw Error('Candidate child exited during startup')
      try { urls = JSON.parse(await readFile(ready, 'utf8')); break } catch { await delay(100) }
    }
    if (!urls) throw Error('Candidate fixture readiness timeout')
    await writeFile(join(root, 'fixture/ready.json'), JSON.stringify({ ...urls, readyFile: ready, home, webUrl: `http://127.0.0.1:${webPort}` }), { mode: 0o600 })
    await chmod(join(root, 'fixture/ready.json'), 0o600)
    return { home, urls, ready, close, diagnostics }
  } catch (error) { await writeFile(join(home, 'failure.log'), diagnostics(), { mode: 0o600 }); await close(); throw Object.assign(error, { fixtureHome: home }) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const fixture = await launchFixture()
  console.log('Candidate fixture ready; private URLs and synthetic IDs: bridge/fixture/ready.json')
  if (process.argv.includes('--keep')) {
    let closing = false
    const stop = async () => { if (closing) return; closing = true; await fixture.close() }
    process.once('SIGTERM', stop); process.once('SIGINT', stop)
  } else await fixture.close()
}
