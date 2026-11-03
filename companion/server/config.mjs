import z from '@deepseek-ai/schemastery'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

// Installation is inert until the owner supplies dedicated storage and transport.
export const Config = z.object({
  enabled: z.boolean().default(false),
  home: z.string().description('Absolute directory owned only by this bridge; never DSH_HOME.'),
  dsBotHome: z.string().description('Absolute DS Bot data directory containing secrets.json. Defaults to DSH_HOME/bot.'),
  host: z.string().default('127.0.0.1'),
  port: z.natural().max(65535).default(0),
  publicUrl: z.string().description('Existing HTTPS origin; no credentials, path or query.'),
  allowedOrigins: z.array(String).default([]),
  certPath: z.string(),
  keyPath: z.string(),
  devAllowInsecure: z.boolean().default(false),
  name: z.string().default('DS Bot'),
})

export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Bridge config must be an object.')
  if (config.port !== undefined && (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535)) throw new Error('Bridge port must be an integer between 0 and 65535.')
  for (const key of ['enabled', 'devAllowInsecure']) if (config[key] !== undefined && typeof config[key] !== 'boolean') throw new Error(`${key} must be a boolean.`)
  for (const key of ['home', 'dsBotHome', 'host', 'publicUrl', 'certPath', 'keyPath', 'name']) if (config[key] !== undefined && (typeof config[key] !== 'string' || !config[key].trim())) throw new Error(`${key} must be a nonempty string.`)
  if (config.dsBotHome !== undefined && !isAbsolute(config.dsBotHome)) throw new Error('dsBotHome must be an absolute path.')
  if (config.allowedOrigins !== undefined && (!Array.isArray(config.allowedOrigins) || config.allowedOrigins.some(value => {
    try { const parsed = new URL(value); return typeof value !== 'string' || parsed.origin !== value || !['https:', 'http:'].includes(parsed.protocol) } catch { return true }
  }))) throw new Error('allowedOrigins must contain exact HTTP(S) origins.')
  return config
}

const expandHome = text => (text === '~' ? homedir() : /^~[\\/]/.test(text) ? join(homedir(), text.slice(2)) : text)
const dshHomeOf = value => resolve(expandHome(value?.trim() ? value : join(homedir(), '.dsh')))

export function resolveDsBotHome(value, dshHome = process.env.DSH_HOME) {
  return value === undefined ? join(dshHomeOf(dshHome), 'bot') : resolve(value)
}
