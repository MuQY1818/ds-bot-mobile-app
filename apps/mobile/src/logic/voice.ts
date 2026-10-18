import type { Message } from "@ds-bot/mobile-sdk";

export interface VoiceSubmission { requestId: string; sessionId: string }
export interface VoiceActivity { heard: boolean; lastSound: number }

export function voiceActivity(previous: VoiceActivity, duration: number, decibels?: number) {
  if (decibels !== undefined && Number.isFinite(decibels) && decibels > -40 && duration > 250) return { heard: true, lastSound: duration };
  return previous;
}
export function endVoiceTurn(activity: VoiceActivity, duration: number) {
  return duration >= 60000 || (activity.heard && duration >= 1000 && duration - activity.lastSound >= 1200);
}

export function voiceReply(messages: Message[], submission: VoiceSubmission): string | null {
  const sent = messages.find(message => message.requestId === submission.requestId && message.sessionId === submission.sessionId && message.role === "user");
  if (!sent) return null;
  const next = messages.filter(message => message.sessionId === sent.sessionId && message.role === "user" && message.seq > sent.seq).reduce((cut, message) => Math.min(cut, message.seq), Infinity);
  const replies = messages.filter(message => message.sessionId === sent.sessionId && message.seq > sent.seq && message.seq < next && message.role === "assistant" && !message.pending && !message.interrupted && message.text.trim());
  return replies.length ? replies.map(message => message.text).join("\n\n") : null;
}

export function speechText(value: string) {
  return value.replace(/```[\s\S]*?```/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`#*_~>|]/g, "").trim();
}
