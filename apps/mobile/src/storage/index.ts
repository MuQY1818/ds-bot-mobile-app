import type { Cache, Message } from "@ds-bot/mobile-sdk";
import { readCache, writeCache, clearCache, clearCachedContent } from "./cache";
export { readCache, writeCache, clearCache, clearCachedContent } from "./cache";
export { tokenStore } from "./credentials";
export interface Host {
  url: string;
  serverId: string;
  name: string;
  allowInsecure?: boolean;
  tlsPin?: string;
}
export const cache: Cache = {
  async getMessages(server, conversation) {
    return (
      (await readCache<Message[]>(server, `messages:${conversation}`)) ?? []
    );
  },
  async setMessages(server, conversation, messages) {
    await writeCache(
      server,
      `messages:${conversation}`,
      messages.filter((m) => !m.pending).slice(-1000),
    );
  },
  async getDraft(server, conversation) {
    return (await readCache<string>(server, `draft:${conversation}`)) ?? "";
  },
  async setDraft(server, conversation, text) {
    await writeCache(server, `draft:${conversation}`, text);
  },
  async clear(server) {
    if (server) await clearCachedContent(server);
  },
};
