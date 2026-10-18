import type { Conversation, HistoryPage, Message } from "@ds-bot/mobile-sdk";

export interface HistoryReader {
  messages(id: string, options: { cursor?: string | null; limit: number; signal?: AbortSignal }): Promise<Pick<HistoryPage, "messages" | "cursor">>;
}

export function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) { const error = new Error("The request was cancelled."); error.name = "AbortError"; throw error; }
}

export async function collectHistory(client: HistoryReader, id: string, options: {
  signal?: AbortSignal; onProgress?: (count: number) => void; maxMessages?: number; maxBytes?: number;
} = {}): Promise<Message[]> {
  const { signal, onProgress, maxMessages = 50000, maxBytes = 32 * 1024 * 1024 } = options;
  const messages = new Map<string, Message>();
  const seen = new Set<string>();
  let cursor: string | null | undefined;
  let order: string[] = [];
  let bytes = 0;
  const encoder = new TextEncoder();
  do {
    checkCancelled(signal);
    const page = await client.messages(id, { cursor, limit: 100, signal });
    checkCancelled(signal);
    const newIds: string[] = [];
    for (const message of page.messages) {
      if (message.pending) continue;
      const old = messages.get(message.id);
      if (old && (old.updatedSeq ?? old.seq) >= (message.updatedSeq ?? message.seq)) continue;
      const stored = exportMessage(message);
      bytes += encoder.encode(JSON.stringify(stored)).byteLength - (old ? encoder.encode(JSON.stringify(old)).byteLength : 0);
      if (!old) newIds.push(message.id);
      messages.set(message.id, stored);
      if (messages.size > maxMessages || bytes > maxBytes) throw new Error("This conversation is too large to export on your phone. Export it on your host.");
    }
    order = [...newIds, ...order];
    onProgress?.(messages.size);
    cursor = page.cursor;
    if (cursor) {
      if (seen.has(cursor) || seen.size >= 5000) throw new Error("The host repeated a history cursor. The export was stopped to avoid an incomplete file.");
      seen.add(cursor);
    }
  } while (cursor);
  return order.map(id => messages.get(id)!);
}

function exportMessage(message: Message): Message {
  const { id, sessionId, seq, role, text, createdAt, reasoning, interrupted, turn, step, updatedSeq, tool, attachments, author } = message;
  return { id, sessionId, seq, role, text, createdAt,
    ...(reasoning ? { reasoning } : {}), ...(interrupted ? { interrupted } : {}),
    ...(turn !== undefined ? { turn } : {}), ...(step !== undefined ? { step } : {}),
    ...(updatedSeq !== undefined ? { updatedSeq } : {}), ...(tool ? { tool: {
      callId: tool.callId, name: tool.name, state: tool.state, input: tool.input,
      durationMs: tool.durationMs, output: tool.output, isError: tool.isError, truncated: tool.truncated,
    } } : {}),
    ...(attachments ? { attachments: attachments.map(({ id, type, name, mediaType, size }) => ({ id, type, name, mediaType, size })) } : {}),
    ...(author ? { author: typeof author === "string" ? author : { id: author.id, name: author.name } } : {}) };
}

export function conversationExport(conversation: Conversation, messages: Message[], format: "markdown" | "json", date = new Date()) {
  if (format === "json") return JSON.stringify({ version: 1, exportedAt: date.toISOString(), conversation: { id: conversation.id, kind: conversation.kind, name: conversation.name }, messages }, null, 2);
  const body = messages.map(message => {
    const author = typeof message.author === "string" ? message.author : String(message.author?.name || (message.role === "user" ? "You" : message.role === "assistant" ? conversation.name : message.role));
    const time = new Date(message.createdAt);
    const label = author.replace(/[\r\n]/g, " ");
    const attachments = message.attachments?.map(file => `- ${file.name}${file.size === undefined ? "" : ` (${file.size} bytes)`}`).join("\n");
    return `## ${label}${Number.isFinite(time.getTime()) ? " · " + time.toISOString() : ""}\n\n${message.reasoning ? "> Thought process\n\n" + message.reasoning + "\n\n" : ""}${message.text}${message.tool ? `\n\nTool: ${message.tool.name} (${message.tool.state})\n\n${message.tool.input || ""}\n\n${message.tool.output || ""}` : ""}${attachments ? "\n\nAttachments\n" + attachments : ""}${message.interrupted ? "\n\n[Stopped]" : ""}`;
  }).join("\n\n---\n\n");
  return `# ${conversation.name.replace(/[\r\n]/g, " ")}\n\nExported: ${date.toISOString()}\n\n${body}\n`;
}
