import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SECRET_NAME, redactor } from './redactor.mjs'

const invalid = () => Object.assign(new Error('The bridge request is invalid.'), { code: 'bot/invalid' })
const stale = () => Object.assign(new Error('Refresh the conversation before continuing.'), { code: 'bot/stale' })
const unavailable = () => Object.assign(new Error('The team or its secrets are unavailable.'), { code: 'bot/unavailable' })
const unconfirmed = () => Object.assign(new Error('The team could not confirm message admission.'), { code: 'bot/unconfirmed' })

async function readSecrets(dsBotHome) {
  let contents
  try {
    contents = await readFile(join(dsBotHome, 'secrets.json'), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw unavailable()
  }

  let parsed
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw unavailable()
  }
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.secrets)) throw unavailable()

  const entries = []
  for (const entry of parsed.secrets) {
    if (!SECRET_NAME.test(entry?.name ?? '') || typeof entry.value !== 'string') continue
    entries.push({ name: entry.name, value: entry.value })
  }
  return entries
}

// The bridge prompts the verified Session through the host's public sessionController
// so the device request ID stays on the committed message; DS Bot's own `send`
// would replace it with a random one and the App could not match its outbox.
export function createTeamContract({ callTeam, dsBotHome, prompt }) {
  if (typeof callTeam !== 'function' || typeof dsBotHome !== 'string') throw new TypeError('callTeam and dsBotHome are required.')

  async function verifiedState(body, signal) {
    let result
    try {
      result = await callTeam('state', {}, signal)
    } catch {
      throw unavailable()
    }
    if (result?.ok !== true || !result.value || typeof result.value !== 'object') throw unavailable()

    const state = result.value
    const id = body.conversationId
    const bots = Array.isArray(state.bots) ? state.bots : []
    const rooms = Array.isArray(state.rooms) ? state.rooms : []
    const bot = bots.find(item => item?.id === id && item.sessionId === body.expectedSessionId)
    if (bot) return { state, sessionId: bot.sessionId }

    const room = rooms.find(item => item?.id === id)
    const members = room?.members
    if (room
      && (body.expectedSessionId === room.id || body.expectedSessionId === room.sessionId)
      && Array.isArray(members)
      && JSON.stringify(body.expectedMembers) === JSON.stringify(members)
      && members.every(member => bots.some(item => item?.id === member))) return { state, sessionId: typeof room.sessionId === 'string' ? room.sessionId : room.id }

    throw stale()
  }

  return {
    describe() {
      return { version: 1, stableRequestId: true, redactedText: true, groups: true, groupProjection: 1, attachments: false }
    },

    async redact(body, signal) {
      if (!Array.isArray(body?.texts) || body.texts.length > 200
        || body.texts.some(text => typeof text !== 'string' || text.length > 100000)) throw invalid()
      await verifiedState(body, signal)
      let secrets
      try {
        secrets = await readSecrets(dsBotHome)
      } catch {
        throw unavailable()
      }
      const redactText = redactor(secrets)
      return { texts: body.texts.map(text => redactText(text)) }
    },

    async submit(body, signal) {
      const text = body?.content?.[0]?.text
      if (body?.version !== 1 || typeof body.requestId !== 'string' || !/^[a-zA-Z0-9._:-]{1,256}$/.test(body.requestId)
        || !Array.isArray(body.content) || body.content.length !== 1 || body.content[0]?.type !== 'text'
        || typeof text !== 'string' || !text.trim() || text.length > 100000 || text.includes('dsh-session:')) throw invalid()

      const { state, sessionId } = await verifiedState(body, signal)
      if (state.readOnly !== null && state.readOnly !== undefined) throw Object.assign(new Error('The team is read-only on this computer.'), { code: 'bot/read-only' })
      if (typeof prompt !== 'function') throw unavailable()
      signal?.throwIfAborted?.()
      let result
      try {
        result = await prompt({ requestId: body.requestId, sessionId, mode: 'queue', content: [{ type: 'text', text }] }, signal)
      } catch {
        throw unconfirmed()
      }
      if (result?.accepted !== true) throw unconfirmed()
      return { accepted: true, requestId: body.requestId, sessionId: body.expectedSessionId }
    },
  }
}
