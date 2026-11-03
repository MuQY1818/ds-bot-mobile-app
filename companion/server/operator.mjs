// Public WebServer + Connection admission preserve the ordinary owner carrier.
// rpc.handle in public DSH 0.2.1-rc.2 accesses its own undeclared webServer scope.
export function registerOwnerOperator(ctx, channel, dispatch) {
  return ctx.webServer.register({ kind: 'prefix', path: channel, async handler(request, response) {
    const admission = ctx.connection.admit(request)
    if ('rejection' in admission) { response.writeHead(admission.rejection); response.end(); return }
    if (admission.peer?.principal?.kind !== 'owner') { response.writeHead(403); response.end(); return }
    const endpoint = new URL(request.url, 'http://operator.invalid').pathname.slice(channel.length + 1)
    if (request.method !== 'POST' || !/^[a-z][a-z.]*$/.test(endpoint)) { response.writeHead(404); response.end(); return }
    if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') { response.writeHead(415); response.end(); return }
    let size = 0, message
    try {
      const chunks = []
      for await (const chunk of request) {
        size += chunk.length
        if (size > 16 * 1024) { response.writeHead(413); response.end(); return }
        chunks.push(chunk)
      }
      message = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (message?.type !== 'client-request' || typeof message.rpcId !== 'string' || message.rpcId.length > 128 || message.method !== endpoint
        || !message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) throw Error('Invalid envelope')
    } catch { response.writeHead(400); response.end(); return }
    const controller = new AbortController()
    const closed = () => { if (!response.writableEnded) controller.abort() }
    response.once('close', closed)
    try {
      const result = await dispatch(endpoint, message.payload, controller.signal, admission.peer)
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      response.end(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result }))
    } catch {
      if (!response.headersSent) response.writeHead(500)
      response.end()
    } finally { response.off('close', closed) }
  } })
}
