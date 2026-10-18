import { tr } from "./locale";
import React, { useState } from "react";
import { Linking, View } from "react-native";
import { Button, Card, Field, Label, Notice } from "../components/UI";
import { PanelProps, usePanelAction, useTransientSecret } from "./shared";

interface Connector {
  id: string;
  name: string;
  state: string;
  account?: string | null;
  error?: string;
}

function ConnectorCard({
  connector,
  ...props
}: PanelProps & { connector: Connector }) {
  const { online, team } = props;
  const action = usePanelAction(props);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [token, setToken] = useTransientSecret();
  const blocked = !online || !!team.readOnly || action.busy;
  const connected = connector.state !== "off";
  async function connect() {
    const submitted = token.trim();
    if (!submitted) return;
    setToken("");
    const result = await action.action(
      "connector-connect",
      { id: connector.id, token: submitted },
      submitted,
    );
    if (result.ok) setEditing(false);
  }
  return (
    <Card>
      <Label>{connector.name}</Label>
      <Label muted>
        {connector.state === "ready"
          ? connector.account
            ? tr("Connected as {p0}", { p0: String(connector.account) })
            : tr("Connected")
          : connector.state === "connecting"
            ? tr("Connecting…")
            : connector.state === "error"
              ? tr("Could not connect")
              : tr("Repositories, issues, and pull requests")}
      </Label>
      {connector.state === "error" && (
        <Notice
          error
          text={connector.error || tr("The host could not connect. Try again.")}
        />
      )}
      <Notice error text={action.error} />
      {connector.state === "error" && (
        <Button
          title={tr("Try again")}
          disabled={blocked}
          onPress={() => action.action("connector-retry", { id: connector.id })}
        />
      )}
      {connected ? (
        <Button
          title={tr("Disconnect")}
          secondary
          danger
          disabled={blocked}
          onPress={() => setConfirm(true)}
        />
      ) : (
        !editing && (
          <Button
            title={tr("Connect")}
            disabled={blocked}
            onPress={() => setEditing(true)}
          />
        )
      )}
      {confirm && (
        <View style={{ gap: 10 }}>
          <Notice
            text={tr("Disconnect {p0}? Its saved connector token will be removed from your host.", { p0: String(connector.name) })}
          />
          <Button
            title={tr("Confirm disconnect")}
            danger
            disabled={blocked}
            onPress={async () => {
              if (
                (
                  await action.action("connector-disconnect", {
                    id: connector.id,
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
        </View>
      )}
      {editing && !connected && (
        <View style={{ gap: 12 }}>
          <Field
            label={tr("{p0} token", { p0: String(connector.name) })}
            value={token}
            onChangeText={setToken}
            secureTextEntry
            autoCorrect={false}
            autoCapitalize="none"
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            editable={!blocked}
            maxLength={16384}
          />
          <Label muted>
            {tr(
              "The token is sent once to your host over HTTPS. It is not saved in the phone’s chat cache or returned by the host.",
            )}
          </Label>
          {connector.id === "github" && (
            <Button
              title={tr("Create a token on GitHub")}
              secondary
              onPress={() =>
                action.run(() =>
                  Linking.openURL(
                    "https://github.com/settings/personal-access-tokens/new",
                  ),
                )
              }
            />
          )}
          <Button
            title={action.busy ? tr("Connecting…") : tr("Connect")}
            disabled={blocked || !token.trim()}
            onPress={connect}
          />
          <Button
            title={tr("Cancel")}
            secondary
            disabled={action.busy}
            onPress={() => {
              setToken("");
              setEditing(false);
            }}
          />
        </View>
      )}
    </Card>
  );
}

export function ConnectorsPanel(props: PanelProps) {
  const rows = (props.team.connectors || []).filter(
    (row) => typeof row.id === "string" && typeof row.state === "string",
  ) as unknown as Connector[];
  return (
    <View style={{ gap: 16 }}>
      <Label muted>
        {tr("Connect services that your Bots can use on the host.")}
      </Label>
      <Notice
        text={
          props.team.readOnly ||
          (!props.online ? tr("Reconnect to manage connectors.") : "")
        }
      />
      {!rows.length && (
        <Notice text={tr("No connectors are available on this host.")} />
      )}
      {rows.map((connector) => (
        <ConnectorCard key={connector.id} connector={connector} {...props} />
      ))}
    </View>
  );
}
