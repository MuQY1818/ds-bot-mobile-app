const fields = Object.freeze({
  models: [], efforts: ['ref'], 'update-bot': ['id', 'model', 'effort'],
  'set-flags': ['id', 'pinned', 'hidden'], usage: ['timeZone'],
  'memory-view': ['botId'], 'memory-forget': ['botId', 'scope', 'topic', 'text'],
  schedules: [], 'schedule-create': ['target', 'title', 'prompt', 'when'], 'schedule-delete': ['sessionId', 'id'],
  queue: ['conversationId'], 'queue-remove': ['conversationId', 'sessionId', 'itemId'],
})
export const MOBILE_ACTIONS = Object.freeze(Object.keys(fields))
const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }) }
const invalid = () => fail(400, 'INVALID_ACTION', 'Invalid action fields or values.')
const string = (v, max = 256) => typeof v === 'string' && v.length > 0 && v.length <= max && [...v].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid()
}
const writable = view => { if (view.readOnly) fail(409, 'READ_ONLY', 'The team is read-only.') }
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]))
function when(value) {
  object(value, ['kind', 'at', 'time', 'timeZone', 'weekdays', 'minutes'])
  const timings = { at: ['kind', 'at'], daily: ['kind', 'time', 'timeZone'], weekly: ['kind', 'time', 'timeZone', 'weekdays'], every: ['kind', 'minutes'] }
  if (!string(value.kind, 16) || !Object.hasOwn(timings, value.kind)) invalid()
  const keys = timings[value.kind]
  if (!keys || Object.keys(value).some(key => !keys.includes(key))) invalid()
  if (value.kind === 'at' && (!string(value.at, 64) || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value.at) || !Number.isFinite(Date.parse(value.at)) || Date.parse(value.at) <= Date.now())) invalid()
  if (['daily', 'weekly'].includes(value.kind)) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) || !string(value.timeZone, 64)) invalid()
    try { new Intl.DateTimeFormat('en', { timeZone: value.timeZone }) } catch { invalid() }
  }
  if (value.kind === 'weekly' && (!Array.isArray(value.weekdays) || !value.weekdays.length || value.weekdays.length > 7 || value.weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7) || new Set(value.weekdays).size !== value.weekdays.length)) invalid()
  if (value.kind === 'every' && (!Number.isInteger(value.minutes) || value.minutes < 1 || value.minutes > 10080)) invalid()
  return value
}

// snapshot must return only authorized conversations. Rooms use their own id;
// hidden member Sessions must never be included among Bot parts.
export function createTeamActions({ callTeam, snapshot, sessionController = {}, redactTexts }) {
  if (typeof callTeam !== 'function' || typeof snapshot !== 'function') throw new TypeError('callTeam and snapshot are required')
  const textViews = typeof redactTexts === 'function'
  const actions = MOBILE_ACTIONS.filter(name => !(name.startsWith('memory-') || ['models', 'efforts', 'usage', 'schedules', 'schedule-create', 'schedule-delete', 'queue', 'queue-remove'].includes(name)) || textViews)
    .filter(name => !['queue', 'queue-remove'].includes(name) || (typeof sessionController.projections === 'function' && (name !== 'queue-remove' || typeof sessionController.updateQueue === 'function')))
  async function view(signal) {
    const value = await snapshot(signal)
    signal.throwIfAborted()
    const conversations = value.conversations ?? [...(value.bots ?? []).map(bot => ({ ...bot, kind: 'bot' })), ...(value.rooms ?? []).map(room => ({ id: room.id, sessionId: room.id, kind: 'room' }))]
    return { ...value, conversations }
  }
  function target(v, id, botOnly = false) {
    if (!string(id)) invalid()
    const item = v.conversations.find(item => item.id === id && (!botOnly || item.kind === 'bot'))
    if (!item) fail(404, 'TARGET_DENIED', 'This target is not on the visible team.')
    return item
  }
  async function safe(value, v, signal, item = v.conversations.find(row => row.kind === 'bot')) {
    if (!item || !textViews) fail(501, 'REDACTION_REQUIRED', 'A DS Bot-owned text redactor is required.')
    const texts = []
    const collect = node => { if (typeof node === 'string') texts.push(node); else if (Array.isArray(node)) node.forEach(collect); else if (node && typeof node === 'object') Object.values(node).forEach(collect) }
    collect(value)
    if (texts.some(text => text.length > 100000) || texts.length > 20000) fail(503, 'VIEW_TOO_LARGE', 'The host view exceeds the mobile limit.')
    const redacted = []
    for (let start = 0; start < texts.length; start += 100) {
      const batch = texts.slice(start, start + 100)
      const result = await redactTexts({ conversationId: item.id, expectedSessionId: item.sessionId, texts: batch }, signal)
      if (!Array.isArray(result) || result.length !== batch.length || result.some(text => typeof text !== 'string')) fail(503, 'REDACTION_FAILED', 'The DS Bot text redactor did not confirm the result.')
      redacted.push(...result)
    }
    signal.throwIfAborted()
    let index = 0
    const replace = node => typeof node === 'string' ? redacted[index++] : Array.isArray(node) ? node.map(replace) : node && typeof node === 'object' ? Object.fromEntries(Object.entries(node).map(([key, val]) => [key, replace(val)])) : node
    return replace(value)
  }
  const ownedSession = (item, sessionId) => item.kind === 'room' ? sessionId === item.id : [item.sessionId, ...(item.parts ?? [])].includes(sessionId)
  function tasks(result, v) {
    return { available: result?.available === true, tasks: (result?.tasks ?? []).filter(task => v.conversations.some(item => ownedSession(item, task.sessionId) && (item.kind === 'bot' ? task.botId === item.id && !task.roomId : task.roomId === item.id))).slice(0, 1000).map(task => pick(task, ['id', 'sessionId', 'botId', 'roomId', 'title', 'prompt', 'status', 'kind', 'scheduledAt', 'everySeconds', 'time', 'timeZone', 'weekdays', 'expression', 'active', 'nextAt'])) }
  }
  async function current(id, sessionId, signal) {
    const v = await view(signal); writable(v)
    const item = target(v, id)
    if (item.sessionId !== sessionId) fail(409, 'TARGET_CHANGED', 'Refresh the current conversation target.')
    return item
  }
  async function queue(item, v, signal) {
    const data = await sessionController.projections({ sessionId: item.sessionId }, signal)
    const inbox = data?.values?.inbox
    const pending = ['next-turn', 'next-step'].flatMap(target => (Array.isArray(inbox?.[target]) ? inbox[target] : []).map(entry => ({ entry, target }))).filter(({ entry }) => entry?.source?.kind === 'user')
    const items = pending.slice(0, 100).map(({ entry, target }) => ({ id: entry.id, target, ...(string(entry.source.rpcId) ? { requestId: entry.source.rpcId } : {}), text: (entry.content ?? []).filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n').slice(0, 16000) })).filter(entry => string(entry.id))
    return safe({ conversationId: item.id, sessionId: item.sessionId, items }, v, signal, item)
  }
  return {
    capabilities: () => ({ actions: [...actions], modelSelection: actions.includes('models') && actions.includes('efforts'), queue: actions.includes('queue'), cancel: typeof sessionController.cancel === 'function', approvals: false, memoryAsk: false, scheduleUpdate: false }),
    async action(name, payload = {}, signal = AbortSignal.timeout(30000)) {
      if (!Object.hasOwn(fields, name) || !actions.includes(name)) fail(403, 'ACTION_NOT_ALLOWED', 'This mobile action is unavailable.')
      object(payload, fields[name]); if (Buffer.byteLength(JSON.stringify(payload)) > 32768) invalid()
      signal.throwIfAborted()
      const body = structuredClone(payload), v = await view(signal)
      if (['update-bot', 'set-flags', 'memory-forget', 'schedule-create', 'schedule-delete', 'queue-remove'].includes(name)) writable(v)
      if (name === 'models') return safe({ models: (v.models ?? []).map(model => pick(model, ['ref', 'name', 'providerName'])), defaultModel: v.defaultModel ?? null }, v, signal)
      if (name === 'efforts') {
        if (!string(body.ref) || !v.models?.some(model => model.ref === body.ref)) invalid()
        const result = await callTeam('efforts', body, signal)
        return safe({ efforts: (result?.efforts ?? []).slice(0, 30).map(item => pick(item, ['id', 'name', 'description'])), ...(string(result?.default) ? { default: result.default } : {}) }, v, signal)
      }
      if (name === 'update-bot') {
        const item = target(v, body.id, true)
        if (!Object.hasOwn(body, 'model') && !Object.hasOwn(body, 'effort')) invalid()
        if (Object.hasOwn(body, 'model') && body.model !== null && (!string(body.model) || !v.models?.some(model => model.ref === body.model))) invalid()
        if (Object.hasOwn(body, 'effort') && body.effort !== null) {
          if (!string(body.effort, 64)) invalid()
          const ref = body.model === null ? v.defaultModel : body.model ?? item.model ?? v.defaultModel
          if (!string(ref)) invalid()
          const levels = await callTeam('efforts', { ref }, signal)
          if (!levels?.efforts?.some(level => level.id === body.effort)) invalid()
        }
        await current(item.id, item.sessionId, signal)
        await callTeam(name, body, signal)
        return { id: item.id, changed: true }
      }
      if (name === 'set-flags') {
        target(v, body.id)
        if (!['pinned', 'hidden'].some(key => Object.hasOwn(body, key)) || ['pinned', 'hidden'].some(key => Object.hasOwn(body, key) && typeof body[key] !== 'boolean')) invalid()
        await callTeam(name, body, signal); return { id: body.id, ...pick(body, ['pinned', 'hidden']) }
      }
      if (name.startsWith('memory-')) {
        const item = target(v, body.botId, true)
        if (name === 'memory-forget' && (body.scope !== 'own' || !string(body.text, 8000) || body.topic !== undefined && body.topic !== null && (!string(body.topic, 80) || !/^[\p{L}\p{N}_-]+$/u.test(body.topic)))) invalid()
        const result = await callTeam(name, body, signal)
        const entries = (result?.entries ?? []).filter(entry => entry.scope === 'own').slice(0, 1000).map(entry => pick(entry, ['scope', 'topic', 'text']))
        const limits = Object.fromEntries(['main', 'entry', 'topic', 'topics'].map(key => [key, Number.isSafeInteger(result?.limits?.[key]) && result.limits[key] >= 0 ? result.limits[key] : 0]))
        return safe({ botId: item.id, entries, sizes: { own: entries.reduce((sum, entry) => sum + entry.text.length, 0), team: 0 }, limits, summary: null, fresh: true, summarizing: false }, v, signal, item)
      }
      if (name.startsWith('schedule')) {
        if (name === 'schedule-create') {
          target(v, body.target)
          if (!string(body.title, 120) || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 16000 || body.prompt.includes('dsh-session:')) invalid()
          when(body.when)
        }
        if (name === 'schedule-delete') {
          if (!string(body.sessionId) || !string(body.id)) invalid()
          const listed = tasks(await callTeam('schedules', {}, signal), v)
          if (!listed.tasks.some(task => task.id === body.id && task.sessionId === body.sessionId)) fail(404, 'TASK_DENIED', 'This task is not on the visible team.')
          writable(await view(signal))
        }
        const result = await callTeam(name, body, signal)
        return safe(tasks(result, await view(signal)), v, signal)
      }
      if (name === 'usage') {
        if (body.timeZone !== undefined) { if (!string(body.timeZone, 64)) invalid(); try { new Intl.DateTimeFormat('en', { timeZone: body.timeZone }) } catch { invalid() } }
        const result = await callTeam(name, body, signal), indexes = new Map(), owners = []
        for (const [index, owner] of (result.owners ?? []).entries()) if (v.conversations.some(item => item.id === owner.id && item.kind === owner.kind)) { indexes.set(index, owners.length); owners.push(pick(owner, ['key', 'id', 'kind', 'name'])) }
        return safe({ owners, models: (result.models ?? []).map(model => pick(model, ['key', 'provider', 'model', 'name', 'providerName'])), kinds: (result.kinds ?? []).filter(kind => typeof kind === 'string'), rows: (result.rows ?? []).filter(row => Array.isArray(row) && row.length === 9 && indexes.has(row[1]) && row.slice(4).every(n => Number.isFinite(n) && n >= 0)).slice(0, 10000).map(row => [row[0], indexes.get(row[1]), ...row.slice(2)]), now: result.now, scanning: result.scanning === true }, v, signal)
      }
      const item = target(v, body.conversationId)
      if (name === 'queue') return queue(item, v, signal)
      if (name === 'queue-remove') {
        if (!string(body.itemId) || body.sessionId !== item.sessionId) invalid()
        const pending = await queue(item, v, signal)
        if (!pending.items.some(entry => entry.id === body.itemId)) fail(409, 'QUEUE_CHANGED', 'This queued item is no longer pending.')
        await current(item.id, body.sessionId, signal)
        await sessionController.updateQueue({ sessionId: body.sessionId, itemId: body.itemId, action: { kind: 'remove' } }, signal)
        return { removed: true, conversationId: item.id, sessionId: body.sessionId, itemId: body.itemId }
      }
      fail(403, 'ACTION_NOT_ALLOWED', 'This mobile action is unavailable.')
    },
    async cancel(payload, signal = AbortSignal.timeout(30000)) {
      object(payload, ['conversationId', 'sessionId'])
      const { conversationId, sessionId } = payload
      if (typeof sessionController.cancel !== 'function') fail(501, 'UNSUPPORTED', 'Cancel is unavailable.')
      if (!string(conversationId) || !string(sessionId)) invalid()
      await current(conversationId, sessionId, signal)
      await sessionController.cancel({ sessionId }, signal)
      return { conversationId, sessionId, queueCleared: false }
    },
  }
}
