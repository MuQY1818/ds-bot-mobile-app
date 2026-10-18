import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Conversation, MobileClient } from "@ds-bot/mobile-sdk";
import { Host, readCache, writeCache } from "../storage";
import { errorText, teamState, TeamState } from "../types";
const emptyTeam = (): TeamState => ({ bots: [], rooms: [], models: [] });
export function useWorkspace(client: MobileClient | null, host: Host | null) {
  const [team, setTeam] = useState<TeamState>(emptyTeam);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [transcription, setTranscription] = useState(false);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");
  const scope = useRef({ client, serverId: host?.serverId });
  scope.current = { client, serverId: host?.serverId };
  const refreshing = useRef<MobileClient | null>(null);
  const refresh = useCallback(async () => {
    if (!client || !host || refreshing.current === client) return;
    const current = () =>
      scope.current.client === client &&
      scope.current.serverId === host.serverId;
    refreshing.current = client;
    try {
      const [state, list, info] = await Promise.all([
        client.state(),
        client.conversations(),
        client.info(),
      ]);
      if (!current()) return;
      const parsed = teamState({ ...state, mobileCapabilities: info.capabilities && !Array.isArray(info.capabilities) ? info.capabilities : {} });
      setTranscription(
        !!(
          info.capabilities &&
          !Array.isArray(info.capabilities) &&
          info.capabilities.transcription
        ),
      );
      setTeam(parsed);
      setConversations(list.conversations);
      setOnline(true);
      setError("");
      await Promise.all([
        writeCache(host.serverId, "team", parsed),
        writeCache(host.serverId, "conversations", list.conversations),
      ]);
    } catch (err) {
      if (current()) {
        setOnline(false);
        setError(errorText(err));
      }
    } finally {
      if (refreshing.current === client) refreshing.current = null;
    }
  }, [client, host]);
  useEffect(() => {
    setTeam(emptyTeam());
    setConversations([]);
    setOnline(false);
    setTranscription(false);
    setError("");
    if (!client || !host) return;
    let alive = true;
    void Promise.all([
      readCache<TeamState>(host.serverId, "team"),
      readCache<Conversation[]>(host.serverId, "conversations"),
    ])
      .then(([state, list]) => {
        if (!alive) return;
        if (state) setTeam(state);
        if (list) setConversations(list);
      })
      .catch((err) => {
        if (alive)
          setError(`Local cache could not be loaded: ${errorText(err)}`);
      })
      .finally(() => {
        if (alive) void refresh();
      });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 8000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [client, host, refresh]);
  return { team, conversations, transcription, online, error, refresh };
}
