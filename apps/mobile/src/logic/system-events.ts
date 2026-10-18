import type { Message } from "@ds-bot/mobile-sdk";

const groupEvents = {
  working: "{name} started on it",
  approval: "{name} paused for your approval",
  resumed: "{name} was cut off by a restart and picked its work back up",
  cut: "{name} was cut off by a restart again and stopped",
  stopped: "You stopped {name}'s work",
};

export function systemEventLabel(event: Message["systemEvent"], translate: (key: string, params?: Record<string, string | number>) => string) {
  if (!event) return undefined;
  if (event.kind === "retry") return translate("Asked to make the tool call it wrote as text");
  if (event.kind === "resumed" && !event.name) return translate("Picked up its work after a restart");
  if (!Object.hasOwn(groupEvents, event.kind) || typeof event.name !== "string") return undefined;
  return translate(groupEvents[event.kind as keyof typeof groupEvents], { name: event.name });
}
