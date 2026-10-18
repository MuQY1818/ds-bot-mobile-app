# DS Bot mobile SDK

A dependency-free ESM client for the self-hosted `/mobile/v1` bridge. It runs in React Native, browsers, and Node; `index.d.ts` supplies the public types.

```js
import { MobileClient, applyConversationEvent } from '@ds-bot/mobile-sdk';

const client = new MobileClient({
  baseUrl: 'https://my-host.example',
  tokenStore, // async get/set/clear, backed by the platform's secure credential store
  cache,     // optional async Cache implementation; SQLite on mobile
});

await client.info();
const claim = await client.pair(codeFromDesktop, 'My phone');
// Poll completePairing(claim.claimToken) until approved on the desktop.
// Successful pairing persists credentials; pending never grants a session.
const { conversations } = await client.conversations();
const id = conversations[0].id;
let messages = await client.getCachedMessages(id);
const connection = client.connect({
  conversationId: id,
  onEvent(event) { messages = applyConversationEvent(messages, event); },
});
```

`MemoryTokenStore` is intended for tests or an ephemeral web preview, not persistent native credentials. Tokens must never be put into URLs, logs, SQLite message caches, or plain preferences. The SDK binds approved credentials to the server origin and validates the protocol and server identity before sending them. HTTPS is required; `allowInsecure: true` only permits `localhost` or `127.0.0.1` for local development.

Create a request identifier **once**, persist it with the pending submission, and reuse it for every retry. On an uncertain network outcome call `submission(requestId)` before resubmitting. A definitive 404 means the host has no receipt. `submit()` does not retry network failures automatically. Transport-level 401s are retried once after a shared token refresh. Uploads must use a replayable body such as Blob, ArrayBuffer, or Uint8Array, not a one-shot stream.

Messages use host-stable `id`s. A Session's `seq` is not a global cursor. Reset events contain the latest page, so the reducer preserves older pages and removes stale stream bubbles. Stream `delta.text` is cumulative; it replaces a pending attempt's text. A final message or `status.clearAttempt` clears that pending attempt. History `cursor` is only for pagination; `eventSeq` is the live subscription watermark.

Assistant messages and cumulative deltas can include `reasoning`. Tool calls are one updatable `role: 'tool'` message per `tool.callId`: `seq` keeps its original place and `updatedSeq` prevents a stale history page from reverting a completed result. Tool input/output are bounded, redacted display details; `tool.truncated` identifies clipped detail. Hidden team coordination is not projected. `parts(id)` supplies a history cursor per Session; `search(id, query)` searches bounded host history pages and returns a query-bound continuation cursor. Use `context(id, hit.sessionId, hit.seq)` to load and cache the actual neighborhood of a search hit.

`settings()` returns the host's public redacted Schemastery descriptors. Writes require the namespace revision that was read; reread and reapply after a conflict. Secret values are write-only: show their `secrets[].set` state, never populate a form with a fabricated mask as its value. `credentials(refs)` likewise returns configured/source/writable metadata only. Keep these values out of message caches and logs.

`approvals()` lists live shared desktop/mobile requests, and `resolveApproval(id, 'allowed-once' | 'rejected')` answers exactly one request. A 409 means another client answered or the original request was cancelled; refresh the list. Do not infer pending approvals from chat history, retry with another identifier, or offer a persistent grant. Requests are never replayed after a host restart.

The cache is scoped by server ID and conversation ID. Cache and draft reads work offline, without refreshing credentials. `messages()` and durable `reset`/`message` events update the injected cache; stream attempts stay in UI memory. Use `clearCachedData()` to invalidate queued writes before clearing the current server's messages and drafts. The UI is responsible for persistent outbox records, background state, and read-marker policy. `attachment(conversationId, message.sessionId, attachmentId)` downloads a validated image as Blob; generic files currently expose metadata only.

Close the subscription when changing conversation or entering the background. `logout()` clears local credentials and closes active requests and sockets. `revokeDevice(id)` also revokes access at the host; call it before logout to disconnect the current device remotely. `dispose()` closes connections without erasing stored credentials. Failed refresh after revocation clears unusable credentials and terminates socket reconnection with the `unauthorized` status.

Run validation with `npm test` in this directory.
