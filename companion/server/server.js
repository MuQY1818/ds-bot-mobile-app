import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { readFile } from 'node:fs/promises'
import { WebSocketServer, WebSocket } from 'ws'
import { BridgeError, createAuthStore, digest } from './auth.js'

const PREFIX = '/mobile/v1'
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost'])
const fail = (status, code, message) => { throw new BridgeError(status, code, message) }
const required = (value, name, maximum = 256) => {
  if (typeof value !== 'string' || !value || value.length > maximum) fail(400, 'INVALID_REQUEST', `${name} is required and must be at most ${maximum} characters.`)
  return value
}
const safeError = error => ({ code: error.status ? error.code ?? 'REQUEST_FAILED' : 'INTERNAL_ERROR', message: error.status ? error.message : 'The mobile bridge could not complete this request.' })
function forDevice(value, deviceId) {
  const prefix = `${deviceId}_`
  const message = item => typeof item.requestId === 'string' && item.requestId.startsWith(prefix) ? { ...item, requestId: item.requestId.slice(prefix.length) } : item
  return { ...value, ...(value.messages ? { messages: value.messages.map(message) } : {}), ...(value.message ? { message: message(value.message) } : {}), ...(value.items ? { items: value.items.map(message) } : {}), ...(value.queue ? { queue: value.queue.map(message) } : {}) }
}

function readBody(request, maximum) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let length = 0
    let failed = false
    const rejectOnce = error => { if (!failed) { failed = true; reject(error) } }
    if (Number(request.headers['content-length']) > maximum) rejectOnce(new BridgeError(413, 'BODY_TOO_LARGE', 'This upload is too large.'))
    request.on('data', chunk => {
      length += chunk.length
      if (length > maximum) rejectOnce(new BridgeError(413, 'BODY_TOO_LARGE', 'This upload is too large.'))
      if (!failed) chunks.push(chunk)
    })
    request.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)) })
    request.on('error', rejectOnce)
    request.on('aborted', () => rejectOnce(new BridgeError(400, 'REQUEST_ABORTED', 'The request was interrupted.')))
  })
}

async function jsonBody(request) {
  const body = await readBody(request, 512 * 1024)
  try {
    const value = JSON.parse(body.toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid body')
    return value
  } catch { fail(400, 'INVALID_JSON', 'Send a JSON object.') }
}

export async function createMobileServer({ home, config = {}, adapter }) {
  const host = config.host ?? '127.0.0.1'
  const tls = Boolean(config.certPath && config.keyPath)
  if (Boolean(config.certPath) !== Boolean(config.keyPath)) throw new Error('Mobile TLS requires both certPath and keyPath.')
  if (!tls && !LOOPBACK.has(host)) throw new Error('A plaintext mobile bridge must bind to loopback behind a TLS reverse proxy.')
  let publicUrl
  if (config.publicUrl) {
    const parsed = new URL(config.publicUrl)
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('Mobile publicUrl must be a server origin without credentials, a path, or a query.')
    if (parsed.protocol !== 'https:' && !(config.devAllowInsecure === true && parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname.replace(/^\[|\]$/g, '')))) throw new Error('Mobile publicUrl must use HTTPS. Loopback HTTP requires devAllowInsecure.')
    publicUrl = parsed.origin
  } else if (!tls && config.devAllowInsecure !== true) throw new Error('Set mobile.publicUrl to your HTTPS reverse proxy URL, or configure a TLS certificate.')
  const sockets = new Map()
  const requestControllers = new Map()
  const auth = await createAuthStore(home, { onRevoke: id => {
    for (const [socket, state] of sockets) if (state.deviceId === id) socket.close(4403, 'Device revoked')
    for (const [controller, deviceId] of requestControllers) if (deviceId === id) controller.abort(new BridgeError(401, 'UNAUTHORIZED', 'This device was revoked.'))
  } })
  const allowedOrigins = new Set(config.allowedOrigins ?? [])
  if (publicUrl) allowedOrigins.add(publicUrl)
  const rates = new Map()
  function rate(key, maximum) {
    const now = Date.now()
    let value = rates.get(key)
    if (!value || value.expiresAt <= now) {
      if (rates.size > 4000) for (const [id, item] of rates) if (item.expiresAt <= now) rates.delete(id)
      if (rates.size > 4000) fail(429, 'RATE_LIMITED', 'Try again in a minute.')
      rates.set(key, value = { count: 0, expiresAt: now + 60_000 })
    }
    if (++value.count > maximum) fail(429, 'RATE_LIMITED', 'Try again in a minute.')
  }
  function checkOrigin(request) {
    const origin = request.headers.origin
    if (origin && !allowedOrigins.has(origin)) fail(403, 'ORIGIN_DENIED', 'This browser origin is not allowed.')
    return origin
  }
  function access(request) {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) fail(401, 'UNAUTHORIZED', 'A paired device session is required.')
    return auth.verifyAccess(header.slice(7))
  }
  const submissions = new Map()
  const recoveries = new Map()
  const prefixKey = (deviceId, id) => `${deviceId}:${id}`
  async function recover(device, saved, signal) {
    if (saved.receipt.status !== 'unknown' || !adapter.reconcile) return saved.receipt
    const key = prefixKey(device.id, saved.receipt.requestId)
    if (submissions.has(key)) {
      await submissions.get(key).catch(() => {})
      if (saved.receipt.status !== 'unknown') return saved.receipt
    }
    if (recoveries.has(key)) return recoveries.get(key)
    rate(`recover:${device.id}`, 30)
    const operation = (async () => {
      try {
        const proof = await adapter.reconcile({ conversationId: saved.receipt.conversationId, sessionId: saved.receipt.sessionId,
          requestId: `${device.id}_${saved.receipt.requestId}` }, signal)
        if (proof?.accepted === true) {
          Object.assign(saved.receipt, { accepted: true, status: 'accepted', recovered: true })
          await auth.save()
        }
      } catch {
        // A missing or unavailable proof cannot establish rejection or authorize a replay.
        signal.throwIfAborted()
      } finally { recoveries.delete(key) }
      return saved.receipt
    })()
    recoveries.set(key, operation)
    return operation
  }
  async function submit(device, body, signal, assertActive) {
    required(body.requestId, 'requestId', 128)
    if (!/^[A-Za-z0-9_-]+$/.test(body.requestId)) fail(400, 'INVALID_REQUEST', 'requestId may contain only letters, numbers, underscores, and hyphens.')
    required(body.conversationId, 'conversationId')
    required(body.sessionId, 'sessionId')
    if (typeof body.text !== 'string' || body.text.length > 100_000) fail(400, 'INVALID_REQUEST', 'text must contain at most 100000 characters.')
    const attachments = body.attachments ?? []
    if (!Array.isArray(attachments) || attachments.length > 8) fail(400, 'INVALID_ATTACHMENTS', 'A message supports at most 8 attachments.')
    const receiptIds = attachments.map(item => required(typeof item === 'string' ? item : item?.receiptId, 'receiptId'))
    const payload = { conversationId: body.conversationId, sessionId: body.sessionId, requestId: body.requestId, text: body.text, attachments: receiptIds.map(receiptId => ({ receiptId })) }
    const hash = digest(JSON.stringify(payload))
    const key = prefixKey(device.id, body.requestId)
    const existing = auth.data.submissions[key]
    if (existing) {
      if (existing.hash !== hash) fail(409, 'REQUEST_ID_CONFLICT', 'This requestId was already used for a different message.')
      if (submissions.has(key)) return submissions.get(key)
      if (existing.error) throw new BridgeError(existing.error.status, existing.error.code, existing.error.message)
      return recover(device, existing, signal)
    }
    for (const receiptId of receiptIds) {
      const upload = auth.data.uploads[receiptId]
      if (!upload || upload.deviceId !== device.id || upload.conversationId !== body.conversationId || upload.sessionId !== body.sessionId || upload.expiresAt <= Date.now()) fail(409, 'UPLOAD_EXPIRED', 'Upload this attachment again for the selected conversation.')
    }
    if (Object.keys(auth.data.submissions).length >= 100_000) fail(507, 'LEDGER_FULL', 'The message receipt store is full. Contact the server operator.')
    const receipt = { requestId: body.requestId, conversationId: body.conversationId, sessionId: body.sessionId, status: 'unknown', createdAt: Date.now() }
    auth.data.submissions[key] = { hash, receipt }
    const operation = (async () => {
      try {
        await auth.save()
        assertActive()
        // The same device request must also stay stable in DSH after a bridge restart.
        const result = await adapter.submit({ ...payload, requestId: `${device.id}_${body.requestId}` }, signal)
        if (result?.accepted !== true) fail(503, 'ADMISSION_UNCONFIRMED', 'The host has not confirmed this message.')
        Object.assign(receipt, { accepted: result.accepted === true, status: 'accepted' })
        await auth.save()
        return receipt
      } catch (error) {
        if (error.status >= 400 && error.status < 500) {
          auth.data.submissions[key].error = { status: error.status, ...safeError(error) }
          receipt.status = 'rejected'
          await auth.save()
        }
        throw error
      } finally { submissions.delete(key) }
    })()
    submissions.set(key, operation)
    return operation
  }
  async function route(request, response) {
    const controller = new AbortController()
    requestControllers.set(controller, null)
    response.on('close', () => { if (!response.writableEnded) controller.abort() })
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)])
    try {
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('X-Content-Type-Options', 'nosniff')
      const origin = checkOrigin(request)
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Vary', 'Origin')
      }
      if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' })
        response.end()
        return
      }
      const url = new URL(request.url, 'http://bridge.invalid')
      if (url.searchParams.has('token') || url.searchParams.has('accessToken')) fail(400, 'TOKEN_IN_URL', 'Send session credentials in the Authorization header.')
      const path = url.pathname
      const method = request.method
      const ip = request.socket.remoteAddress ?? 'unknown'
      let result
      if (method === 'GET' && path === `${PREFIX}/info`) {
        rate(`info:${ip}`, 120)
        result = { protocolVersion: 1, serverId: auth.data.serverId, name: config.name ?? 'DS Bot', capabilities: adapter.capabilities?.() ?? {}, compatibility: adapter.compatibility?.() ?? {} }
      } else if (method === 'POST' && path === `${PREFIX}/pairings`) {
        rate(`pair:${ip}`, 10)
        result = auth.beginPairing(await jsonBody(request))
      } else if (method === 'POST' && path === `${PREFIX}/pairings/complete`) {
        rate(`complete:${ip}`, 120)
        result = await auth.completePairing((await jsonBody(request)).claimToken)
      } else if (method === 'POST' && path === `${PREFIX}/auth/refresh`) {
        rate(`refresh:${ip}`, 30)
        result = await auth.refresh((await jsonBody(request)).refreshToken)
      } else {
        rate(`auth:${ip}`, 600)
        const device = access(request)
        requestControllers.set(controller, device.id)
        const assertActive = () => { signal.throwIfAborted(); access(request) }
        rate(`device:${device.id}`, 600)
        const parts = path.startsWith(`${PREFIX}/`) ? path.slice(PREFIX.length + 1).split('/').map(value => {
          try { return decodeURIComponent(value) } catch { fail(400, 'INVALID_PATH', 'The request path is invalid.') }
        }) : []
        if (method === 'GET' && path === `${PREFIX}/state`) result = await adapter.state(signal)
        else if (method === 'GET' && path === `${PREFIX}/conversations`) result = await adapter.conversations(signal)
        else if (parts[0] === 'conversations' && parts.length === 3 && method === 'GET' && parts[2] === 'messages') {
          const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 50
          if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail(400, 'INVALID_LIMIT', 'limit must be between 1 and 100.')
          result = forDevice(await adapter.history(parts[1], { cursor: url.searchParams.get('cursor') ?? undefined, limit }, signal), device.id)
        } else if (parts[0] === 'conversations' && parts.length === 3 && method === 'GET' && parts[2] === 'target') result = await adapter.target(parts[1], signal)
        else if (parts[0] === 'conversations' && parts.length === 3 && method === 'POST' && parts[2] === 'cancel') result = await adapter.cancel(parts[1], signal)
        else if (method === 'POST' && path === `${PREFIX}/submissions`) {
          if (adapter.capabilities?.().send !== true) fail(501, 'STABLE_SUBMIT_REQUIRED', 'The upstream reliable submit extension is unavailable.')
          const body = await jsonBody(request)
          assertActive()
          result = await submit(device, body, signal, assertActive)
        }
        else if (method === 'GET' && parts[0] === 'submissions' && parts.length === 2) {
          const saved = auth.data.submissions[prefixKey(device.id, parts[1])]
          if (!saved) fail(404, 'SUBMISSION_NOT_FOUND', 'This message receipt does not exist.')
          result = saved.error ? { ...saved.receipt, error: { code: saved.error.code, message: saved.error.message } } : await recover(device, saved, signal)
        } else if (method === 'POST' && path === `${PREFIX}/actions`) {
          const body = await jsonBody(request)
          if (!body || typeof body.endpoint !== 'string' || !Array.isArray(adapter.capabilities?.().actions) || !adapter.capabilities().actions.includes(body.endpoint)) fail(403, 'ACTION_NOT_ALLOWED', 'This mobile action is unavailable.')
          assertActive()
          result = forDevice(await adapter.action(body.endpoint, body.payload ?? {}, signal), device.id)
        }
        else if (method === 'GET' && path === `${PREFIX}/devices`) result = { devices: auth.devices(), currentDeviceId: device.id }
        else if (method === 'DELETE' && parts[0] === 'devices' && parts.length === 2) result = await auth.revoke(parts[1])
        else if (method === 'POST' && path === `${PREFIX}/read-markers`) {
          const body = await jsonBody(request)
          assertActive()
          required(body.conversationId, 'conversationId')
          if (!Number.isSafeInteger(body.seq) || body.seq < 0) fail(400, 'INVALID_SEQUENCE', 'seq must be a nonnegative integer.')
          await adapter.target(body.conversationId, signal)
          const key = prefixKey(device.id, body.conversationId)
          auth.data.readMarkers[key] = Math.max(auth.data.readMarkers[key] ?? 0, body.seq)
          await auth.save()
          result = { conversationId: body.conversationId, seq: auth.data.readMarkers[key] }
        } else fail(404, 'NOT_FOUND', 'This mobile bridge endpoint does not exist.')
      }
      signal.throwIfAborted()
      if (requestControllers.get(controller) !== null) access(request)
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(result ?? { ok: true }))
    } catch (error) {
      if (!response.headersSent) {
        response.writeHead(error.status ?? 500, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ error: safeError(error) }))
      } else response.end()
    } finally { requestControllers.delete(controller) }
  }
  const server = tls ? createHttpsServer({ cert: await readFile(config.certPath), key: await readFile(config.keyPath), minVersion: 'TLSv1.2' }, route) : createHttpServer(route)
  server.requestTimeout = 30_000
  server.headersTimeout = 15_000
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false })
  server.on('upgrade', (request, socket, head) => {
    try {
      checkOrigin(request)
      if (request.url !== `${PREFIX}/events`) fail(404, 'NOT_FOUND', 'WebSocket endpoint not found.')
      rate(`ws:${request.socket.remoteAddress}`, 60)
      if (wss.clients.size >= 100) fail(429, 'CONNECTION_LIMIT', 'Too many mobile connections.')
      wss.handleUpgrade(request, socket, head, client => wss.emit('connection', client, request))
    } catch (error) {
      socket.end(`HTTP/1.1 ${error.status ?? 400} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
    }
  })
  wss.on('connection', socket => {
    const controller = new AbortController()
    const state = { controller, deviceId: null, authenticated: false, busy: false }
    sockets.set(socket, state)
    const timeout = setTimeout(() => socket.close(4401, 'Authentication required'), 5000)
    const send = event => {
      if (socket.readyState !== WebSocket.OPEN) return
      if (socket.bufferedAmount > 2 * 1024 * 1024) { socket.close(4408, 'Reconnect to catch up'); return }
      socket.send(JSON.stringify(state.deviceId ? forDevice(event, state.deviceId) : event))
    }
    let expiry
    let alive = true
    socket.on('pong', () => { alive = true })
    socket.on('close', () => { clearTimeout(timeout); clearInterval(expiry); controller.abort(); sockets.delete(socket) })
    socket.on('error', () => controller.abort())
    socket.on('message', async bytes => {
      if (state.busy || state.authenticated) { socket.close(4400, 'Only an initial authentication frame is accepted'); return }
      state.busy = true
      try {
        let frame
        try { frame = JSON.parse(bytes.toString()) } catch { fail(400, 'INVALID_JSON', 'Invalid authentication frame.') }
        if (frame?.type !== 'auth') fail(401, 'UNAUTHORIZED', 'Authenticate before following a conversation.')
        const device = auth.verifyAccess(frame.token)
        if (adapter.capabilities?.().stream !== true) fail(501, 'REDACTED_PROJECTION_REQUIRED', 'The upstream redacted transcript extension is unavailable.')
        required(frame.conversationId, 'conversationId')
        if ([...sockets.values()].filter(item => item.deviceId === device.id).length >= 5) fail(429, 'CONNECTION_LIMIT', 'Close another connection on this device.')
        await adapter.target(frame.conversationId, controller.signal)
        auth.verifyAccess(frame.token)
        state.deviceId = device.id
        state.authenticated = true
        clearTimeout(timeout)
        expiry = setInterval(() => {
          try { auth.verifyAccess(frame.token) } catch { socket.close(4401, 'Session expired') }
          if (!alive) { socket.terminate(); return }
          alive = false
          if (socket.readyState === WebSocket.OPEN) socket.ping()
        }, 15_000)
        expiry.unref()
        send({ type: 'ready', conversationId: frame.conversationId, serverId: auth.data.serverId })
        for await (const event of adapter.follow(frame.conversationId, { after: frame.after }, controller.signal)) {
          if (controller.signal.aborted) break
          send(event)
        }
        if (!controller.signal.aborted && socket.readyState === WebSocket.OPEN) socket.close(1012, 'Reconnect to the host stream')
      } catch (error) {
        if (!controller.signal.aborted) {
          send({ type: 'error', error: safeError(error) })
          socket.close(error.status === 401 ? 4401 : error.status === 403 ? 4403 : 4400, 'Cannot follow conversation')
        }
      }
    })
  })
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(config.port ?? 0, host, () => { server.off('error', reject); resolve() })
    })
  } catch (error) { wss.close(); await auth.close(); throw error }
  const address = server.address()
  if (!publicUrl) {
    publicUrl = `${tls ? 'https' : 'http'}://${host.includes(':') ? `[${host}]` : host}:${address.port}`
    allowedOrigins.add(publicUrl)
  }
  let closing
  return {
    address,
    url: publicUrl,
    serverId: auth.data.serverId,
    hasActiveDevices: () => auth.data.devices.some(device => !device.revokedAt && device.refreshExpiresAt > Date.now()),
    isDeviceAuthorized: id => auth.data.devices.some(device => device.id === id && !device.revokedAt && device.refreshExpiresAt > Date.now()),
    async operator(endpoint, payload = {}) {
      switch (endpoint) {
        case 'status': return { enabled: true, url: publicUrl, serverId: auth.data.serverId, capabilities: adapter.capabilities?.() ?? {}, compatibility: adapter.compatibility?.() ?? {}, pending: auth.pending(), devices: auth.devices() }
        case 'pairing.create': return auth.createPairing(publicUrl)
        case 'pairing.approve': return auth.decidePairing(payload.requestId, true)
        case 'pairing.deny': return auth.decidePairing(payload.requestId, false)
        case 'device.revoke': return auth.revoke(payload.id ?? payload.deviceId)
        case 'approvals.list': return adapter.approvalOperator?.(endpoint, payload) ?? { requests: [] }
        case 'approvals.resolve':
          if (!adapter.approvalOperator) fail(503, 'APPROVAL_UNAVAILABLE', 'Tool approvals are unavailable on this host.')
          return adapter.approvalOperator(endpoint, payload)
        default: fail(404, 'NOT_FOUND', 'Unknown mobile device operation.')
      }
    },
    close() {
      if (closing) return closing
      closing = (async () => {
        for (const controller of requestControllers.keys()) controller.abort()
        for (const [socket, state] of sockets) { state.controller.abort(); socket.terminate() }
        await adapter.dispose?.()
        wss.close()
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
        await Promise.allSettled(submissions.values())
        await Promise.allSettled(recoveries.values())
        await auth.close()
      })()
      return closing
    },
  }
}
