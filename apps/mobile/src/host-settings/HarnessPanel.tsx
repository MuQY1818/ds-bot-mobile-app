import { tr } from "./locale";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Card, Field, Label, Notice } from "../components/UI";
import { PanelProps, usePanelAction, useTransientSecret } from "./shared";
import {
  ConfigField,
  SettingsDescription,
  SettingsNamespace,
  configFields,
  fieldValue,
  pathValue,
} from "./schema";
import { CredentialsPanel } from "./CredentialsPanel";
import { PluginUpdateCard } from "./PluginUpdateCard";
import { PluginsPanel } from "./PluginsPanel";
import { SkillsPanel } from "./SkillsPanel";

function ConfigEditor({
  field,
  namespace,
  writable,
  reload,
  ...props
}: PanelProps & {
  field: ConfigField;
  namespace: SettingsNamespace;
  writable: boolean;
  reload: () => Promise<void>;
}) {
  const initial = field.secret ? "" : pathValue(namespace.value, field.path);
  const [draft, setDraft] = useState(
    field.kind === "enum"
      ? (JSON.stringify(initial) ?? "")
      : String(initial ?? ""),
  );
  const [secret, setSecret] = useTransientSecret();
  const [confirmReset, setConfirmReset] = useState(false);
  const action = usePanelAction(props);
  const blocked =
    !props.online ||
    !!props.team.readOnly ||
    !writable ||
    field.disabled === true ||
    action.busy;
  const overridden =
    pathValue(namespace.user, field.path) !== undefined ||
    (field.secret && field.configured);
  async function save(reset = false) {
    const submitted = field.secret ? secret : draft;
    if (field.secret) setSecret("");
    const result = await action.run(
      async () => {
        const op = reset
          ? { op: "unset", path: field.path }
          : {
              op: "set",
              path: field.path,
              value: fieldValue(field, submitted),
            };
        await props.client.action("settings-mutate", {
          ns: namespace.ns,
          expectedRevision: namespace.revision,
          ops: [op],
        });
        await reload();
      },
      field.secret ? submitted : "",
    );
    if (result.ok) {
      setConfirmReset(false);
      action.setNotice(tr("Saved on the host."));
    }
  }
  return (
    <Card>
      <Label>{field.label}</Label>
      {field.description && <Label muted>{field.description}</Label>}
      {field.disabled && (
        <Notice text={tr("This field is disabled by the host schema.")} />
      )}
      <Label muted>
        {field.secret
          ? field.configured
            ? tr("A value is configured. It is never sent to this device.")
            : tr("No value is configured.")
          : overridden
            ? tr("Set in this host profile")
            : tr("Inherited from host configuration")}
      </Label>
      {field.kind === "unsupported" ? (
        <Notice text={field.reason} />
      ) : (
        <>
          {field.kind === "boolean" ? (
            <View style={{ gap: 8 }}>
              <Button
                title={tr("{p0}On", { p0: String(draft === "true" ? "✓ " : "") })}
                secondary={draft !== "true"}
                disabled={blocked}
                onPress={() => setDraft("true")}
              />
              <Button
                title={tr("{p0}Off", { p0: String(draft !== "true" ? "✓ " : "") })}
                secondary={draft === "true"}
                disabled={blocked}
                onPress={() => setDraft("false")}
              />
            </View>
          ) : field.kind === "enum" ? (
            <View style={{ gap: 8 }}>
              {field.choices?.map((value) => (
                <Button
                  key={JSON.stringify(value)}
                  title={`${draft === JSON.stringify(value) ? "✓ " : ""}${String(value)}`}
                  secondary={draft !== JSON.stringify(value)}
                  disabled={blocked}
                  onPress={() => setDraft(JSON.stringify(value))}
                />
              ))}
            </View>
          ) : (
            <Field
              label={field.secret ? tr("New value") : tr("Value")}
              value={field.secret ? secret : draft}
              onChangeText={field.secret ? setSecret : setDraft}
              secureTextEntry={field.secret}
              autoComplete="off"
              autoCorrect={false}
              autoCapitalize="none"
              textContentType="none"
              importantForAutofill="no"
              editable={!blocked}
              keyboardType={
                field.kind === "number" ? "numbers-and-punctuation" : "default"
              }
              maxLength={field.secret ? 16384 : undefined}
            />
          )}
          <Notice error text={action.error} />
          <Notice text={action.notice} />
          <Button
            title={action.busy ? tr("Saving…") : tr("Save")}
            disabled={blocked || (field.secret && !secret)}
            onPress={() => save()}
          />
          <Button
            title={tr("Reset to inherited value")}
            secondary
            disabled={blocked || !overridden}
            onPress={() => setConfirmReset(true)}
          />
          {confirmReset && (
            <>
              <Notice
                text={tr("Remove this profile’s override for {p0}? The host will use its inherited value.", { p0: String(field.label) })}
              />
              <Button
                title={tr("Confirm reset")}
                danger
                disabled={blocked}
                onPress={() => save(true)}
              />
              <Button
                title={tr("Cancel")}
                secondary
                disabled={action.busy}
                onPress={() => setConfirmReset(false)}
              />
            </>
          )}
        </>
      )}
    </Card>
  );
}

export function HarnessPanel(props: PanelProps) {
  const action = usePanelAction(props);
  const [description, setDescription] = useState<SettingsDescription | null>(
    null,
  );
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"plugins" | "skills" | null>(null);
  async function load() {
    const next = await props.client.action<SettingsDescription>(
      "settings-describe",
      {},
    );
    setDescription(next);
  }
  useEffect(() => {
    if (props.online) void action.run(load);
  }, [props.client, props.online]);
  const namespace = description?.namespaces.find((row) => row.ns === selected);
  if (section)
    return (
      <View style={{ gap: 16 }}>
        <Button
          title={tr("All Harness settings")}
          secondary
          onPress={() => setSection(null)}
        />
        {section === "plugins" ? (
          <PluginsPanel {...props} />
        ) : (
          <SkillsPanel {...props} />
        )}
      </View>
    );
  return (
    <View style={{ gap: 16 }}>
      <Label muted>
        {tr(
          "Live settings from the running Harness profile. Changes apply on your host and may affect every device.",
        )}
      </Label>
      <Button
        title={tr("Manage plugins")}
        secondary
        onPress={() => setSection("plugins")}
      />
      <Button
        title={tr("Skills")}
        secondary
        onPress={() => setSection("skills")}
      />
      <Notice error text={action.error} />
      {!props.online && (
        <Notice text={tr("Reconnect to load or change Harness settings.")} />
      )}
      {description?.writable === false && (
        <Notice text={tr("This host profile is read-only.")} />
      )}
      <Button
        title={action.busy ? tr("Loading…") : tr("Refresh host settings")}
        secondary
        disabled={!props.online || action.busy}
        onPress={() => action.run(load)}
      />
      {!description && !action.busy && (
        <Notice
          text={tr(
            "If this host does not expose configuration forms, open Harness → Settings on the host. No local configuration file is modified by this page.",
          )}
        />
      )}
      {description && !namespace && (
        <>
          <Field
            label={tr("Search settings")}
            value={query}
            onChangeText={setQuery}
            placeholder={tr("Model, speech, shell…")}
          />
          {description.namespaces
            .filter((row) =>
              row.ns.toLowerCase().includes(query.trim().toLowerCase()),
            )
            .map((row) => (
              <Button
                key={row.ns}
                title={row.ns}
                secondary
                onPress={() => setSelected(row.ns)}
              />
            ))}
          {description.namespaces.length === 0 && (
            <Notice
              text={tr(
                "No configuration forms are exposed by the active profile.",
              )}
            />
          )}
          <CredentialsPanel namespaces={description.namespaces} {...props} />
          <PluginUpdateCard {...props} />
        </>
      )}
      {namespace && (
        <>
          <Button
            title={tr("All Harness settings")}
            secondary
            onPress={() => setSelected("")}
          />
          <Label>{namespace.ns}</Label>
          <Label muted>
            {tr("Revision")}
            {namespace.revision} {tr("· Changes apply live")}
          </Label>
          {!namespace.autoGenerate && (
            <Notice
              text={tr(
                "Harness provides a custom page for this plugin. Its simple fields are available below; custom controls still require the host’s settings page.",
              )}
            />
          )}
          {configFields(namespace).map((field) => (
            <ConfigEditor
              key={`${namespace.ns}:${namespace.revision}:${field.path.join("/")}`}
              field={field}
              namespace={namespace}
              writable={description?.writable === true}
              reload={load}
              {...props}
            />
          ))}
          {configFields(namespace).length === 0 && (
            <Notice
              text={tr(
                "This plugin has no fields supported by the mobile editor. Open its page in Harness → Settings on the host.",
              )}
            />
          )}
        </>
      )}
    </View>
  );
}
