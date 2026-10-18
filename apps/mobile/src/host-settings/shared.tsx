import { tr } from "./locale";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { MobileClient } from "@ds-bot/mobile-sdk";
import { Button, Label } from "../components/UI";
import { TeamState, errorText } from "../types";

export interface PanelProps {
  client: MobileClient;
  team: TeamState;
  online: boolean;
  refresh: () => Promise<void>;
}

export function usePanelAction({ client, refresh }: PanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function run<T>(operation: () => Promise<T>, sensitive = "") {
    if (pending.current) return { ok: false as const };
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await operation();
      return { ok: true as const, value };
    } catch (cause) {
      // A provider may quote a rejected, newly entered value before the host has
      // saved it in its redaction set. Do not show provider text for secret writes.
      const message = sensitive
        ? tr(
            "The host could not save this value. Check the key, HTTPS connection, and permissions, then try again.",
          )
        : errorText(cause);
      if (active.current) setError(message);
      return { ok: false as const };
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function action(
    endpoint: string,
    payload: Record<string, unknown> = {},
    sensitive = "",
  ) {
    return run(async () => {
      const value = await client.action(endpoint, payload);
      await refresh();
      return value;
    }, sensitive);
  }
  return { busy, error, notice, setNotice, run, action };
}

// Secret input lives only in the mounted editor and disappears when the app leaves
// the foreground. It never enters the normal chat draft or submission storage.
export function useTransientSecret() {
  const [value, setValue] = useState("");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") setValue("");
    });
    const hidden = () => {
      if (document.visibilityState !== "visible") setValue("");
    };
    if (Platform.OS === "web")
      document.addEventListener("visibilitychange", hidden);
    return () => {
      subscription.remove();
      if (Platform.OS === "web")
        document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  return [value, setValue] as const;
}

export function ScopePicker({
  value,
  change,
  team,
  disabled = false,
}: {
  value: "all" | string[];
  change: (value: "all" | string[]) => void;
  team: TeamState;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Label>{tr("Who may use it")}</Label>
      <Button
        title={value === "all" ? tr("✓ All Bots") : tr("All Bots")}
        secondary={value !== "all"}
        disabled={disabled}
        onPress={() => change("all")}
      />
      <Button
        title={
          Array.isArray(value) && value.length === 0
            ? tr("✓ No Bot")
            : tr("No Bot")
        }
        secondary
        disabled={disabled}
        onPress={() => change([])}
      />
      {team.bots.map((bot) => {
        const selected = Array.isArray(value) && value.includes(bot.id);
        return (
          <Button
            key={bot.id}
            title={`${selected ? "✓ " : ""}${bot.name}`}
            secondary={!selected}
            disabled={disabled}
            onPress={() =>
              change(
                selected
                  ? (value as string[]).filter((id) => id !== bot.id)
                  : [...(Array.isArray(value) ? value : []), bot.id],
              )
            }
          />
        );
      })}
    </View>
  );
}

export function scopeText(scope: "all" | string[], team: TeamState) {
  if (scope === "all") return tr("All Bots");
  return (
    scope
      .map((id) => team.bots.find((bot) => bot.id === id)?.name || id)
      .join(", ") || tr("No Bot")
  );
}
