import React, { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import type { MobileClient } from "@ds-bot/mobile-sdk";
import { useI18n } from "../i18n";
import { errorText } from "../types";
import { Button, Field, Icon, Label, Notice, Section, SettingRow, Sheet } from "./UI";

interface FolderInfo { team: string | null; picker: "browse" | null; folders: { path: string; title: string }[] }
interface FolderListing { path: string; crumbs: { path: string; name: string }[]; entries: { path: string; name: string }[]; truncated?: boolean }

export function WorkingFolderPicker({ client, value, group = false, disabled, choose }: {
  client: MobileClient; value?: string; group?: boolean; disabled: boolean; choose: (path: string) => Promise<boolean>;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [draft, setDraft] = useState(value || ""), [info, setInfo] = useState<FolderInfo>();
  const [listing, setListing] = useState<FolderListing>();
  const request = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const saving = useRef(false);
  const crumbs = useRef<ScrollView>(null);
  useEffect(() => () => { generation.current++; request.current?.abort(); }, []);
  const fallback = tr(group ? "Each Bot's own folder" : "Team workspace");
  async function load(path?: string) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const epoch = ++generation.current;
    setBusy(true); setError("");
    try {
      if (path === undefined) {
        const next = await client.action<FolderInfo>("folders", {}, { signal: controller.signal });
        if (generation.current === epoch) setInfo(next);
      } else {
        const next = await client.action<FolderListing>("folder-list", { path }, { signal: controller.signal });
        if (generation.current === epoch) setListing(next);
      }
    } catch (failure) {
      if (generation.current === epoch) setError(failure && typeof failure === 'object' && 'code' in failure && failure.code === 'mobile/unsupported-action'
        ? tr("Update your host plugin to choose working folders.") : errorText(failure));
    }
    finally { if (generation.current === epoch) setBusy(false); }
  }
  function close() { generation.current++; request.current?.abort(); setOpen(false); setBusy(false); }
  async function save(path: string) {
    if (!info || busy || disabled || saving.current) return;
    saving.current = true;
    const epoch = ++generation.current;
    setBusy(true); setError("");
    try {
      if (await choose(path)) { if (generation.current === epoch) close(); }
      else if (generation.current === epoch) setError(tr("The folder could not be saved. Check the host settings and try again."));
    } catch (failure) { if (generation.current === epoch) setError(errorText(failure)); }
    finally { saving.current = false; if (generation.current === epoch) setBusy(false); }
  }
  return <>
    <Section title={tr("Working folder")} footer={tr(group ? "Applies to every Bot in this group. Their group conversations move at the next turn." : "Changes continue this Bot's chat in a new part, keeping its history.")}>
      <SettingRow title={value || fallback} hint={tr("Choose a host project or enter a folder path.")} disabled={disabled} last onPress={() => {
        setDraft(value || ""); setListing(undefined); setInfo(undefined); setOpen(true); void load();
      }} />
    </Section>
    <Sheet visible={open} title={tr("Working folder")} onClose={close}>
      <View style={{ gap: 12 }}>
        <Notice error text={error} />
        {busy && <Label muted>{tr("Loading…")}</Label>}
        <Button secondary title={fallback} disabled={!info || busy || disabled} onPress={() => void save("")} />
        {!group && info?.team && <Label muted>{info.team}</Label>}
        {!listing && info?.folders.map(folder => <SettingRow key={folder.path} compact last title={folder.title} hint={folder.path} leading={<Icon name="folder" size={20} />} disabled={busy || disabled} onPress={() => void save(folder.path)} />)}
        {!listing && <>
        <Field label={tr("Host folder path")} placeholder={tr("Enter the full path on your computer")} value={draft} onChangeText={setDraft} autoCapitalize="none" autoCorrect={false} maxLength={4096} editable={!!info && !busy && !disabled} />
        <Button title={tr("Use this folder")} disabled={!info || !draft.trim() || busy || disabled} onPress={() => void save(draft.trim())} />
        {info?.picker === "browse" && <Button secondary title={tr("Browse folders…")} disabled={busy || disabled} onPress={() => void load(draft.trim())} />}
        </>}
        {listing && <View style={{ gap: 8 }}>
          <ScrollView ref={crumbs} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" onContentSizeChange={() => crumbs.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ gap: 6, alignItems: "center" }}>
            {listing.crumbs.map((crumb, index) => <View key={crumb.path} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {index > 0 && <Icon name="chevron" size={14} />}
              <Button secondary compact title={crumb.name} disabled={busy || disabled} onPress={() => void load(crumb.path)} />
            </View>)}
          </ScrollView>
          <Label muted>{listing.path}</Label>
          <Button title={tr("Use this folder")} disabled={busy || disabled} onPress={() => void save(listing.path)} />
          {listing.entries.map(folder => <SettingRow key={folder.path} compact last title={folder.name} leading={<Icon name="folder" size={20} />} disabled={busy || disabled} onPress={() => void load(folder.path)} />)}
          {listing.truncated && <Label muted>{tr("Only part of this folder list is shown.")}</Label>}
          <Button secondary title={tr("Enter folder path")} disabled={busy || disabled} onPress={() => { setDraft(listing.path); setListing(undefined); }} />
        </View>}
        {!info && !busy && <Button secondary title={tr("Retry")} onPress={() => void load()} />}
      </View>
    </Sheet>
  </>;
}
