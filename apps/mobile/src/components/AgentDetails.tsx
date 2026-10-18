import { useI18n } from "../i18n";
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { Conversation, MobileClient } from "@ds-bot/mobile-sdk";
import { errorText, TeamState } from "../types";
import {
  Button,
  Field,
  Label,
  Notice,
  PageHeader,
  Section,
  SettingRow,
  Sheet,
  ToggleRow,
  styles,
} from "./UI";
import { mobileActionAllowed, BRIDGE_UNAVAILABLE } from "../logic/mobile-access";
export function AgentDetails({
  client,
  team,
  conversations,
  conversation,
  online,
  refresh,
  openConversation,
  onBack,
}: {
  client: MobileClient;
  team: TeamState;
  conversations: Conversation[];
  conversation?: Conversation;
  online: boolean;
  refresh: () => Promise<void>;
  openConversation: (id: string) => void;
  onBack: () => void;
}) {
  const { tr } = useI18n();
  const agentId =
    typeof conversation?.agentId === "string" ? conversation.agentId : "";
  const agent = team.agents?.find((a) => a.id === agentId);
  const [title, setTitle] = useState(conversation?.name || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    text: string;
    run: () => Promise<void>;
  } | null>(null);
  const allows = (action: string) => mobileActionAllowed(team.mobileCapabilities, action);
  const locked = busy || !online || !!team.readOnly;
  async function action<T = unknown>(
    endpoint: string,
    payload: Record<string, unknown>,
  ) {
    if (!allows(endpoint)) { setError(BRIDGE_UNAVAILABLE); return; }
    setBusy(true);
    setError("");
    try {
      const value = await client.action<T>(endpoint, payload);
      await refresh();
      return value;
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ flex: 1 }}>
      <PageHeader floating title={tr("DSH Agent")} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.page, {paddingTop:92}]}
        keyboardShouldPersistTaps="handled"
      >
        <Notice error text={error} />
        {!allows("agent-rename") && <Notice text={BRIDGE_UNAVAILABLE}/>}
        {!online && (
          <Notice
            text={tr(
              "Your host is offline. Settings can be changed when it reconnects.",
            )}
          />
        )}
        {!agent || !conversation ? (
          <Notice
            text={tr("This Agent conversation is no longer available.")}
          />
        ) : (
          <>
            <Section title={tr("Conversation")}>
              <View style={{ padding: 12, gap: 12 }}>
                <Field
                  label={tr("Title")}
                  value={title}
                  onChangeText={setTitle}
                  editable={!locked && allows("agent-rename")}
                  maxLength={200}
                  onBlur={() => {
                    if (
                      !locked &&
                      title.trim() &&
                      title.trim() !== conversation.name
                    )
                      void action("agent-rename", {
                        agentId,
                        sessionId: conversation.sessionId,
                        title: title.trim(),
                      });
                  }}
                />
                <Button
                  title={tr("Open chat")}
                  onPress={() => openConversation(conversation.id)}
                />
              </View>
              <ToggleRow
                title={tr("Pin")}
                value={!!agent.pinned}
                disabled={locked || !allows("set-flags")}
                onChange={(pinned) => {
                  void action("set-flags", { id: agentId, pinned });
                }}
              />
              <ToggleRow
                title={tr("Hide")}
                value={!!agent.hidden}
                disabled={locked || !allows("set-flags")}
                last
                onChange={(hidden) => {
                  void action("set-flags", { id: agentId, hidden });
                }}
              />
            </Section>
            <Section title={tr("Conversations")}>
              {conversations
                .filter((item) => item.agentId === agentId)
                .map((item) => (
                  <SettingRow
                    key={item.id}
                    title={item.name || tr("Conversation")}
                    onPress={() => openConversation(item.id)}
                  />
                ))}
              <SettingRow
                title={tr("New conversation")}
                last
                disabled={locked || !allows("agent-session")}
                onPress={() => {
                  void action<{ sessionId: string }>("agent-session", {
                    agentId,
                    workspaceId: team.workspaceId,
                  }).then((result) => {
                    if (result?.sessionId)
                      openConversation(`agent:${agentId}:${result.sessionId}`);
                  });
                }}
              />
            </Section>
            <Section title={tr("Actions")}>
              <SettingRow
                title={tr("Archive conversation")}
                danger
                disabled={locked || !allows("agent-archive")}
                onPress={() =>
                  setConfirm({
                    text: tr("Archive conversation"),
                    run: async () => {
                      const result = await action("agent-archive", {
                        agentId,
                        sessionId: conversation.sessionId,
                      });
                      if (result !== undefined) {
                        setConfirm(null);
                        onBack();
                      }
                    },
                  })
                }
              />
              <SettingRow
                title={tr("Remove Agent")}
                hint={tr(
                  "All conversations owned by this Agent will be archived.",
                )}
                danger
                last
                disabled={locked || !allows("remove-agent")}
                onPress={() =>
                  setConfirm({
                    text: tr(
                      "All conversations owned by this Agent will be archived.",
                    ),
                    run: async () => {
                      const result = await action("remove-agent", { agentId });
                      if (result !== undefined) {
                        setConfirm(null);
                        onBack();
                      }
                    },
                  })
                }
              />
            </Section>
          </>
        )}
      </ScrollView>
      <Sheet
        title={tr("Confirm")}
        visible={!!confirm}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
      >
        <Label>{confirm?.text}</Label>
        <Notice error text={error} />
        {!allows("agent-rename") && <Notice text={BRIDGE_UNAVAILABLE}/>}
        <Button
          title={tr("Confirm")}
          danger
          disabled={locked}
          onPress={() => {
            void confirm?.run();
          }}
        />
      </Sheet>
    </View>
  );
}
