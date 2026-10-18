import React, { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import type { Conversation, MobileClient } from "@ds-bot/mobile-sdk";
import { useI18n } from "../i18n";
import { errorText } from "../types";
import { collectHistory, conversationExport, checkCancelled } from "../logic/export";
import { saveDownload } from "../media/files";
import { Button, Label, Notice } from "./UI";

export function ConversationExport({ client, conversation, online }: { client: MobileClient; conversation: Conversation; online: boolean }) {
  const { tr } = useI18n();
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") controller.current?.abort(); });
    return () => { controller.current?.abort(); subscription.remove(); };
  }, []);
  async function download(format: "markdown" | "json") {
    if (controller.current || !online) return;
    const run = new AbortController();
    controller.current = run;
    setBusy(true); setError(""); setDone(false); setCount(0);
    try {
      const messages = await collectHistory(client, conversation.id, { signal: run.signal, onProgress: setCount });
      checkCancelled(run.signal);
      await saveDownload(conversation.name + (format === "json" ? ".json" : ".md"), conversationExport(conversation, messages, format), format === "json" ? "application/json" : "text/markdown");
      if (!run.signal.aborted) setDone(true);
    } catch (err) { if (!run.signal.aborted) setError(errorText(err)); }
    finally { if (controller.current === run) { controller.current = null; setBusy(false); } }
  }
  return <View style={{ gap: 14 }}>
    <Label muted>{tr("Export the available conversation history across all parts. Attachments are listed by name; their bytes are downloaded separately.")}</Label>
    <Notice error text={tr(error)} />
    {!online ? <Notice text={tr("Connect to your host to export the full conversation.")} /> : null}
    {busy ? <Label>{tr("Reading {count} messages…", { count })}</Label> : null}
    {done ? <Notice text={tr("Export ready.")} /> : null}
    <Button title={tr("Download Markdown")} disabled={!online || busy} onPress={() => void download("markdown")} />
    <Button title={tr("Download JSON")} secondary disabled={!online || busy} onPress={() => void download("json")} />
    {busy ? <Button title={tr("Cancel export")} secondary onPress={() => controller.current?.abort()} /> : null}
  </View>;
}
