import { tr } from "./locale";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Card, Field, Label, Notice } from "../components/UI";
import { PanelProps, usePanelAction } from "./shared";
import { PackagePanel, PackageOperation } from "./PackagePanel";
import { language } from "../i18n";
import { localizedText } from "../logic/localization";

type Localized = string | Record<string, string>;
interface Plugin {
  entryId: string;
  moduleName: string;
  enabled: boolean;
  fiberPhase: "pending" | "loading" | "active" | "failed" | "unloading" | null;
  readOnlyReason?: string;
  meta?: { title?: Localized; description?: Localized; error?: string };
}
interface Bundle {
  name: string;
  version?: string;
  description?: string;
  enabled: boolean;
  installed: boolean;
  optional: boolean;
  removable?: boolean;
  readOnlyReason?: string;
  error?: { code: string; diagnostic?: string };
}
interface Inventory {
  plugins: Plugin[];
  bundles: Bundle[];
  writable: boolean;
  operations?: PackageOperation[];
}
interface Change {
  changed: boolean;
  application:
    | "applied"
    | "restart-required"
    | "overridden"
    | "failed"
    | "cancelled";
  error?: { code: string; diagnostic?: string };
  warnings?: string[];
}
const localized = (value?: Localized) => localizedText(value, language());
const phases = { pending: "Pending", loading: "Loading", active: "Running", failed: "Failed", unloading: "Stopping" };
function readonlyText(reason: string) {
  if (reason === "mobile-required")
    return tr(
      "This plugin keeps the mobile connection available. Manage it on the host.",
    );
  if (reason === "management-required")
    return tr("Harness requires this plugin for management.");
  return tr(
    "This entry cannot be changed through the active profile. Manage it in Harness on the host.",
  );
}

export function PluginsPanel(props: PanelProps) {
  const action = usePanelAction(props);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"plugins" | "bundles">("bundles");
  const [confirmation, setConfirmation] = useState<{
    kind: "plugins" | "bundles";
    id: string;
    name: string;
    enabled: boolean;
  } | null>(null);
  async function load() {
    setInventory(await props.client.action<Inventory>("plugins-list", {}));
  }
  useEffect(() => {
    if (props.online) void action.run(load);
  }, [props.client, props.online]);
  useEffect(() => {
    if (
      !props.online ||
      !inventory?.plugins.some((plugin) =>
        ["pending", "loading", "unloading"].includes(plugin.fiberPhase || ""),
      )
    )
      return;
    const timer = setTimeout(() => {
      void action.run(load);
    }, 3000);
    return () => clearTimeout(timer);
  }, [props.client, props.online, inventory]);
  const blocked =
    !props.online ||
    action.busy ||
    !inventory?.writable ||
    !!props.team.readOnly;
  async function change() {
    if (!confirmation) return;
    const accepted = confirmation;
    const result = await action.run(async () => {
      const changed = await props.client.action<Change>(
        accepted.kind === "plugins"
          ? "plugins-set-enabled"
          : "bundle-set-enabled",
        { id: accepted.id, enabled: accepted.enabled },
      );
      await load();
      return changed;
    });
    if (!result.ok) return;
    setConfirmation(null);
    const message =
      result.value.application === "applied"
        ? tr("Saved and applied on the host.")
        : result.value.application === "restart-required"
          ? tr("Saved. Restart Harness on the host to apply this change.")
          : result.value.application === "overridden"
            ? tr(
                "Saved, but a higher-priority profile setting overrides this change.",
              )
            : result.value.application === "cancelled"
              ? tr("The change was cancelled.")
              : `The host could not apply this change: ${result.value.error?.diagnostic || result.value.error?.code || tr("unknown failure")}`;
    action.setNotice([message, ...(result.value.warnings || [])].join("\n"));
  }
  const wanted = query.trim().toLowerCase();
  const plugins = (inventory?.plugins || []).filter((plugin) =>
    `${plugin.moduleName} ${localized(plugin.meta?.title)} ${plugin.entryId}`
      .toLowerCase()
      .includes(wanted),
  );
  const bundles = (inventory?.bundles || []).filter((bundle) =>
    `${bundle.name} ${bundle.description || ""}`.toLowerCase().includes(wanted),
  );
  return (
    <View style={{ gap: 16 }}>
      <Label>{tr("Plugins")}</Label>
      <PackagePanel {...props} inventory={inventory} reload={load} />
      <Label muted>
        {tr(
          "Installed plugins and bundles in the running Harness profile. Disabling a plugin may stop its active tools or services.",
        )}
      </Label>
      <Notice error text={action.error} />
      <Notice text={action.notice} />
      <Notice
        text={
          props.team.readOnly ||
          (!props.online
            ? tr("Reconnect to manage plugins.")
            : inventory?.writable === false
              ? tr("The host plugin profile is read-only.")
              : "")
        }
      />
      <Button
        title={action.busy ? tr("Loading…") : tr("Refresh plugins")}
        secondary
        disabled={!props.online || action.busy}
        onPress={() => action.run(load)}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            title={tr("Bundles")}
            secondary={kind !== "bundles"}
            onPress={() => setKind("bundles")}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title={tr("Plugin entries")}
            secondary={kind !== "plugins"}
            onPress={() => setKind("plugins")}
          />
        </View>
      </View>
      <Field
        label={tr("Search plugins")}
        value={query}
        onChangeText={setQuery}
      />
      {confirmation && (
        <Card>
          <Label>
            {confirmation.enabled ? tr("Enable") : tr("Disable")}{" "}
            {confirmation.name}?
          </Label>
          <Label muted>
            {tr(
              "This changes the host profile used by all connected devices. Harness may need to restart.",
            )}
          </Label>
          <Button
            title={
              confirmation.enabled
                ? tr("Confirm enable")
                : tr("Confirm disable")
            }
            danger={!confirmation.enabled}
            disabled={blocked}
            onPress={change}
          />
          <Button
            title={tr("Cancel")}
            secondary
            disabled={action.busy}
            onPress={() => setConfirmation(null)}
          />
        </Card>
      )}
      {kind === "plugins"
        ? plugins.map((plugin) => (
            <Card key={plugin.entryId}>
              <Label>
                {localized(plugin.meta?.title) || plugin.moduleName}
              </Label>
              <Label muted>
                {plugin.moduleName} · {plugin.entryId}
              </Label>
              {localized(plugin.meta?.description) && (
                <Label muted>{tr(localized(plugin.meta?.description))}</Label>
              )}
              <Label muted>
                {plugin.enabled ? tr("Enabled") : tr("Disabled")} ·{" "}
                {tr(plugin.fiberPhase ? phases[plugin.fiberPhase] : "Not running")}
              </Label>
              <Notice error text={plugin.meta?.error} />
              {plugin.readOnlyReason ? (
                <Notice text={readonlyText(plugin.readOnlyReason)} />
              ) : (
                <Button
                  title={plugin.enabled ? tr("Disable") : tr("Enable")}
                  secondary
                  disabled={blocked}
                  onPress={() =>
                    setConfirmation({
                      kind: "plugins",
                      id: plugin.entryId,
                      name: localized(plugin.meta?.title) || plugin.moduleName,
                      enabled: !plugin.enabled,
                    })
                  }
                />
              )}
            </Card>
          ))
        : bundles.map((bundle) => (
            <Card key={bundle.name}>
              <Label>
                {bundle.name}
                {bundle.version ? ` · ${bundle.version}` : ""}
              </Label>
              {bundle.description && <Label muted>{tr(bundle.description)}</Label>}
              <Label muted>
                {bundle.enabled ? tr("Enabled") : tr("Disabled")} ·{" "}
                {bundle.installed
                  ? tr("Installed in this profile")
                  : tr("Provided by Harness")}
              </Label>
              <Notice
                error
                text={
                  bundle.error
                    ? bundle.error.diagnostic || bundle.error.code
                    : ""
                }
              />
              {bundle.readOnlyReason ? (
                <Notice text={readonlyText(bundle.readOnlyReason)} />
              ) : (
                <Button
                  title={
                    bundle.enabled ? tr("Disable bundle") : tr("Enable bundle")
                  }
                  secondary
                  disabled={blocked}
                  onPress={() =>
                    setConfirmation({
                      kind: "bundles",
                      id: bundle.name,
                      name: bundle.name,
                      enabled: !bundle.enabled,
                    })
                  }
                />
              )}
            </Card>
          ))}
      {inventory && !(kind === "plugins" ? plugins : bundles).length && (
        <Notice text={tr("No matching plugins.")} />
      )}
      <Label muted>
        {tr(
          "Package changes use the host plugin manager. Protected Harness and DS Bot packages remain managed on the host.",
        )}
      </Label>
    </View>
  );
}
