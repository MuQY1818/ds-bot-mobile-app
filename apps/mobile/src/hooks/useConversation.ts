import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import {
  acceptedSubmissionMessage,
  Attachment,
  ConnectionStatus,
  mergeMessages,
  Message,
  MobileClient,
  Submission,
} from "@ds-bot/mobile-sdk";
import { cache, Host, readCache, writeCache, writeSendCache, tokenStore } from "../storage";
import { errorText } from "../types";
import { confirmOrSubmit, definitelyRejected } from "../logic/submissions";
import { mobileActionAllowed, mobileCancelAllowed, BRIDGE_UNAVAILABLE } from "../logic/mobile-access";
import type { MobileCapabilities } from "../logic/mobile-capabilities";
import { useScreenActivity } from "../components/ScreenActivity";
import { conversationStreams } from "../logic/conversation-streams";
import { outgoingMessage, recoveredIntent, type OutgoingIntent } from "../logic/outgoing";
interface PendingSubmission extends Submission {
  deviceId?: string;
}
export interface QueueItem {
  id: string;
  requestId: string;
  text: string;
  target: string;
}
// Retained and newly mounted screens share ordering for one conversation.
// In particular, an old initial draft clear must finish before a newer edit.
const conversationWrites = new Map<string, Promise<void>>();
export function useConversation(client: MobileClient, host: Host, id: string, capabilities?: MobileCapabilities) {
  const focused = useScreenActivity();
  const hydration = useRef<Promise<void>>(Promise.resolve());
  const canQueue = mobileActionAllowed(capabilities, "queue");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueSession, setQueueSession] = useState("");
  useEffect(() => { if (!canQueue) { setQueue([]); setQueueSession(""); } }, [canQueue]);
  const [messages, setMessages] = useState<Message[]>(() => conversationStreams.peek(client, host.serverId, id)?.snapshot.messages ?? []);
  const [draft, setDraftState] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(() => conversationStreams.peek(client, host.serverId, id)?.status ?? "connecting");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState("");
  useEffect(() => {
    if (receipt !== "Sent") return;
    const timer = setTimeout(() => setReceipt(""), 3000);
    return () => clearTimeout(timer);
  }, [receipt]);
  const [pending, setPending] = useState<PendingSubmission | null>(null);
  const [outgoing, setOutgoingState] = useState<OutgoingIntent | null>(null);
  const outgoingRef = useRef<OutgoingIntent | null>(null);
  const pendingRef = useRef<PendingSubmission | null>(null);
  const hydrated = useRef(false);
  const draftRef = useRef("");
  const [previousDevice, setPreviousDevice] = useState(false);
  const [archived, setArchived] = useState<PendingSubmission[]>([]);
  const [rejected, setRejected] = useState(false);
  const alive = useRef(true);
  const sending = useRef(false);
  const lastSubmission = useRef<{ requestId: string; sessionId: string } | null>(null);
  const refreshMessages = useRef<() => void>(() => {});
  const scope = useRef({ client, serverId: host.serverId, id });
  const streamOwner = useRef({ client, serverId: host.serverId });
  if (scope.current.client !== client || scope.current.serverId !== host.serverId || scope.current.id !== id)
    scope.current = { client, serverId: host.serverId, id };
  useEffect(() => {
    let active = true;
    if (streamOwner.current.client !== client || streamOwner.current.serverId !== host.serverId) {
      conversationStreams.clear(streamOwner.current.client);
      streamOwner.current = { client, serverId: host.serverId };
    }
    const retained = conversationStreams.peek(client, host.serverId, id);
    setMessages(retained?.snapshot.messages ?? []);
    setStatus(retained?.status ?? "connecting");
    setRunning(retained?.snapshot.running ?? false);
    setQueue(canQueue ? (retained?.snapshot.queue ?? []) as QueueItem[] : []);
    setQueueSession(canQueue ? retained?.snapshot.queueSession ?? "" : "");
    setCursor(retained?.snapshot.cursor ?? null);
    setError("");
    sending.current = false;
    hydrated.current = false;
    outgoingRef.current = null;
    pendingRef.current = null;
    setOutgoingState(null);
    setBusy(false);
    hydration.current = Promise.all([
      cache.getMessages(host.serverId, id),
      cache.getDraft(host.serverId, id),
      readCache<PendingSubmission | null>(host.serverId, `pending:${id}`),
      tokenStore.get(),
      readCache<PendingSubmission[]>(host.serverId, `archive:${id}`),
      readCache<OutgoingIntent | null>(host.serverId, `outgoing:${id}`),
    ])
      .then(([saved, text, submission, session, previous, intent]) => {
        if (active) {
          const recovered = intent ? { ...intent, delivery: intent.delivery === "rejected" ? "rejected" as const : "unconfirmed" as const }
            : submission ? recoveredIntent(submission) : null;
          outgoingRef.current = recovered;
          pendingRef.current = submission;
          setOutgoingState(recovered);
          setRejected(recovered?.delivery === "rejected");
          setMessages(previous => mergeMessages(saved, previous));
          draftRef.current = text;
          setDraftState(draftRef.current);
          setPending(submission);
          setPreviousDevice(
            !!recovered?.deviceId && recovered.deviceId !== session?.deviceId,
          );
          setArchived(previous || []);
          hydrated.current = true;
        }
      })
      .catch((err) => {
        if (active)
          setError(`Local cache could not be loaded: ${errorText(err)}`);
      });
    return () => { active = false; };
  }, [client, host.serverId, id]);
  useEffect(() => {
    alive.current = true;
    let stream: ReturnType<typeof conversationStreams.acquire> | undefined;
    let request: AbortController | undefined;
    let active = true;
    let generation = 0;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let pollRequest: AbortController | undefined;
    let pollFailures = 0;
    let pollAgain = false;
    let connectionStatus: ConnectionStatus = "connecting";
    let starting = false;
    let foreground =
      AppState.currentState !== "background" &&
      AppState.currentState !== "inactive";
    const visible = () => active && foreground && focused;
    function stopPolling() {
      clearTimeout(pollTimer);
      pollTimer = undefined;
      pollRequest?.abort();
      pollRequest = undefined;
    }
    function schedulePoll(delay = 3000, force = false) {
      if (!visible() || connectionStatus === "unauthorized") return;
      if (force) pollAgain = true;
      if (pollRequest || (pollTimer && !force)) return;
      clearTimeout(pollTimer);
      pollTimer = setTimeout(() => { pollTimer = undefined; void poll(); }, delay);
    }
    async function poll() {
      if (!visible() || pollRequest) return;
      const run = generation;
      const controller = new AbortController();
      pollRequest = controller;
      pollAgain = false;
      try {
        const page = await client.messages(id, { signal: controller.signal });
        if (!visible() || generation !== run) return;
        stream?.remember(page.messages);
        setMessages(previous => mergeMessages(previous, page.messages));
        pollFailures = 0;
      } catch {
        if (visible() && generation === run) pollFailures++;
      } finally {
        if (pollRequest === controller) pollRequest = undefined;
        if (visible() && generation === run && (connectionStatus !== "connected" || pollAgain))
          schedulePoll(Math.min(30000, 3000 * 2 ** Math.min(pollFailures, 4)));
      }
    }
    const refresh = () => schedulePoll(0, true);
    refreshMessages.current = refresh;
    async function start() {
      if (!visible() || stream || starting) return;
      starting = true;
      const run = ++generation;
      const current = () => active && foreground && focused && generation === run;
      await hydration.current;
      starting = false;
      if (!current()) return;
      stopPolling();
      pollFailures = 0;
      request?.abort();
      request = new AbortController();
      try {
      stream = conversationStreams.acquire(client, host.serverId, id, {
        onStatus: (value) => {
          if (!current()) return;
          connectionStatus = value;
          setStatus(value);
          if (value === "unauthorized") {
            pollAgain = false;
            stopPolling();
          } else if (value === "connected") {
            if (!pollAgain) { clearTimeout(pollTimer); pollTimer = undefined; }
          } else schedulePoll();
        },
        onError: (err) => {
          if (current()) setError(errorText(err));
        },
        onSnapshot: (snapshot) => {
          if (!current()) return;
          setRunning(snapshot.running);
          if (canQueue && snapshot.queue) {
            setQueue(snapshot.queue as QueueItem[]);
            setQueueSession(snapshot.queueSession || "");
          }
          setError("");
          // The lease owns pending stream attempts, including events received
          // without a screen listener. Keep cached/accepted canonical rows.
          setMessages(previous => mergeMessages(previous.some(message => message.pending) ? previous.filter(message => !message.pending) : previous, snapshot.messages));
          if (snapshot.cursor !== undefined) setCursor(previous => previous ?? snapshot.cursor ?? null);
        },
      });
      } catch (err) {
        if (current()) { setError(errorText(err)); schedulePoll(); }
      }
      // Handshake and REST/cache reconciliation are independent. A slow page
      // read or SQLite queue must never delay the live stream.
      const lease = stream;
      void client.messages(id, { signal: request.signal }).then(page => {
        if (!current()) return;
        lease?.remember(page.messages, page.cursor);
        setMessages(previous => mergeMessages(previous, page.messages));
        setCursor(page.cursor);
      }).catch(err => { if (current()) setError(errorText(err)); });
      if (canQueue) void client
        .action<{ sessionId: string; items: QueueItem[] }>("queue", {
          conversationId: id,
        })
        .then((value) => {
          if (current()) {
            setQueue(value.items);
            setQueueSession(value.sessionId);
          }
        })
        .catch(() => {});
    }
    if (focused) void start();
    const sub = AppState.addEventListener("change", (value) => {
      foreground = value === "active";
      if (foreground) void start();
      else {
        generation++;
        starting = false;
        stopPolling();
        conversationStreams.clear(client);
        stream?.release();
        stream = undefined;
        request?.abort();
        setStatus("closed");
      }
    });
    return () => {
      active = false;
      generation++;
      stopPolling();
      if (refreshMessages.current === refresh) refreshMessages.current = () => {};
      alive.current = false;
      stream?.release();
      request?.abort();
      sub.remove();
    };
  }, [client, host.serverId, id, canQueue, focused]);
  const setDraft = useCallback(
    (text: string) => {
      draftRef.current = text;
      setDraftState(text);
      void queueDraftWrite(() => cache.setDraft(host.serverId, id, text)).catch((err) => {
        if (alive.current)
          setError(`Draft could not be saved: ${errorText(err)}`);
      });
    },
    [host.serverId, id],
  );
  async function older() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const page = await client.messages(id, { cursor });
      setMessages((old) => mergeMessages(page.messages, old));
      setCursor(page.cursor);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  function queueDraftWrite(operation: () => Promise<void>) {
    const key = JSON.stringify([host.serverId, id]);
    const result = (conversationWrites.get(key) || Promise.resolve()).catch(() => {}).then(operation);
    const settled = result.catch(() => {});
    conversationWrites.set(key, settled);
    void settled.then(() => { if (conversationWrites.get(key) === settled) conversationWrites.delete(key); });
    return result;
  }
  function projectOutgoing(intent: OutgoingIntent | null) {
    outgoingRef.current = intent;
    setOutgoingState(intent);
  }
  function beginSend(attachments: Attachment[] = [], sessionId?: string, voiceText?: string) {
    const text = (voiceText ?? draftRef.current).trim();
    if (!hydrated.current || sending.current || outgoingRef.current || pendingRef.current || (!text && !attachments.length)) return null;
    const intent: OutgoingIntent = {
      requestId: Crypto.randomUUID(), conversationId: id, text, attachments: [...attachments],
      createdAt: Date.now(), expectedSessionId: sessionId, delivery: "sending",
    };
    // This state update precedes token, target, storage and every network await.
    projectOutgoing(intent);
    draftRef.current = "";
    setDraftState("");
    setRejected(false);
    setReceipt("");
    setError("");
    const persisted = queueDraftWrite(async () => {
      // Preserve the original text in the outbox before clearing its old draft.
      // If interrupted between writes, keeping both is safer than losing text.
      if (!await writeSendCache(host.serverId, `outgoing:${id}`, intent, null))
        throw new Error("Another send is still awaiting confirmation. Reopen this conversation.");
      await cache.setDraft(host.serverId, id, "");
    });
    return deliver(intent, true, persisted);
  }
  function retry() {
    if (!hydrated.current || sending.current) return null;
    const intent = outgoingRef.current || (pendingRef.current ? recoveredIntent(pendingRef.current) : null);
    if (!intent) return null;
    return deliver({ ...intent, delivery: "sending" }, false);
  }
  async function deliver(intent: OutgoingIntent, fresh: boolean, initialPersistence?: Promise<void>) {
    const sendScope = scope.current;
    const current = () => alive.current && scope.current === sendScope;
    sending.current = true;
    setBusy(true);
    projectOutgoing(intent);
    setError("");
    setReceipt("");
    let bound = intent;
    try {
      await (initialPersistence || queueDraftWrite(async () => {
        if (!await writeSendCache(host.serverId, `outgoing:${id}`, intent, intent.requestId)) {
          if (!await writeSendCache(host.serverId, `outgoing:${id}`, intent, null))
            throw new Error("This send was already resolved. Reopen this conversation.");
        }
      }));
      if (!current()) return false;
      const session = await tokenStore.get();
      if (!current()) return false;
      if (!session) throw new Error("This device is not paired. Reconnect in Settings.");
      if (bound.deviceId && bound.deviceId !== session.deviceId)
        throw new Error("This send belongs to a previous device pairing. Review it on your host; it cannot be retried from this pairing.");
      bound = { ...bound, deviceId: session.deviceId };
      // Bind pairing identity before awaiting the authoritative target.
      await queueDraftWrite(async () => {
        if (!await writeSendCache(host.serverId, `outgoing:${id}`, bound, bound.requestId))
          throw new Error("This send was already resolved. Reopen this conversation.");
      });
      if (!current()) return false;
      let payload = pendingRef.current?.requestId === bound.requestId ? pendingRef.current : null;
      const alreadyDurable = !!payload;
      if (!payload) {
        const target = bound.sessionId ? { sessionId: bound.sessionId } : await client.target(id);
        if (!current()) return false;
        if (bound.expectedSessionId && bound.expectedSessionId !== target.sessionId)
          throw Object.assign(new Error("The host moved to a new conversation part. Remove and attach the files again before sending."), { notDispatched: true });
        bound = { ...bound, sessionId: target.sessionId };
        projectOutgoing(bound);
        payload = { deviceId: session.deviceId, conversationId: id, sessionId: target.sessionId,
          requestId: bound.requestId, text: bound.text, attachments: bound.attachments };
        const durablePayload = payload;
        await queueDraftWrite(async () => {
          if (!await writeSendCache(host.serverId, `outgoing:${id}`, bound, bound.requestId)
            || !(await writeSendCache(host.serverId, `pending:${id}`, durablePayload, durablePayload.requestId)
              || await writeSendCache(host.serverId, `pending:${id}`, durablePayload, null)))
            throw new Error("Another send is still awaiting confirmation. Reopen this conversation.");
        });
        if (!current()) return false;
        pendingRef.current = payload;
        setPending(payload);
      }
      const { deviceId, ...submission } = payload;
      // Only a brand-new durable identity skips receipt lookup. Restored or
      // uncertain sends always reconcile before any possible repeated POST.
      const result = fresh && !alreadyDurable ? await client.submit(submission)
        : await confirmOrSubmit(client, submission, { storedDeviceId: deviceId, currentDeviceId: session.deviceId });
      if (result.status === "accepted") {
        void client.rememberAcceptedSubmission(submission, result).catch(err => {
          if (current()) setError(`Sent, but the local cache could not be saved: ${errorText(err)}`);
        });
      }
      if (!current()) return false;
      if (result.status === "rejected") {
        setRejected(true);
        throw new Error("The host rejected this send. Keep your draft and prepare a new submission.");
      }
      if (result.status !== "accepted")
        throw new Error("The host cannot yet confirm this send. Keep the original request and check again; it will not be sent automatically.");
      const acknowledged = acceptedSubmissionMessage(submission, result);
      setMessages(previous => mergeMessages(previous, [acknowledged]));
      projectOutgoing(null);
      pendingRef.current = null;
      setPending(null);
      setRejected(false);
      refreshMessages.current();
      lastSubmission.current = { requestId: payload.requestId, sessionId: payload.sessionId };
      setReceipt("Sent");
      // The composer was cleared at tap time. Never clear a newer draft here.
      void queueDraftWrite(async () => {
        await writeSendCache(host.serverId, `pending:${id}`, null, payload.requestId);
        await writeSendCache(host.serverId, `outgoing:${id}`, null, payload.requestId);
      }).catch(err => { if (current()) setError(`Sent, but the local cache could not be saved: ${errorText(err)}`); });
      return true;
    } catch (err) {
      const rejectedSend = definitelyRejected(err) || (typeof err === "object" && err !== null && (("notDispatched" in err && err.notDispatched === true) || ("message" in err && String(err.message).includes("host rejected"))));
      const failed: OutgoingIntent = { ...bound, delivery: rejectedSend ? "rejected" : "unconfirmed" };
      if (current()) {
        projectOutgoing(failed);
        if (rejectedSend) setRejected(true);
        setError(errorText(err));
      }
      void queueDraftWrite(async () => { await writeSendCache(host.serverId, `outgoing:${id}`, failed, failed.requestId); }).catch(() => {});
      return false;
    } finally {
      if (scope.current === sendScope) {
        sending.current = false;
        if (alive.current) setBusy(false);
      }
    }
  }
  async function send(attachments: Attachment[] = [], sessionId?: string, voiceText?: string) {
    const operation = outgoingRef.current || pendingRef.current ? (voiceText === undefined ? retry() : null) : beginSend(attachments, sessionId, voiceText);
    return operation ? await operation : false;
  }
  async function cancel() {
    if (!mobileCancelAllowed(capabilities)) { setError(BRIDGE_UNAVAILABLE); return; }
    setError("");
    try {
      await client.cancel(id);
      setReceipt(
        "Stop requested. Queued messages are retained; send another message to resume them.",
      );
    } catch (err) {
      setError(errorText(err));
    }
  }
  async function archivePrevious() {
    if (!previousDevice || (!pendingRef.current && !outgoingRef.current)) return;
    const old = pendingRef.current || outgoingRef.current!;
    const items = [...archived, old];
    await queueDraftWrite(async () => {
      await writeCache(host.serverId, `archive:${id}`, items);
      await writeSendCache(host.serverId, `pending:${id}`, null, old.requestId);
      await writeSendCache(host.serverId, `outgoing:${id}`, null, old.requestId);
    });
    setArchived(items as PendingSubmission[]);
    pendingRef.current = null;
    projectOutgoing(null);
    setPending(null);
    setPreviousDevice(false);
    setError("");
  }
  async function removeQueued(itemId: string) {
    if (!mobileActionAllowed(capabilities, "queue-remove")) { setError(BRIDGE_UNAVAILABLE); return; }
    try {
      await client.action("queue-remove", {
        conversationId: id,
        sessionId: queueSession,
        itemId,
      });
      setQueue((old) => old.filter((item) => item.id !== itemId));
    } catch (err) {
      setError(errorText(err));
    }
  }
  async function recompose() {
    if (!rejected) return;
    if (draftRef.current.trim()) {
      setError("Your new draft is kept. Clear it before restoring this failed message.");
      return;
    }
    const failed = outgoingRef.current;
    if (failed) {
      draftRef.current = failed.text;
      setDraftState(failed.text);
      await queueDraftWrite(() => cache.setDraft(host.serverId, id, failed.text));
    }
    const requestId = failed?.requestId || pendingRef.current?.requestId;
    if (requestId) await queueDraftWrite(async () => {
      await writeSendCache(host.serverId, `pending:${id}`, null, requestId);
      await writeSendCache(host.serverId, `outgoing:${id}`, null, requestId);
    });
    pendingRef.current = null;
    projectOutgoing(null);
    setPending(null);
    setRejected(false);
    setError("");
    return failed?.attachments || [];
  }
  return {
    previousDevice,
    archived,
    archivePrevious,
    queue,
    removeQueued,
    rejected,
    recompose,
    messages: outgoing ? mergeMessages(messages, [outgoingMessage(outgoing)]) : messages,
    outgoing,
    beginSend,
    retry,
    draft,
    setDraft,
    cursor,
    status,
    running,
    error,
    setError,
    busy,
    receipt,
    pending,
    older,
    send,
    async sendVoice(text: string) { return await send([], undefined, text) ? lastSubmission.current : null; },
    cancel,
  };
}
