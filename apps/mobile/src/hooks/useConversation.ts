import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import {
  applyConversationEvent,
  acceptedSubmissionMessage,
  Attachment,
  ConnectionStatus,
  mergeMessages,
  Message,
  MobileClient,
  Submission,
} from "@ds-bot/mobile-sdk";
import { cache, Host, readCache, writeCache, tokenStore } from "../storage";
import { errorText } from "../types";
import { confirmOrSubmit, definitelyRejected } from "../logic/submissions";
import { mobileActionAllowed, mobileCancelAllowed, BRIDGE_UNAVAILABLE } from "../logic/mobile-access";
import type { MobileCapabilities } from "../logic/mobile-capabilities";
import { useScreenActivity } from "../components/ScreenActivity";
interface PendingSubmission extends Submission {
  deviceId?: string;
}
export interface QueueItem {
  id: string;
  requestId: string;
  text: string;
  target: string;
}
export function useConversation(client: MobileClient, host: Host, id: string, capabilities?: MobileCapabilities) {
  const focused = useScreenActivity();
  const hydration = useRef<Promise<void>>(Promise.resolve());
  const canQueue = mobileActionAllowed(capabilities, "queue");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueSession, setQueueSession] = useState("");
  useEffect(() => { if (!canQueue) { setQueue([]); setQueueSession(""); } }, [canQueue]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraftState] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
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
  const [previousDevice, setPreviousDevice] = useState(false);
  const [archived, setArchived] = useState<PendingSubmission[]>([]);
  const [rejected, setRejected] = useState(false);
  const alive = useRef(true);
  const sending = useRef(false);
  const lastSubmission = useRef<{ requestId: string; sessionId: string } | null>(null);
  const draftWrites = useRef<Promise<void>>(Promise.resolve());
  const refreshMessages = useRef<() => void>(() => {});
  const scope = useRef({ client, serverId: host.serverId, id });
  if (scope.current.client !== client || scope.current.serverId !== host.serverId || scope.current.id !== id)
    scope.current = { client, serverId: host.serverId, id };
  useEffect(() => {
    let active = true;
    sending.current = false;
    setBusy(false);
    hydration.current = Promise.all([
      cache.getMessages(host.serverId, id),
      cache.getDraft(host.serverId, id),
      readCache<PendingSubmission | null>(host.serverId, `pending:${id}`),
      tokenStore.get(),
      readCache<PendingSubmission[]>(host.serverId, `archive:${id}`),
    ])
      .then(([saved, text, submission, session, previous]) => {
        if (active) {
          setMessages(saved);
          setDraftState(text);
          setPending(submission);
          setPreviousDevice(
            !!submission && submission.deviceId !== session?.deviceId,
          );
          setArchived(previous || []);
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
    let stream: { close(): void } | undefined;
    let request: AbortController | undefined;
    let active = true;
    let generation = 0;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let pollRequest: AbortController | undefined;
    let pollFailures = 0;
    let pollAgain = false;
    let connectionStatus: ConnectionStatus = "connecting";
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
      if (!active || !foreground || !focused) return;
      await hydration.current;
      if (!active || !foreground || !focused) return;
      const run = ++generation;
      const current = () => active && foreground && focused && generation === run;
      stopPolling();
      connectionStatus = "connecting";
      pollFailures = 0;
      stream?.close();
      request?.abort();
      request = new AbortController();
      try {
        const page = await client.messages(id, { signal: request.signal });
        if (!current()) return;
        setMessages((previous) => mergeMessages(previous, page.messages));
        setCursor(page.cursor);
      } catch (err) {
        if (current()) setError(errorText(err));
      }
      if (!current()) return;
      stream = client.connect({
        conversationId: id,
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
        onEvent: (event) => {
          if (!current()) return;
          if (typeof event.busy === "boolean") setRunning(event.busy);
          else if (event.phase === "running") setRunning(true);
          else if (event.phase === "idle") setRunning(false);
          else if (event.type === "delta") setRunning(true);
          if (Array.isArray(event.queue)) {
            setQueue(event.queue as QueueItem[]);
            setQueueSession(event.sessionId || "");
          }
          if (event.type === "error")
            setError(event.error?.message || "Connection error.");
          else {
            setError("");
            setMessages((previous) => applyConversationEvent(previous, event));
            if (event.type === "reset")
              setCursor((previous) => previous ?? event.cursor ?? null);
          }
        },
      });
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
        stopPolling();
        stream?.close();
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
      stream?.close();
      request?.abort();
      sub.remove();
    };
  }, [client, host.serverId, id, canQueue, focused]);
  const setDraft = useCallback(
    (text: string) => {
      setDraftState(text);
      draftWrites.current = draftWrites.current
        .catch(() => {})
        .then(() => cache.setDraft(host.serverId, id, text));
      void draftWrites.current.catch((err) => {
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
  async function send(attachments: Attachment[] = [], sessionId?: string, voiceText?: string) {
    const sendScope = scope.current;
    const current = () => alive.current && scope.current === sendScope;
    const outgoing = voiceText ?? draft;
    if (sending.current || (voiceText !== undefined && pending) || (!pending && !outgoing.trim() && !attachments.length))
      return false;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      if (voiceText !== undefined) {
        await draftWrites.current;
        await cache.setDraft(host.serverId, id, outgoing);
        if (!current()) return false;
        setDraftState(outgoing);
      }
      const session = await tokenStore.get();
      if (!current()) return false;
      if (!session)
        throw new Error("This device is not paired. Reconnect in Settings.");
      let payload = pending;
      if (!payload) {
        const target = await client.target(id);
        if (!current()) return false;
        if (sessionId && sessionId !== target.sessionId)
          throw new Error(
            "The host moved to a new conversation part. Remove and attach the files again before sending.",
          );
        payload = {
          deviceId: session.deviceId,
          conversationId: id,
          sessionId: target.sessionId,
          requestId: Crypto.randomUUID(),
          text: outgoing.trim(),
          attachments,
        };
        await writeCache(host.serverId, `pending:${id}`, payload);
        if (!current()) return false;
        setPending(payload);
      }
      const { deviceId, ...submission } = payload;
      const result = await confirmOrSubmit(client, submission, {
        storedDeviceId: deviceId,
        currentDeviceId: session.deviceId,
      });
      if (result.status === "accepted") {
        // An old screen may finish after navigation; cache its own receipt, but
        // never insert it into a different chat or clear that chat's draft.
        void client.rememberAcceptedSubmission(submission, result).catch(err => {
          if (current()) setError(`Sent, but the local cache could not be saved: ${errorText(err)}`);
        });
      }
      if (!current()) return false;
      if (result.status === "rejected") {
        setRejected(true);
        throw new Error(
          "The host rejected this send. Keep your draft and prepare a new submission.",
        );
      }
      if (result.status !== "accepted")
        throw new Error(
          "The host cannot yet confirm this send. Keep the original request and check again; it will not be sent automatically.",
        );
      setRejected(false);
      const acknowledged = acceptedSubmissionMessage(submission, result);
      setMessages(previous => mergeMessages(previous, [acknowledged]));
      // Receipt confirmation is independent of the WebSocket and cache latency.
      refreshMessages.current();
      lastSubmission.current = { requestId: payload.requestId, sessionId: payload.sessionId };
      setReceipt("Sent");
      await draftWrites.current;
      if (!current()) return false;
      await cache.setDraft(host.serverId, id, "");
      await writeCache(host.serverId, `pending:${id}`, null);
      if (!current()) return false;
      setPending(null);
      setDraftState("");
      return true;
    } catch (err) {
      if (current()) {
        if (definitelyRejected(err)) setRejected(true);
        setError(errorText(err));
      }
      return false;
    } finally {
      if (scope.current === sendScope) {
        sending.current = false;
        if (alive.current) setBusy(false);
      }
    }
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
    if (!previousDevice || !pending) return;
    const items = [...archived, pending];
    await writeCache(host.serverId, `archive:${id}`, items);
    await draftWrites.current;
    await cache.setDraft(host.serverId, id, "");
    await writeCache(host.serverId, `pending:${id}`, null);
    setArchived(items);
    setPending(null);
    setDraftState("");
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
    await writeCache(host.serverId, `pending:${id}`, null);
    setPending(null);
    setRejected(false);
    setError("");
  }
  return {
    previousDevice,
    archived,
    archivePrevious,
    queue,
    removeQueued,
    rejected,
    recompose,
    messages,
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
