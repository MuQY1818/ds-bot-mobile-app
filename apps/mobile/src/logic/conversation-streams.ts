import { applyConversationEvent, mergeMessages, type ConnectionStatus, type Message, type MobileClient, type MobileEvent } from "@ds-bot/mobile-sdk";

export interface ConversationSnapshot {
  messages: Message[];
  running: boolean;
  queue?: MobileEvent["queue"];
  queueSession?: string;
  cursor?: string | null;
}
export interface ConversationListener {
  onStatus(value: ConnectionStatus): void;
  onSnapshot(value: ConversationSnapshot): void;
  onError(error: unknown): void;
}
interface Entry {
  id: string;
  valid: boolean;
  status: ConnectionStatus;
  snapshot: ConversationSnapshot;
  error?: unknown;
  listeners: Set<ConversationListener>;
  stream?: { close(): void };
  timer?: ReturnType<typeof setTimeout>;
  idleOrder: number;
}
interface Pool { serverId: string; entries: Map<string, Entry> }

/** Screen subscriptions detach independently of a bounded, foreground transport. */
export function createConversationStreamPool({
  graceMs = 30000, maxIdle = 3, maxStreams = 4,
  setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  const clients = new WeakMap<MobileClient, Pool>();
  let sequence = 0;
  const notify = (entry: Entry, action: (listener: ConversationListener) => void) => {
    for (const listener of [...entry.listeners]) {
      try { action(listener); } catch { /* One detached UI must not interrupt cache/other listeners. */ }
    }
  };
  function remove(pool: Pool, entry: Entry, status: ConnectionStatus = "closed") {
    if (!entry.valid) return;
    entry.valid = false;
    clearTimer(entry.timer);
    if (pool.entries.get(entry.id) === entry) pool.entries.delete(entry.id);
    entry.status = status;
    entry.stream?.close();
    notify(entry, listener => listener.onStatus(status));
    entry.listeners.clear();
  }
  function clear(client: MobileClient) {
    const pool = clients.get(client);
    if (!pool) return;
    for (const entry of [...pool.entries.values()]) remove(pool, entry);
    clients.delete(client);
  }
  function idle(pool: Pool) {
    return [...pool.entries.values()].filter(entry => !entry.listeners.size).sort((a, b) => a.idleOrder - b.idleOrder);
  }
  function peek(client: MobileClient, serverId: string, id: string) {
    const pool = clients.get(client), entry = pool?.serverId === serverId ? pool.entries.get(id) : undefined;
    return entry?.valid ? { status: entry.status, snapshot: entry.snapshot } : undefined;
  }
  function acquire(client: MobileClient, serverId: string, id: string, listener: ConversationListener) {
    let pool = clients.get(client);
    if (pool && pool.serverId !== serverId) { clear(client); pool = undefined; }
    if (!pool) { pool = { serverId, entries: new Map() }; clients.set(client, pool); }
    const owner = pool;
    let entry = pool.entries.get(id);
    if (!entry) {
      while (pool.entries.size >= maxStreams) {
        const oldest = idle(pool)[0];
        if (!oldest) throw new Error("Too many active conversations. Close another conversation first.");
        remove(pool, oldest);
      }
      entry = { id, valid: true, status: "connecting", snapshot: { messages: [], running: false }, listeners: new Set(), idleOrder: ++sequence };
      // Register before connect: the SDK can report its initial status synchronously.
      pool.entries.set(id, entry);
      const current = entry;
      try {
        current.stream = client.connect({
          conversationId: id,
          onStatus(status) {
            if (!current.valid) return;
            if (status === "closed" || status === "unauthorized") { remove(owner, current, status); return; }
            current.status = status;
            notify(current, item => item.onStatus(status));
          },
          onError(error) {
            if (!current.valid) return;
            current.error = error;
            notify(current, item => item.onError(error));
          },
          onEvent(event) {
            if (!current.valid || (event.conversationId && event.conversationId !== id)) return;
            const previous = current.snapshot;
            let running = previous.running;
            if (typeof event.busy === "boolean") running = event.busy;
            else if (event.phase === "running" || event.type === "delta") running = true;
            else if (event.phase === "idle") running = false;
            current.snapshot = {
              ...previous, running,
              messages: applyConversationEvent(previous.messages, event).slice(-400),
              ...(Array.isArray(event.queue) ? { queue: event.queue, queueSession: event.sessionId || "" } : {}),
              ...(event.type === "reset" ? { cursor: previous.cursor ?? event.cursor ?? null } : {}),
            };
            if (event.type === "error") current.error = new Error(event.error?.message || "Connection error.");
            else current.error = undefined;
            notify(current, item => {
              item.onSnapshot(current.snapshot);
              if (current.error) item.onError(current.error);
            });
          },
        });
        if (!current.valid) current.stream.close();
      } catch (error) { remove(owner, current); throw error; }
    }
    const current = entry;
    clearTimer(current.timer);
    current.timer = undefined;
    if (current.valid) current.listeners.add(listener);
    // Replay transport truth, including reconnecting; cached messages never imply connected.
    listener.onStatus(current.status);
    listener.onSnapshot(current.snapshot);
    if (current.error) listener.onError(current.error);
    let released = false;
    return {
      remember(messages: Message[], cursor?: string | null) {
        if (!current.valid) return;
        current.snapshot = { ...current.snapshot, messages: mergeMessages(current.snapshot.messages, messages).slice(-400), ...(cursor !== undefined ? { cursor } : {}) };
        notify(current, item => item.onSnapshot(current.snapshot));
      },
      release() {
        if (released) return;
        released = true;
        current.listeners.delete(listener);
        if (!current.valid || current.listeners.size) return;
        current.idleOrder = ++sequence;
        current.timer = setTimer(() => remove(owner, current), graceMs);
        current.timer?.unref?.();
        while (idle(owner).length > maxIdle) remove(owner, idle(owner)[0]);
      },
    };
  }
  return { acquire, peek, clear };
}

export const conversationStreams = createConversationStreamPool();

/** Owned by the App/client, so warm streams also close when no chat is mounted. */
export function watchConversationStreamLifecycle(
  client: MobileClient | null,
  appState: { currentState: string | null; addEventListener(event: "change", listener: (state: string) => void): { remove(): void } },
  onForeground: (active: boolean) => void,
  streams = conversationStreams,
) {
  const update = (state: string | null) => {
    const active = state === "active";
    if (!active && client) streams.clear(client);
    onForeground(active);
  };
  const sub = appState.addEventListener("change", update);
  if (appState.currentState === "background" || appState.currentState === "inactive") update(appState.currentState);
  return () => { sub.remove(); if (client) streams.clear(client); };
}
