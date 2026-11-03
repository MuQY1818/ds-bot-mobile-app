// Download public fixtures into this package's ignored directory only.
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile, readFile, symlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const root = resolve(import.meta.dirname, '..'), fixture = join(root, 'fixture-server')
const run = (cmd, args, cwd) => {
  const result = spawnSync(cmd, args, {cwd, encoding: 'utf8'})
  if (result.status !== 0) throw Error(`Fixture command failed: ${cmd}`)
  return result.stdout
}
// deep-view 0.1.0 declares these DSH packages as `*` peers. npm auto-installs a `*` peer from the
// `latest` dist-tag, which for several of them is still 0.0.1-era and would split DSH into duplicate
// module instances. Pin them to what DSH 0.2.1-rc.5 itself uses, as a DSH profile resolves them.
const deepViewPeers = {'@deepseek-ai/cordis': '4.0.5', '@deepseek-ai/dsh-llm': '0.2.1-rc.5', '@deepseek-ai/dsh-tools': '0.2.1-rc.5', '@deepseek-ai/dsh-web': '0.2.1-rc.5'}
await mkdir(join(fixture, 'deps'), {recursive: true})
await writeFile(join(fixture, 'deps/package.json'), JSON.stringify({private: true, dependencies: {'@deepseek-ai/dsh': '0.2.1-rc.5', 'deep-view': '0.1.0', ...deepViewPeers}}))
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], join(fixture, 'deps'))
const packed = JSON.parse(run('npm', ['pack', 'ds-bot@0.2.6', '--ignore-scripts', '--json', '--registry=https://registry.npmjs.org', '--pack-destination', fixture], root))[0]
if (packed.integrity !== 'sha512-1kgNVgI9A3Rr5B3L6igexBYeuC4LCz2ph0IcIsIucpNUx/qOHVdxISckBKkNpNJN6yIPHeWn45WFayByWsR3hw==') throw Error('Unexpected public DS Bot integrity')
const official = join(fixture, 'official')
await mkdir(official, {recursive: true})
run('tar', ['-xzf', join(fixture, packed.filename), '-C', official], root)
const manifest = JSON.parse(await readFile(join(official, 'package/package.json'), 'utf8'))
if (manifest.name !== 'ds-bot' || manifest.version !== '0.2.6') throw Error('Unexpected fixture package')
try { await symlink(join(fixture, 'deps/node_modules'), join(official, 'package/node_modules')) } catch (error) { if (error.code !== 'EEXIST') throw error }
console.log('Prepared public DSH 0.2.1-rc.5 and pristine public DS Bot 0.2.6 fixture; no user profile or patch used.')
