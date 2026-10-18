export { mentionSpans, nameProblem } from './mentions.js';
export const protocolVersion = 1;

export class MobileError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'MobileError';
    this.code = code;
    this.status = status;
  }
}

export function validateServerUrl(value, { allowInsecure = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new MobileError('invalid_url', 'Enter a complete HTTPS server address.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowInsecure && url.protocol === 'http:' && loopback)) {
    throw new MobileError('insecure_url', 'HTTPS is required. Development HTTP is limited to localhost.');
  }
  if (url.username || url.password || url.search || url.hash || !['/', '/mobile/v1', '/mobile/v1/'].includes(url.pathname)) {
    throw new MobileError('invalid_url', 'Use a server origin without credentials, query parameters, or a custom path.');
  }
  return url.origin;
}

export function validateTlsPin(value) {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new MobileError('invalid_tls_pin', 'This pairing code has an invalid computer identity.');
  return value;
}

export class MemoryTokenStore {
  constructor(session = null) { this.session = session; }
  async get() { return this.session ? { ...this.session } : null; }
  async set(session) { this.session = { ...session }; }
  async clear() { this.session = null; }
}

export class MemoryCache {
  #messages = new Map();
  #drafts = new Map();
  #key(serverId, conversationId) { return JSON.stringify([serverId, conversationId]); }
  async getMessages(serverId, conversationId) { return [...(this.#messages.get(this.#key(serverId, conversationId)) || [])]; }
  async setMessages(serverId, conversationId, messages) { this.#messages.set(this.#key(serverId, conversationId), [...messages]); }
  async getDraft(serverId, conversationId) { return this.#drafts.get(this.#key(serverId, conversationId)) || ''; }
  async setDraft(serverId, conversationId, text) {
    const key = this.#key(serverId, conversationId);
    if (text) this.#drafts.set(key, text);
    else this.#drafts.delete(key);
  }
  async clear(serverId) {
    for (const map of [this.#messages, this.#drafts]) {
      if (serverId === undefined) map.clear();
      else for (const key of map.keys()) if (JSON.parse(key)[0] === serverId) map.delete(key);
    }
  }
}

const timestamp = value => typeof value === 'number' ? value : Date.parse(value);
function abortable(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new MobileError('cancelled', 'The request was cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}

function sameSnapshot(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameSnapshot(a[key], b[key]));
}

export function mergeMessages(existing, incoming) {
  const confirmed = new Set([...existing, ...incoming]
    .filter(message => message?.role === 'user' && message.requestId && !message.localSubmission)
    .map(message => JSON.stringify([message.sessionId, message.requestId])));
  const merged = new Map();
  for (const message of [...existing, ...incoming]) {
    if (!message || typeof message.id !== 'string') continue;
    if (message.localSubmission && confirmed.has(JSON.stringify([message.sessionId, message.requestId]))) continue;
    const previous = merged.get(message.id);
    const previousVersion = previous?.updatedSeq ?? previous?.seq;
    const incomingVersion = message.updatedSeq ?? message.seq;
    const stale = previous && Number.isFinite(previousVersion) && Number.isFinite(incomingVersion) && incomingVersion < previousVersion;
    const value = !previous ? message : stale ? { ...message, ...previous } : { ...previous, ...message };
    if (previous?.tool && message.tool) {
      value.tool = stale ? { ...message.tool, ...previous.tool } : { ...previous.tool, ...message.tool };
      if (value.tool.name === 'Tool') {
        const known = [previous.tool, message.tool].find(tool => tool.name !== 'Tool');
        if (known) { value.tool.name = known.name; value.text = known.name; }
      }
      // A later page may find the call before an already-received result.
      if (Number.isFinite(previous.seq) && Number.isFinite(message.seq)) {
        const first = previous.seq <= message.seq ? previous : message;
        value.seq = first.seq;
        value.createdAt = first.createdAt;
      }
    }
    merged.set(message.id, previous && sameSnapshot(previous, value) ? previous : value);
  }
  const result = [...merged.values()].sort((a, b) => {
    if (Boolean(a.pending) !== Boolean(b.pending)) return a.pending ? 1 : -1;
    if (a.localSubmission || b.localSubmission) {
      const difference = timestamp(a.createdAt) - timestamp(b.createdAt);
      if (Number.isFinite(difference) && difference) return difference;
    }
    if (a.sessionId === b.sessionId && Number.isFinite(a.seq) && Number.isFinite(b.seq)) return a.seq - b.seq;
    const difference = timestamp(a.createdAt) - timestamp(b.createdAt);
    return Number.isFinite(difference) ? difference : 0;
  });
  return result.length === existing.length && result.every((message, index) => message === existing[index]) ? existing : result;
}

/** Only an accepted host receipt may create a local, confirmed user message. */
export function acceptedSubmissionMessage(submission, receipt) {
  if (receipt?.status !== 'accepted' || receipt.requestId !== submission.requestId
    || (receipt.conversationId && receipt.conversationId !== submission.conversationId)
    || (receipt.sessionId && receipt.sessionId !== submission.sessionId)) {
    throw new MobileError('invalid_receipt', 'The host has not confirmed this submission.');
  }
  return {
    id: `accepted:${submission.requestId}`, sessionId: submission.sessionId,
    requestId: submission.requestId, role: 'user', text: submission.text,
    createdAt: Number.isFinite(timestamp(receipt.createdAt)) ? receipt.createdAt : Date.now(),
    seq: Number.MAX_SAFE_INTEGER, localSubmission: true,
    ...(submission.attachments?.length ? { attachments: submission.attachments } : {}),
  };
}

export function applyConversationEvent(messages, event) {
  if (event.type === 'reset') return mergeMessages(messages.filter(message => !message.pending), event.messages || []);
  if (event.type === 'delta' && event.attemptId && typeof event.text === 'string') {
    const id = `stream:${event.sessionId}:${event.attemptId}`;
    const previous = messages.find(message => message.id === id);
    // Cumulative snapshots can be delivered twice when a transport retries.
    if (previous && Number.isFinite(event.index) && event.index < previous.streamIndex) return messages;
    return mergeMessages(messages, [{
      id, sessionId: event.sessionId, seq: Number.MAX_SAFE_INTEGER, role: 'assistant',
      text: event.text, createdAt: previous?.createdAt ?? Date.now(), pending: true,
      ...(typeof event.reasoning === 'string' ? { reasoning: event.reasoning } : previous?.reasoning ? { reasoning: previous.reasoning } : {}),
      attemptId: event.attemptId, streamIndex: event.index,
    }]);
  }
  if (event.type === 'message' && event.message) {
    const remaining = messages.filter(message => !(message.pending && event.replaceAttemptId && message.attemptId === event.replaceAttemptId));
    return mergeMessages(remaining, [event.message]);
  }
  if (event.type === 'status' && event.clearAttempt) {
    return messages.filter(message => !(message.pending && message.attemptId === event.attemptId));
  }
  return messages;
}

function assertSession(session) {
  if (!session || !['accessToken', 'refreshToken', 'deviceId', 'serverId'].every(key => typeof session[key] === 'string' && session[key]) || !Number.isFinite(timestamp(session.expiresAt))) {
    throw new MobileError('invalid_session', 'The server returned an invalid device session.');
  }
  return session;
}

function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new MobileError('invalid_input', `${name} is required.`);
  return value;
}

export class MobileClient {
  #fetch;
  #WebSocket;
  #tokenStore;
  #timeout;
  #reconnectDelay;
  #reconnectMaxDelay;
  #generation = 0;
  #disposed = false;
  #storeQueue = Promise.resolve();
  #cacheQueue = Promise.resolve();
  #cacheGeneration = 0;
  #refreshing = null;
  #controllers = new Set();
  #connections = new Set();
  #serverId = null;

  constructor({ baseUrl, tokenStore, tlsPin, fetch: fetchImpl = globalThis.fetch, WebSocket: socketImpl = globalThis.WebSocket, allowInsecure = false, cache = new MemoryCache(), requestTimeoutMs = 45000, reconnectDelayMs = 750, reconnectMaxDelayMs = 15000 }) {
    Object.defineProperty(this, 'baseUrl', { value: validateServerUrl(baseUrl, { allowInsecure }), enumerable: true });
    Object.defineProperty(this, 'tlsPin', { value: tlsPin === undefined ? undefined : validateTlsPin(tlsPin), enumerable: true });
    if (tlsPin !== undefined && (fetchImpl === globalThis.fetch || socketImpl === globalThis.WebSocket || typeof socketImpl !== 'function')) throw new MobileError('missing_pinned_transport', 'Install the latest native app to connect to local HTTPS.');
    if (tlsPin !== undefined && !this.baseUrl.startsWith('https:')) throw new MobileError('insecure_url', 'A pinned computer identity requires HTTPS.');
    if (!tokenStore || !['get', 'set', 'clear'].every(name => typeof tokenStore[name] === 'function')) throw new MobileError('invalid_store', 'A secure token store is required.');
    if (typeof fetchImpl !== 'function') throw new MobileError('missing_fetch', 'This runtime needs a fetch implementation.');
    this.#tokenStore = tokenStore;
    // Browser fetch rejects an arbitrary class instance as its receiver.
    this.#fetch = (...args) => fetchImpl(...args);
    this.#WebSocket = socketImpl;
    this.cache = cache;
    this.#timeout = Math.max(1, requestTimeoutMs);
    this.#reconnectDelay = Math.max(1, reconnectDelayMs);
    this.#reconnectMaxDelay = Math.max(this.#reconnectDelay, reconnectMaxDelayMs);
  }

  #assertCurrent(generation = this.#generation) {
    if (this.#disposed) throw new MobileError('disposed', 'This connection has been closed.');
    if (generation !== this.#generation) throw new MobileError('session_changed', 'The device session has changed.');
  }

  #store(operation) {
    const result = this.#storeQueue.then(operation);
    this.#storeQueue = result.catch(() => {});
    return result;
  }

  async #session(generation = this.#generation) {
    this.#assertCurrent(generation);
    await this.#storeQueue;
    const session = await this.#tokenStore.get();
    this.#assertCurrent(generation);
    if (!session) throw new MobileError('unauthorized', 'Pair this device with your server.', 401);
    assertSession(session);
    if (session.tlsPin !== this.tlsPin) throw new MobileError('server_changed', 'The computer identity has changed. Pair this device again.');
    if (session.serverUrl && session.serverUrl !== this.baseUrl) throw new MobileError('server_changed', 'These device credentials belong to a different server address. Pair this address separately.');
    if (this.#serverId && this.#serverId !== session.serverId) throw new MobileError('server_changed', 'The server identity has changed. Pair this device again.');
    return session;
  }

  async #validSession(generation) {
    // Verify the endpoint identity before any stored credential leaves the device.
    if (!this.#serverId) await this.info();
    const session = await this.#session(generation);
    return timestamp(session.expiresAt) <= Date.now() + 15000 ? this.#refresh(session.accessToken, generation) : session;
  }

  async #refresh(staleToken, generation = this.#generation) {
    this.#assertCurrent(generation);
    if (this.#refreshing?.generation === generation) return this.#refreshing.promise;
    const promise = (async () => {
      const current = await this.#session(generation);
      if (current.accessToken !== staleToken) return current;
      try {
        const session = { ...assertSession(await this.#request('/auth/refresh', { method: 'POST', json: { refreshToken: current.refreshToken }, auth: false }, generation)), serverUrl: this.baseUrl, ...(this.tlsPin ? { tlsPin: this.tlsPin } : { tlsPin: undefined }) };
        if (session.serverId !== current.serverId || session.deviceId !== current.deviceId) throw new MobileError('server_changed', 'The refreshed device identity did not match.');
        await this.#store(async () => {
          this.#assertCurrent(generation);
          await this.#tokenStore.set(session);
        });
        this.#assertCurrent(generation);
        return session;
      } catch (error) {
        if ((error.status === 401 || error.status === 403) && generation === this.#generation) {
          await this.#store(async () => {
            this.#assertCurrent(generation);
            await this.#tokenStore.clear();
          });
        }
        throw error;
      }
    })();
    this.#refreshing = { generation, promise };
    try { return await promise; }
    finally { if (this.#refreshing?.promise === promise) this.#refreshing = null; }
  }

  async #request(path, { method = 'GET', json, body, mediaType, auth = true, retry = true, binary = false, timeoutMs = this.#timeout, signal } = {}, generation = this.#generation) {
    this.#assertCurrent(generation);
    if (signal?.aborted) throw new MobileError('cancelled', 'The request was cancelled.');
    const session = auth ? await abortable(this.#validSession(generation), signal) : null;
    this.#assertCurrent(generation);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    this.#controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { Accept: binary ? '*/*' : 'application/json' };
    if (session) headers.Authorization = `Bearer ${session.accessToken}`;
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    else if (mediaType) headers['Content-Type'] = mediaType;
    try {
      const response = await this.#fetch(`${this.baseUrl}/mobile/v1${path}`, {
        method, headers, body: json !== undefined ? JSON.stringify(json) : body,
        signal: controller.signal, redirect: 'error', credentials: 'omit',
      });
      this.#assertCurrent(generation);
      if (signal?.aborted) throw new MobileError('cancelled', 'The request was cancelled.');
      if (response.status === 401 && session && retry) {
        await this.#refresh(session.accessToken, generation);
        return await this.#request(path, { method, json, body, mediaType, auth, retry: false, binary, timeoutMs, signal }, generation);
      }
      if (response.ok && binary) {
        const blob = await response.blob();
        this.#assertCurrent(generation);
        if (signal?.aborted) throw new MobileError('cancelled', 'The request was cancelled.');
        return blob;
      }
      if (response.status === 204) return {};
      let value;
      try { value = await response.json(); }
      catch { throw new MobileError('invalid_response', 'The server returned an unreadable response.', response.status); }
      this.#assertCurrent(generation);
      if (signal?.aborted) throw new MobileError('cancelled', 'The request was cancelled.');
      if (!response.ok) throw new MobileError(value?.error?.code || 'request_failed', value?.error?.message || 'The server could not complete this request.', response.status);
      return value;
    } catch (error) {
      this.#assertCurrent(generation);
      if (signal?.aborted) throw new MobileError('cancelled', 'The request was cancelled.');
      if (error instanceof MobileError) throw error;
      if (controller.signal.aborted) throw new MobileError('timeout', 'The server did not respond in time. Check the request status before retrying a submission.');
      throw new MobileError('network_error', 'Could not reach the server. Check your connection and server address.');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      this.#controllers.delete(controller);
    }
  }

  async info() {
    const value = await this.#request('/info', { auth: false });
    if (value?.protocolVersion !== protocolVersion) throw new MobileError('incompatible_protocol', 'This app and server use different mobile protocol versions. Update them together.');
    requireString(value.serverId, 'Server identity');
    if (this.#serverId && this.#serverId !== value.serverId) throw new MobileError('server_changed', 'The server identity has changed. Pair this device again.');
    this.#serverId = value.serverId;
    return value;
  }

  async pair(code, deviceName) {
    requireString(code, 'Pairing code');
    requireString(deviceName, 'Device name');
    if (!this.#serverId) await this.info();
    return this.#request('/pairings', { method: 'POST', auth: false, json: { code, deviceName } });
  }

  async completePairing(claimToken) {
    requireString(claimToken, 'Pairing claim');
    const generation = this.#generation;
    if (!this.#serverId) await this.info();
    const value = await this.#request('/pairings/complete', { method: 'POST', auth: false, json: { claimToken } }, generation);
    if (value?.status === 'pending') return value;
    assertSession(value);
    if (value.serverId !== this.#serverId) throw new MobileError('server_changed', 'The pairing response came from a different server.');
    const session = { ...value, serverUrl: this.baseUrl, ...(this.tlsPin ? { tlsPin: this.tlsPin } : { tlsPin: undefined }) };
    this.#assertCurrent(generation);
    const pairedGeneration = ++this.#generation;
    for (const connection of [...this.#connections]) connection.close();
    for (const controller of this.#controllers) controller.abort();
    await this.#store(async () => {
      this.#assertCurrent(pairedGeneration);
      await this.#tokenStore.set(session);
    });
    this.#assertCurrent(pairedGeneration);
    return session;
  }

  state() { return this.#request('/state'); }
  conversations() { return this.#request('/conversations'); }
  parts(conversationId) { return this.action('parts', { conversationId: requireString(conversationId, 'Conversation') }); }
  search(conversationId, query, options = {}) {
    return this.action('search', { ...options, conversationId: requireString(conversationId, 'Conversation'), query: requireString(query, 'Search query') });
  }
  async context(conversationId, sessionId, seq, options = {}) {
    const generation = this.#generation;
    const session = await this.#session(generation);
    const page = await this.action('context', { ...options, conversationId: requireString(conversationId, 'Conversation'), sessionId: requireString(sessionId, 'Session'), seq });
    this.#assertCurrent(generation);
    await this.#cacheMessages(session.serverId, conversationId, old => mergeMessages(old, page.messages), generation);
    return page;
  }
  settings() { return this.action('settings-describe'); }
  updateSettings(ns, patch, expectedRevision) { return this.action('settings-update', { ns: requireString(ns, 'Settings namespace'), patch, expectedRevision }); }
  mutateSettings(ns, ops, expectedRevision) { return this.action('settings-mutate', { ns: requireString(ns, 'Settings namespace'), ops, expectedRevision }); }
  credentials(refs) { return this.action('credentials-describe', { refs }); }
  setCredential(ref, value) { return this.action('credentials-set', { ref: requireString(ref, 'Credential reference'), value: requireString(value, 'Credential value') }); }
  unsetCredential(ref) { return this.action('credentials-unset', { ref: requireString(ref, 'Credential reference') }); }
  approvals() { return this.action('approvals'); }
  resolveApproval(id, decision) {
    if (!['allowed-once', 'rejected'].includes(decision)) throw new MobileError('invalid_input', 'Choose Allow once or Reject for this request.');
    return this.action('approval-resolve', { id: requireString(id, 'Approval request'), decision });
  }
  plugins() { return this.action('plugins-list'); }
  setPluginEnabled(id, enabled) { return this.action('plugins-set-enabled', { id: requireString(id, 'Plugin'), enabled }); }
  setBundleEnabled(id, enabled) { return this.action('bundle-set-enabled', { id: requireString(id, 'Bundle'), enabled }); }
  skills(conversationId) { return this.action('skills-list', conversationId === undefined ? {} : { conversationId: requireString(conversationId, 'Conversation') }); }

  async messages(conversationId, { cursor, limit, signal } = {}) {
    const query = new URLSearchParams();
    if (cursor != null) query.set('cursor', cursor);
    if (limit != null) query.set('limit', String(limit));
    const generation = this.#generation;
    const session = await this.#session(generation);
    const page = await this.#request(`/conversations/${encodeURIComponent(requireString(conversationId, 'Conversation'))}/messages?${query}`, { signal }, generation);
    await this.#cacheMessages(session.serverId, conversationId, old => mergeMessages(old, page.messages), generation);
    return page;
  }

  target(conversationId) { return this.#request(`/conversations/${encodeURIComponent(requireString(conversationId, 'Conversation'))}/target`); }
  submit(submission) {
    for (const key of ['conversationId', 'sessionId', 'requestId']) requireString(submission[key], key);
    return this.#request('/submissions', { method: 'POST', json: submission });
  }
  submission(requestId) { return this.#request(`/submissions/${encodeURIComponent(requireString(requestId, 'Request identifier'))}`); }
  async rememberAcceptedSubmission(submission, receipt) {
    const message = acceptedSubmissionMessage(submission, receipt);
    const generation = this.#generation;
    const session = await this.#session(generation);
    await this.#cacheMessages(session.serverId, submission.conversationId, old => mergeMessages(old, [message]), generation);
  }
  cancel(conversationId) { return this.#request(`/conversations/${encodeURIComponent(requireString(conversationId, 'Conversation'))}/cancel`, { method: 'POST', json: {} }); }
  action(endpoint, payload = {}, { signal } = {}) { return this.#request('/actions', { method: 'POST', json: { endpoint, payload }, signal }); }
  upload({ conversationId, sessionId, name, mediaType, body }) {
    for (const [key, value] of Object.entries({ conversationId, sessionId, name, mediaType })) requireString(value, key);
    return this.#request(`/uploads?${new URLSearchParams({ conversationId, sessionId, name, mediaType })}`, { method: 'POST', body, mediaType });
  }
  transcribe({ name, mediaType, body, signal }) {
    requireString(name, 'File name');
    requireString(mediaType, 'Media type');
    return this.#request(`/transcriptions?${new URLSearchParams({ name, mediaType })}`, { method: 'POST', body, mediaType, timeoutMs: 125000, signal });
  }
  devices() { return this.#request('/devices'); }
  revokeDevice(deviceId) { return this.#request(`/devices/${encodeURIComponent(requireString(deviceId, 'Device'))}`, { method: 'DELETE' }); }
  markRead(conversationId, seq) { return this.#request('/read-markers', { method: 'POST', json: { conversationId, seq } }); }
  attachment(conversationId, sessionId, attachmentId, options = {}) {
    for (const [key, value] of Object.entries({ conversationId, sessionId, attachmentId })) requireString(value, key);
    const query = new URLSearchParams({ conversationId, sessionId });
    if (options.seq !== undefined) {
      if (!Number.isSafeInteger(options.seq) || options.seq < 0) throw new MobileError('invalid_sequence', 'An exact message sequence is required.');
      query.set('seq', String(options.seq));
    }
    return this.#request(`/attachments/${encodeURIComponent(attachmentId)}?${query}`, { binary: true, signal: options.signal });
  }

  download(path) {
    // Download locations are server-local capabilities, never arbitrary remote URLs.
    const match = typeof path === 'string' && /^\/mobile\/v1\/attachments\/([^/?#]+)(?:\?[^#]*)?$/.exec(path);
    let id;
    try { id = match && decodeURIComponent(match[1]); } catch {}
    if (!id || !/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?$/.test(id)) throw new MobileError('invalid_download', 'The attachment download address is invalid.');
    return this.#request(path.slice('/mobile/v1'.length), { binary: true });
  }

  #cacheMessages(serverId, conversationId, update, generation) {
    const cacheGeneration = this.#cacheGeneration;
    const result = this.#cacheQueue.then(async () => {
      this.#assertCurrent(generation);
      if (cacheGeneration !== this.#cacheGeneration) return;
      const current = await this.cache.getMessages(serverId, conversationId);
      this.#assertCurrent(generation);
      if (cacheGeneration !== this.#cacheGeneration) return;
      await this.cache.setMessages(serverId, conversationId, update(current));
    });
    this.#cacheQueue = result.catch(() => {});
    return result;
  }

  async clearCachedData() {
    const session = await this.#session();
    this.#cacheGeneration++;
    const result = this.#cacheQueue.then(() => this.cache.clear(session.serverId));
    this.#cacheQueue = result.catch(() => {});
    await result;
  }

  async getCachedMessages(conversationId) {
    const session = await this.#session();
    await this.#cacheQueue;
    return this.cache.getMessages(session.serverId, conversationId);
  }
  async getDraft(conversationId) {
    const session = await this.#session();
    return this.cache.getDraft(session.serverId, conversationId);
  }
  async setDraft(conversationId, text) {
    const session = await this.#session();
    return this.cache.setDraft(session.serverId, conversationId, text);
  }

  connect({ conversationId, after, onEvent, onStatus = () => {}, onError = () => {} }) {
    this.#assertCurrent();
    requireString(conversationId, 'Conversation');
    if (typeof this.#WebSocket !== 'function') throw new MobileError('missing_websocket', 'This runtime needs a WebSocket implementation.');
    if (typeof onEvent !== 'function') throw new MobileError('invalid_listener', 'An event listener is required.');
    const generation = this.#generation;
    let stopped = false;
    let socket = null;
    let timer = null;
    let handshake = null;
    let attempts = 0;
    let refreshNext = false;
    let sentToken;
    const active = () => !stopped && !this.#disposed && generation === this.#generation;
    const emitError = error => { if (active()) onError(error); };
    const finish = status => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      clearTimeout(handshake);
      this.#connections.delete(connection);
      const current = socket;
      socket = null;
      if (current) current.close();
      onStatus(status);
    };
    const connection = { close: () => finish('closed') };
    const schedule = () => {
      if (!active() || timer) return;
      onStatus('reconnecting');
      const delay = Math.min(this.#reconnectMaxDelay, this.#reconnectDelay * 2 ** Math.min(attempts++, 8));
      timer = setTimeout(() => { timer = null; void open(); }, delay);
    };
    const open = async () => {
      if (!active()) return;
      onStatus(attempts ? 'reconnecting' : 'connecting');
      try {
        const session = refreshNext ? await this.#refresh(sentToken, generation) : await this.#validSession(generation);
        refreshNext = false;
        if (!active()) return;
        sentToken = session.accessToken;
        const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}/mobile/v1/events`;
        const current = new this.#WebSocket(wsUrl);
        socket = current;
        const currentActive = () => active() && socket === current;
        handshake = setTimeout(() => { if (currentActive()) current.close(); }, Math.min(this.#timeout, 20000));
        current.onopen = () => {
          if (!currentActive()) { current.close(); return; }
          current.send(JSON.stringify({ type: 'auth', token: session.accessToken, conversationId, ...(after == null ? {} : { after }) }));
        };
        current.onmessage = ({ data }) => {
          if (!currentActive()) return;
          let event;
          try { event = JSON.parse(data); }
          catch { emitError(new MobileError('invalid_event', 'The server sent an unreadable event.')); return; }
          if (!event || !['ready', 'delta', 'message', 'reset', 'status', 'error'].includes(event.type)) return;
          if (event.conversationId && event.conversationId !== conversationId) return;
          if (event.type === 'ready') {
            clearTimeout(handshake);
            attempts = 0;
            onStatus('connected');
          }
          if (event.eventSeq != null) after = event.eventSeq;
          if (event.type === 'error') {
            const code = String(event.error?.code || event.code || 'stream_error').toLowerCase();
            if (['unauthorized', 'token_expired', 'invalid_token'].includes(code)) {
              refreshNext = true;
              current.close();
              return;
            }
          }
          if (['reset', 'message'].includes(event.type)) {
            void this.#cacheMessages(session.serverId, conversationId, old => applyConversationEvent(old, event), generation).catch(emitError);
          }
          try { onEvent(event); } catch (error) { emitError(error); }
        };
        current.onerror = () => { if (currentActive()) current.close(); };
        current.onclose = ({ code }) => {
          if (!currentActive()) return;
          clearTimeout(handshake);
          socket = null;
          if (code === 4401 || code === 4403) refreshNext = true;
          schedule();
        };
      } catch (error) {
        if (!active()) return;
        emitError(error);
        if (error.status === 401 || error.status === 403 || ['unauthorized', 'server_changed', 'invalid_session'].includes(error.code)) finish('unauthorized');
        else schedule();
      }
    };
    this.#connections.add(connection);
    void open();
    return connection;
  }

  async logout() {
    this.#generation++;
    for (const connection of [...this.#connections]) connection.close();
    for (const controller of this.#controllers) controller.abort();
    await this.#store(() => this.#tokenStore.clear());
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation++;
    for (const connection of [...this.#connections]) connection.close();
    for (const controller of this.#controllers) controller.abort();
  }
}
