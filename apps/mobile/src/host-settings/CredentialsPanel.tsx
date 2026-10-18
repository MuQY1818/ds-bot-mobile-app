import { tr } from "./locale";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Card, Field, Label, Notice } from "../components/UI";
import { PanelProps, usePanelAction, useTransientSecret } from "./shared";
import { SettingsNamespace, credentialReferences } from "./schema";

interface Credential {
  configured: boolean;
  writable: boolean;
  source?: string;
}
function CredentialCard({
  name,
  info,
  reload,
  ...props
}: PanelProps & {
  name: string;
  info: Credential;
  reload: () => Promise<void>;
}) {
  const action = usePanelAction(props);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [value, setValue] = useTransientSecret();
  const blocked =
    !props.online || !!props.team.readOnly || !info.writable || action.busy;
  return (
    <Card>
      <Label>{name}</Label>
      <Label muted>
        {info.configured ? tr("Configured") : tr("Not configured")}
        {info.source ? ` · ${info.source}` : ""}
      </Label>
      {!info.writable && (
        <Notice
          text={tr(
            "This credential is supplied by a read-only source. Change it in the host environment that provides it.",
          )}
        />
      )}
      <Notice error text={action.error} />
      {!editing && (
        <Button
          title={
            info.configured ? tr("Replace credential") : tr("Set credential")
          }
          secondary
          disabled={blocked}
          onPress={() => setEditing(true)}
        />
      )}
      {editing && (
        <View style={{ gap: 10 }}>
          <Field
            label={tr("New credential value")}
            value={value}
            onChangeText={setValue}
            secureTextEntry
            autoCorrect={false}
            autoCapitalize="none"
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            editable={!blocked}
            maxLength={65536}
          />
          <Button
            title={action.busy ? tr("Saving…") : tr("Save credential")}
            disabled={blocked || !value}
            onPress={async () => {
              const submitted = value;
              setValue("");
              if (
                (
                  await action.run(async () => {
                    await props.client.action("credentials-set", {
                      ref: name,
                      value: submitted,
                    });
                    await reload();
                  }, submitted)
                ).ok
              )
                setEditing(false);
            }}
          />
          <Button
            title={tr("Cancel")}
            secondary
            disabled={action.busy}
            onPress={() => {
              setValue("");
              setEditing(false);
            }}
          />
        </View>
      )}
      {info.configured && (
        <Button
          title={tr("Remove credential")}
          secondary
          danger
          disabled={blocked}
          onPress={() => setConfirm(true)}
        />
      )}
      {confirm && (
        <>
          <Notice
            text={tr("Remove {p0}? Model providers using this reference may stop working.", { p0: String(name) })}
          />
          <Button
            title={tr("Confirm removal")}
            danger
            disabled={blocked}
            onPress={async () => {
              if (
                (
                  await action.run(async () => {
                    await props.client.action("credentials-unset", {
                      ref: name,
                    });
                    await reload();
                  })
                ).ok
              )
                setConfirm(false);
            }}
          />
          <Button
            title={tr("Cancel")}
            secondary
            disabled={action.busy}
            onPress={() => setConfirm(false)}
          />
        </>
      )}
    </Card>
  );
}

export function CredentialsPanel({
  namespaces,
  ...props
}: PanelProps & { namespaces: SettingsNamespace[] }) {
  const action = usePanelAction(props);
  const refs = credentialReferences(namespaces);
  const key = refs.join("|");
  const [metadata, setMetadata] = useState<Record<string, Credential>>({});
  async function load() {
    const next: Record<string, Credential> = {};
    for (let offset = 0; offset < refs.length; offset += 64)
      Object.assign(
        next,
        await props.client.action<Record<string, Credential>>(
          "credentials-describe",
          { refs: refs.slice(offset, offset + 64) },
        ),
      );
    setMetadata(next);
  }
  useEffect(() => {
    if (props.online && refs.length) void action.run(load);
  }, [props.client, props.online, key]);
  if (!refs.length)
    return (
      <Notice
        text={tr(
          "Model provider credentials appear here when a host provider profile names an API key reference. Configure the provider in Harness → Settings → Models, then refresh.",
        )}
      />
    );
  return (
    <View style={{ gap: 12 }}>
      <Label>{tr("Model provider credentials")}</Label>
      <Label muted>
        {tr(
          "These are the references already used by your host’s model providers. Values are written once and never returned to the phone.",
        )}
      </Label>
      <Notice error text={action.error} />
      <Button
        title={tr("Refresh credentials")}
        secondary
        disabled={!props.online || action.busy}
        onPress={() => action.run(load)}
      />
      {refs.map((name) =>
        metadata[name] ? (
          <CredentialCard
            key={name}
            name={name}
            info={metadata[name]}
            reload={load}
            {...props}
          />
        ) : (
          <Notice
            key={name}
            text={tr("{p0}: credential status is not available yet.", { p0: String(name) })}
          />
        ),
      )}
    </View>
  );
}
