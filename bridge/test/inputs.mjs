import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const root = resolve(import.meta.dirname, '..')
const deps = resolve(process.env.BRIDGE_TEST_DEPS ?? join(root, 'fixture/deps/node_modules'))
const vanilla = join(root, 'fixture/vanilla/package')
const extended = resolve(process.env.BRIDGE_TEST_BOT ?? join(root, 'fixture/extended/package'))
const load = path => import(pathToFileURL(path).href)
export const { Context } = await load(join(deps, '@deepseek-ai/cordis/lib/index.js'))
export const { HostConnectionService } = await load(join(deps, '@deepseek-ai/dsh-client-connection/lib/index.js'))
export const { install: vanillaInstall } = await load(join(vanilla, 'src/host/channel.js'))
export const { install: extendedInstall } = await load(join(extended, 'src/host/channel.js'))
export { vanillaInstall as vanilla, extendedInstall as extended }
