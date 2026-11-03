// The public room Session is a relay. Its own assistant prose is never a member reply.
const textOf = blocks => (Array.isArray(blocks) ? blocks : []).filter(block => block?.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n')
export function projectGroupRecords(records, { sessionId, members, calls = new Map(), redact = value => value }) {
  const rows = []
  const allowed = new Set(members)
  for (const { event } of records) {
    if (!event || !Number.isSafeInteger(event.seq) || event.surfaceOp?.op === 'replace') continue
    const data = event.data ?? {}
    const base = { id: `${sessionId}:${event.seq}`, sessionId, seq: event.seq, createdAt: event.time ?? 0 }
    if (event.type === 'tool/call') {
      if (typeof data.callId === 'string' && data.name === 'group_relay') calls.set(data.callId, true)
      continue
    }
    if (event.type === 'tool/result') {
      const callId = data.message?.source?.callId ?? data.message?.toolCallId
      if (!calls.has(callId) || data.message?.isError) continue
      let result
      try { result = JSON.parse(textOf(data.message?.content)) } catch { continue }
      for (const [index, reply] of (Array.isArray(result?.replies) ? result.replies : []).entries()) {
        if (!reply || reply.kind !== undefined || !allowed.has(reply.botId) || typeof reply.text !== 'string' || !reply.text) continue
        rows.push({ ...base, id: `${base.id}:reply:${index}`, role: 'assistant', text: redact(reply.text),
          groupReplyId: `${callId}:${index}`, author: { id: reply.botId, name: redact(typeof reply.name === 'string' ? reply.name.slice(0, 100) : 'Bot') } })
      }
      continue
    }
    if (event.type !== 'user/message') continue
    const source = data.source ?? {}
    let text = textOf(data.content)
    if (source.kind === 'user') {
      if (text) rows.push({ ...base, role: 'user', text: redact(text), ...(typeof source.rpcId === 'string' ? { requestId: source.rpcId } : {}) })
    } else if (source.kind === 'bot' && source.role === 'post' && source.form === 'relay' && source.roomId === sessionId
      && allowed.has(source.senderSessionId) && !['failed', 'resumed', 'stopped', 'done', 'again'].some(key => source[key] !== undefined)) {
      text = text.replace(/^\[Group post from [^\]]*\]\n?/, '')
      if (text) rows.push({ ...base, role: 'assistant', text: redact(text), author: { id: source.senderSessionId, name: redact(typeof source.senderName === 'string' ? source.senderName.slice(0, 100) : 'Bot') } })
    }
  }
  return rows
}
