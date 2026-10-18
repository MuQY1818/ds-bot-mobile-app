import type { Attachment, Message, Submission } from "@ds-bot/mobile-sdk";

export interface OutgoingIntent {
  requestId: string;
  conversationId: string;
  text: string;
  attachments: Attachment[];
  createdAt: number;
  expectedSessionId?: string;
  sessionId?: string;
  deviceId?: string;
  delivery: "sending" | "unconfirmed" | "rejected";
}

export function outgoingMessage(intent: OutgoingIntent): Message {
  return {
    id: `accepted:${intent.requestId}`,
    sessionId: intent.sessionId || intent.expectedSessionId || "",
    requestId: intent.requestId,
    role: "user",
    text: intent.text,
    attachments: intent.attachments,
    createdAt: intent.createdAt,
    seq: Number.MAX_SAFE_INTEGER,
    localSubmission: true,
    delivery: intent.delivery,
  };
}

export function recoveredIntent(payload: Submission & { deviceId?: string }): OutgoingIntent {
  return { ...payload, attachments: payload.attachments || [], createdAt: Date.now(), delivery: "unconfirmed" };
}
