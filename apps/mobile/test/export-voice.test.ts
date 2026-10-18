import test from "node:test";
import assert from "node:assert/strict";
import { collectHistory, conversationExport } from "../src/logic/export.ts";
import { voiceActivity, endVoiceTurn, voiceReply, speechText } from "../src/logic/voice.ts";
import { blobBytes } from "../src/logic/blob.ts";
const message = (id: string, seq: number, more = {}) => ({ id, seq, sessionId: "current", role: "assistant", text: id, createdAt: 1000, ...more });

test("export traverses parts, deduplicates and keeps the newest committed tool result", async () => {
  const calls: (string | null | undefined)[] = [];
  const progress: number[] = [];
  const messages = await collectHistory({ messages: async (_id, { cursor }) => {
    calls.push(cursor);
    return !cursor ? { messages: [message("tool", 3, { updatedSeq: 8 }), message("latest", 9), message("live", 10, { pending: true })], cursor: "old" }
      : { messages: [message("first", 1, { sessionId: "old" }), message("tool", 3, { updatedSeq: 4 })], cursor: null };
  } }, "bot", { onProgress: count => progress.push(count) });
  assert.deepEqual(calls, [undefined, "old"]);
  assert.deepEqual(progress, [2, 3]);
  assert.deepEqual(messages.map(item => item.id), ["first", "tool", "latest"]);
  assert.equal(messages[1].updatedSeq, 8);
});
test("export drops transport metadata and unknown nested data", async () => {
  const messages = await collectHistory({ messages: async () => ({ messages: [message("one", 1, {
    requestId: "private-receipt", credentials: "never-export", author: { id: "bot", name: "Original name", token: "never-export" },
    tool: { callId: "call", name: "read", state: "completed", output: "visible result", secret: "never-export" },
    attachments: [{ id: "file", type: "file", name: "资料.txt", size: 12, path: "/private/host-path" }],
  })], cursor: null }) }, "bot");
  const json = conversationExport({ id: "bot", kind: "bot", name: "Original name", sessionId: "current" }, messages, "json");
  assert.ok(!json.includes("never-export") && !json.includes("private-receipt") && !json.includes("host-path"));
  assert.equal(JSON.parse(json).messages[0].tool.output, "visible result");
  assert.match(conversationExport({ id: "bot", kind: "bot", name: "Original name", sessionId: "current" }, messages, "markdown"), /资料.txt \(12 bytes\)/);
});
test("export refuses cursor loops and resource limits instead of saving a partial file", async () => {
  const reader = { messages: async () => ({ messages: [message("one", 1)], cursor: "same" }) };
  await assert.rejects(collectHistory(reader, "bot"), /repeated a history cursor/);
  await assert.rejects(collectHistory(reader, "bot", { maxMessages: 0 }), /too large/);
  await assert.rejects(collectHistory(reader, "bot", { maxBytes: 1 }), /too large/);
});
test("export cancellation stops between pages", async () => {
  const controller = new AbortController();
  let reads = 0;
  await assert.rejects(collectHistory({ messages: async () => { reads++; controller.abort(); return { messages: [], cursor: "next" }; } }, "bot", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(reads, 1);
});
test("voice endpoint waits for speech followed by silence and caps a turn at 60 seconds", () => {
  const quiet = { heard: false, lastSound: 0 };
  assert.equal(endVoiceTurn(quiet, 5000), false);
  assert.deepEqual(voiceActivity(quiet, 100, -10), quiet);
  const heard = voiceActivity(quiet, 900, -20);
  assert.equal(endVoiceTurn(heard, 2000), false);
  assert.equal(endVoiceTurn(heard, 2100), true);
  assert.equal(endVoiceTurn(quiet, 60000), true);
});
test("voice reads only committed replies to its own accepted request in the same part", () => {
  const sent = message("sent", 2, { role: "user", requestId: "own" });
  const submission = { requestId: "own", sessionId: "current" };
  assert.equal(voiceReply([message("old", 1)], submission), null);
  const replies = [sent, message("reply", 3), message("live", 4, { pending: true }), message("stopped", 5, { interrupted: true }), message("foreign", 6, { sessionId: "other" }), message("next", 7, { role: "user" }), message("unrelated", 8)];
  assert.equal(voiceReply(replies, submission), "reply");
  assert.equal(voiceReply(replies, { ...submission, requestId: "different" }), null);
});
test("spoken text excludes code and attachment URLs", () => {
  assert.equal(speechText("# Hello **world**\n```js\nsecret()\n```\n[Guide](https://example.test) ![image](https://example.test/file)"), "Hello world\n\nGuide");
});
test("download bytes support the native FileReader Blob contract", async () => {
  const previous = globalThis.FileReader;
  let read: unknown;
  globalThis.FileReader = class {
    result = Uint8Array.from([0, 255, 65]).buffer;
    onload?: () => void;
    readAsArrayBuffer(blob: Blob) { read = blob; this.onload?.(); }
  } as unknown as typeof FileReader;
  try {
    const nativeBlob = { size: 3 } as Blob;
    assert.deepEqual(new Uint8Array(await blobBytes(nativeBlob)), Uint8Array.from([0, 255, 65]));
    assert.equal(read, nativeBlob);
  } finally { globalThis.FileReader = previous; }
});
