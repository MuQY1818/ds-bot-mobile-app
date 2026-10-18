import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import * as Crypto from "expo-crypto";
import { tr } from "./locale";
import { Button, Card, Field, Label, Notice, Sheet } from "../components/UI";
import { PanelProps, usePanelAction } from "./shared";

export interface PackageOperation {
  requestId: string; kind: string; status: string; error?: string; progress?: {phase:string;attempt?:{index:number;total:number}};
  result?: { application: string; error?: { code: string; diagnostic?: string }; packageResult?: { output?: string; kind?: string }; pendingBuilds?: string[]; version?: string };
}
export function PackagePanel({ inventory, reload, ...props }: PanelProps & {
  inventory: { writable: boolean; bundles: { name: string; removable?: boolean; readOnlyReason?: string }[]; operations?: PackageOperation[] } | null;
  reload: () => Promise<void>;
}) {
  const action = usePanelAction(props);
  const [spec, setSpec] = useState("");
  const [inspection, setInspection] = useState<{ status: string; resolvedSpec?: string; name?: string; version?: string; description?: string; reason?: string } | null>(null);
  const [operation, setOperation] = useState<PackageOperation | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "install" | "remove"; id?: string; builds?: string[] } | null>(null);
  const [approved, setApproved] = useState<string[]>([]);
  const pending = useRef(false);
  const blocked = !props.online || !!props.team.readOnly || !inventory?.writable || action.busy || operation?.status === "running";
  useEffect(() => {
    const running = inventory?.operations?.find(item => item.status === "running");
    if (running) setOperation(running);
  }, [inventory]);
  useEffect(() => {
    if (!props.online || operation?.status !== "running") return;
    let active = true;
    const timer = setInterval(() => {
      if (pending.current) return;
      pending.current = true;
      void props.client.action<PackageOperation>("plugins-operation", { requestId: operation.requestId }).then(async value => {
        if (!active) return;
        setOperation(value);
        if (value.status !== "running") await reload();
      }).catch(() => { if (active) action.setNotice(tr("Connection interrupted. Refresh plugins to check the original operation; do not reinstall automatically.")); }).finally(() => { pending.current = false; });
    }, 1500);
    return () => { active = false; clearInterval(timer); };
  }, [props.client, props.online, operation?.requestId, operation?.status]);
  async function inspect() {
    const result = await action.run(() => props.client.action<NonNullable<typeof inspection>>("plugins-inspect", { spec: spec.trim() }));
    if (result.ok) { setInspection(result.value); if (result.value.resolvedSpec) setSpec(result.value.resolvedSpec); }
  }
  async function begin() {
    if (!confirm) return;
    const accepted = confirm;
    setConfirm(null);
    const requestId = Crypto.randomUUID();
    const result = await action.run(() => props.client.action<PackageOperation>(accepted.kind === "install" ? "plugins-install" : "plugins-remove", {
      requestId, ...(accepted.kind === "install" ? { spec: spec.trim(), ...(accepted.builds ? { approvedBuilds: accepted.builds } : {}) } : { id: accepted.id }),
    }));
    if (result.ok) { setOperation(result.value); setApproved([]); }
    else {
      // Probe this exact identity; never issue another install on a lost response.
      const found = await action.run(() => props.client.action<PackageOperation>("plugins-operation", { requestId }));
      if (found.ok) setOperation(found.value);
    }
  }
  return <Card>
    <Label large>{tr("Install or remove packages")}</Label>
    <Notice error text={action.error} /><Notice text={action.notice} />
    <Label muted>{tr("Installed plugin code runs on your host. Inspect a trusted package before confirming installation. Changes affect every session in this profile.")}</Label>
    <Field label={tr("Package specification")} value={spec} autoCapitalize="none" autoCorrect={false} editable={!blocked} onChangeText={value => { setSpec(value); setInspection(null); setApproved([]); setOperation(null); }} placeholder="@scope/bundle@version" />
    <Button title={tr("Inspect package")} secondary disabled={blocked || !spec.trim()} onPress={() => void inspect()} />
    {inspection ? <><Label>{[inspection.name, inspection.version].filter(Boolean).join(" · ") || inspection.status}</Label><Label muted>{inspection.description || inspection.reason}</Label>
      {inspection.status === "accepted" ? <Button title={tr("Install package")} disabled={blocked} onPress={() => setConfirm({ kind: "install" })} /> : null}</> : null}
    {operation ? <View style={{ gap: 8 }}>
      <Label>{tr("Package operation")}: {tr(operation.status)}</Label>
      {operation.progress && operation.status === "running" ? <Label muted>{tr(operation.progress.phase)}{operation.progress.attempt ? ` · ${operation.progress.attempt.index}/${operation.progress.attempt.total}` : ""}</Label> : null}
      {operation.result ? <Label>{tr(operation.result.application)}{operation.result.version ? " · " + operation.result.version : ""}</Label> : null}
      <Notice error text={operation.error || operation.result?.error?.diagnostic || operation.result?.error?.code} />
      {operation.result?.packageResult?.output ? <Label muted>{operation.result.packageResult.output}</Label> : null}
      {operation.status === "running" && operation.kind === "install" ? <Button title={tr("Cancel installation")} secondary disabled={!props.online || action.busy} onPress={() => action.run(async () => {
        const value = await props.client.action<{ status: string }>("plugins-cancel", { requestId: operation.requestId });
        action.setNotice(tr(value.status));
      })} /> : null}
      {inspection?.status === "accepted" && operation.result?.pendingBuilds?.length ? <>
        <Label>{tr("Build scripts awaiting approval")}</Label>
        {operation.result.pendingBuilds.map(name => <Button key={name} title={(approved.includes(name) ? "✓ " : "") + name} secondary disabled={blocked} onPress={() => setApproved(current => current.includes(name) ? current.filter(item => item !== name) : [...current, name])} />)}
        <Button title={tr("Approve selected scripts and retry")} disabled={blocked || !approved.length} onPress={() => setConfirm({ kind: "install", builds: approved })} />
      </> : null}
    </View> : null}
    {(inventory?.bundles || []).filter(item => item.removable && !item.readOnlyReason).map(item => <Button key={item.name} title={tr("Remove package") + " · " + item.name} secondary danger disabled={blocked} onPress={() => setConfirm({ kind: "remove", id: item.name })} />)}
    <Sheet title={tr("Confirm package change")} visible={!!confirm} onClose={() => setConfirm(null)}>
      <Label>{confirm?.kind === "install" ? spec : confirm?.id}</Label>
      <Label muted>{confirm?.kind === "install" ? tr("This installs and activates trusted code on your host. It may restart plugins and interrupt the connection.") : tr("This removes the package from the host profile. Its tools and services will become unavailable.")}</Label>
      {confirm?.builds?.length ? <Notice text={tr("Selected dependency scripts will run on the host:") + "\n" + confirm.builds.join("\n")} /> : null}
      <Button title={tr("Confirm")} disabled={!props.online || action.busy} onPress={() => void begin()} />
    </Sheet>
  </Card>;
}
