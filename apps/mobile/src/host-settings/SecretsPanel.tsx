import { dateLocale } from "../i18n";
import { tr } from "./locale";
import React, { useState } from "react";
import { View } from "react-native";
import { Button, Card, Field, Label, Notice } from "../components/UI";
import {
  PanelProps,
  ScopePicker,
  scopeText,
  usePanelAction,
  useTransientSecret,
} from "./shared";

interface SecretMetadata {
  name: string;
  purpose?: string;
  scope: "all" | string[];
  updatedAt?: number;
  lastUsedAt?: number;
}
interface SecretRequest {
  id: string;
  name: string;
  purpose?: string;
  kind: string;
  status: string;
}
interface SecretState {
  secrets?: SecretMetadata[];
  secretRequests?: Record<string, SecretRequest[]>;
}

function SecretValue({
  value,
  change,
  disabled,
}: {
  value: string;
  change: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Field
      label={tr("Secret value")}
      value={value}
      onChangeText={change}
      secureTextEntry
      autoCorrect={false}
      autoCapitalize="none"
      autoComplete="off"
      textContentType="none"
      importantForAutofill="no"
      editable={!disabled}
      maxLength={16384}
      placeholder={tr("Paste or type the key")}
    />
  );
}

function RequestCard({
  request,
  botId,
  ...props
}: PanelProps & { request: SecretRequest; botId: string }) {
  const botName =
    props.team.bots.find((bot) => bot.id === botId)?.name || "Bot";
  const action = usePanelAction(props);
  const [value, setValue] = useTransientSecret();
  const [scope, setScope] = useState<"all" | "bot">("all");
  const [replace, setReplace] = useState(false);
  const blocked = !props.online || !!props.team.readOnly || action.busy;
  const filling = request.kind === "fill" || replace;
  return (
    <Card>
      <Label>
        {request.kind === "allow"
          ? tr("Let {p0} use {p1}?", { p0: String(botName), p1: String(request.name) })
          : tr("{p0} needs a key", { p0: String(botName) })}
      </Label>
      <Label muted>
        {request.name}
        {request.purpose ? ` · ${request.purpose}` : ""}
      </Label>
      <Label muted>
        {botName}{" "}
        {tr(
          "never sees the value. The host makes it available to permitted shell commands.",
        )}
      </Label>
      <Notice error text={action.error} />
      {filling && (
        <>
          <SecretValue value={value} change={setValue} disabled={blocked} />
          {request.kind === "fill" && (
            <View style={{ gap: 8 }}>
              <Label>{tr("Who may use it")}</Label>
              <Button
                title={scope === "all" ? tr("✓ All Bots") : tr("All Bots")}
                secondary={scope !== "all"}
                disabled={blocked}
                onPress={() => setScope("all")}
              />
              <Button
                title={tr("{p0}Only {p1}", { p0: String(scope === "bot" ? "✓ " : ""), p1: String(botName) })}
                secondary={scope !== "bot"}
                disabled={blocked}
                onPress={() => setScope("bot")}
              />
            </View>
          )}
          <Button
            title={action.busy ? tr("Saving…") : tr("Save")}
            disabled={blocked || value.trim().length < 4}
            onPress={async () => {
              const submitted = value;
              setValue("");
              await action.action(
                "secret-set",
                { requestId: request.id, value: submitted, scope },
                submitted,
              );
            }}
          />
        </>
      )}
      {!filling && (
        <>
          <Button
            title={action.busy ? tr("Allowing…") : tr("Allow")}
            disabled={blocked}
            onPress={() =>
              action.action("secret-allow", { requestId: request.id })
            }
          />
          <Button
            title={tr("Replace value")}
            secondary
            disabled={blocked}
            onPress={() => setReplace(true)}
          />
        </>
      )}
      <Button
        title={tr("Cancel the request")}
        secondary
        disabled={blocked}
        onPress={async () => {
          setValue("");
          await action.action("secret-cancel", { requestId: request.id });
        }}
      />
    </Card>
  );
}

function SecretEditor({
  item,
  close,
  ...props
}: PanelProps & { item?: SecretMetadata; close: () => void }) {
  const action = usePanelAction(props);
  const [name, setName] = useState(item?.name || "");
  const [purpose, setPurpose] = useState(item?.purpose || "");
  const [scope, setScope] = useState<"all" | string[]>(item?.scope || "all");
  const [value, setValue] = useTransientSecret();
  const [replacing, setReplacing] = useState(!item);
  const blocked = !props.online || !!props.team.readOnly || action.busy;
  async function save() {
    const submitted = value;
    setValue("");
    const result = replacing
      ? await action.action(
          "secret-set",
          {
            name: name.trim(),
            purpose: purpose.trim(),
            scope,
            value: submitted,
          },
          submitted,
        )
      : await action.action("secret-update", { name: item!.name, scope });
    if (result.ok) close();
  }
  return (
    <Card>
      <Label>{item ? tr("Manage {p0}", { p0: String(item.name) }) : tr("Add a secret")}</Label>
      {!item && (
        <Field
          label={tr("Name")}
          value={name}
          onChangeText={(text) => setName(text.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!blocked}
          maxLength={64}
          placeholder={tr("GITHUB_TOKEN")}
        />
      )}
      {replacing && (
        <>
          <Field
            label={tr("Purpose")}
            value={purpose}
            onChangeText={setPurpose}
            maxLength={300}
            editable={!blocked}
          />
          <SecretValue value={value} change={setValue} disabled={blocked} />
          <Label muted>
            {tr(
              "At least 4 characters. The saved value is never read back. Leaving this page clears this input.",
            )}
          </Label>
        </>
      )}
      {item && !replacing && (
        <Button
          title={tr("Replace value")}
          secondary
          disabled={blocked}
          onPress={() => setReplacing(true)}
        />
      )}
      <ScopePicker
        value={scope}
        change={setScope}
        team={props.team}
        disabled={blocked}
      />
      <Notice error text={action.error} />
      <Button
        title={action.busy ? tr("Saving…") : tr("Save")}
        disabled={
          blocked ||
          !/^[A-Z][A-Z0-9_]*$/.test(name.trim()) ||
          (replacing && value.trim().length < 4)
        }
        onPress={save}
      />
      <Button
        title={tr("Cancel")}
        secondary
        disabled={action.busy}
        onPress={() => {
          setValue("");
          close();
        }}
      />
    </Card>
  );
}

function SecretRow({ item, ...props }: PanelProps & { item: SecretMetadata }) {
  const action = usePanelAction(props);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const blocked = !props.online || !!props.team.readOnly || action.busy;
  if (editing)
    return (
      <SecretEditor item={item} close={() => setEditing(false)} {...props} />
    );
  return (
    <Card>
      <Label>{item.name}</Label>
      {item.purpose && <Label muted>{item.purpose}</Label>}
      <Label muted>
        {tr("Saved for")}
        {scopeText(item.scope, props.team)}
      </Label>
      {item.lastUsedAt && (
        <Label muted>
          {tr("Last used:")}
          {new Date(item.lastUsedAt).toLocaleString(dateLocale())}
        </Label>
      )}
      <Notice error text={action.error} />
      <Button
        title={tr("Manage access")}
        secondary
        disabled={blocked}
        onPress={() => setEditing(true)}
      />
      <Button
        title={tr("Delete secret")}
        danger
        secondary
        disabled={blocked}
        onPress={() => setConfirm(true)}
      />
      {confirm && (
        <View style={{ gap: 10 }}>
          <Notice
            text={tr("Delete {p0} from the host? Bots and connectors that use this key will lose access.", { p0: String(item.name) })}
          />
          <Button
            title={tr("Confirm delete")}
            danger
            disabled={blocked}
            onPress={() => action.action("secret-delete", { name: item.name })}
          />
          <Button
            title={tr("Cancel")}
            secondary
            disabled={action.busy}
            onPress={() => setConfirm(false)}
          />
        </View>
      )}
    </Card>
  );
}

export function SecretsPanel(props: PanelProps) {
  const [adding, setAdding] = useState(false);
  const state = props.team as typeof props.team & SecretState;
  const secrets = state.secrets || [];
  const requests = Object.entries(state.secretRequests || {}).flatMap(
    ([botId, rows]) =>
      Array.isArray(rows)
        ? rows
            .filter((request) => request.status === "pending")
            .map((request) => ({ request, botId }))
        : [],
  );
  return (
    <View style={{ gap: 16 }}>
      <Label muted>
        {tr(
          "Keys stay on the host. Bots receive permission to use a key without seeing its value.",
        )}
      </Label>
      <Notice
        text={
          props.team.readOnly ||
          (!props.online
            ? tr(
                "Reconnect to manage secrets. No secret value is saved for later submission.",
              )
            : "")
        }
      />
      {requests.length > 0 && <Label>{tr("Waiting for you")}</Label>}
      {requests.map(({ request, botId }) => (
        <RequestCard
          key={`${request.id}:${request.kind}`}
          request={request}
          botId={botId}
          {...props}
        />
      ))}
      <Label>
        {tr("Saved keys ·")}
        {secrets.length}
      </Label>
      {!secrets.length && <Notice text={tr("No keys saved yet.")} />}
      {secrets.map((item) => (
        <SecretRow key={item.name} item={item} {...props} />
      ))}
      {adding ? (
        <SecretEditor close={() => setAdding(false)} {...props} />
      ) : (
        <Button
          title={tr("Add a secret")}
          disabled={!props.online || !!props.team.readOnly}
          onPress={() => setAdding(true)}
        />
      )}
    </View>
  );
}

export function SecretRequestCards({
  botId,
  ...props
}: PanelProps & { botId: string }) {
  const state = props.team as typeof props.team & SecretState;
  const requests = state.secretRequests?.[botId] || [];
  return (
    <View style={{ gap: 12 }}>
      {requests
        .filter((request) => request.status === "pending")
        .map((request) => (
          <RequestCard
            key={`${request.id}:${request.kind}`}
            request={request}
            botId={botId}
            {...props}
          />
        ))}
    </View>
  );
}
