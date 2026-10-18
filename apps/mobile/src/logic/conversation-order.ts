import type { Conversation, Message } from "@ds-bot/mobile-sdk";

export function conversationTimestamp(value: unknown): number {
  const time = typeof value === "number" ? value : typeof value === "string" && value.trim() ? (/^\d+(?:\.\d+)?$/.test(value) ? Number(value) : Date.parse(value)) : 0;
  return Number.isFinite(time) && time > 0 ? time : 0;
}

export function conversationTime(item: Conversation, preview?: Message) {
  return Math.max(conversationTimestamp(item.updatedAt), conversationTimestamp(preview?.createdAt), conversationTimestamp(item.createdAt));
}

export function orderConversations(items: Conversation[], previews: Record<string, Message>, pinned: (item: Conversation) => boolean) {
  return [...items].sort((a, b) => Number(pinned(b)) - Number(pinned(a)) || conversationTime(b, previews[b.id]) - conversationTime(a, previews[a.id]));
}
