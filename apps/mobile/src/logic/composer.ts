import type { Bot, Room } from "../types";

export interface ChatReference { sessionId: string; label: string; mention: string }
export function sessionMention(sessionId: string, label: string) {
  const binary = encodeURIComponent(JSON.stringify(sessionId)).replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  const payload = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `@[${label.replace(/[\r\n]/g, " ").replace(/[\\\]]/g, mark => `\\${mark}`)}](dsh-session:${payload})`;
}
export function referenceDraft(draft: string): { text: string; references: ChatReference[] } {
  const references: ChatReference[] = [];
  let text = draft;
  while (references.length < 3) {
    const match = /^(@\[((?:\\.|[^\\\]])*)\]\(dsh-session:([A-Za-z0-9_-]+)\))(?:\n|$)/.exec(text);
    if (!match) break;
    try {
      const binary = atob(match[3].replace(/-/g, "+").replace(/_/g, "/"));
      const json = decodeURIComponent(Array.from(binary, char => "%" + char.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
      const sessionId: unknown = JSON.parse(json);
      if (typeof sessionId !== "string" || !sessionId) break;
      references.push({ sessionId, label: match[2].replace(/\\([\\\]])/g, "$1"), mention: match[1] });
      text = text.slice(match[0].length);
    } catch { break; }
  }
  if (references.length && text.startsWith("\n")) text = text.slice(1);
  return { text, references };
}
export function composeReferenceDraft(text: string, references: ChatReference[]) {
  return references.length ? references.map(ref => ref.mention).join("\n") + "\n\n" + text : text;
}
export function mentionQuery(text: string, selection: { start: number; end: number }) {
  if (selection.start !== selection.end || selection.start > text.length) return null;
  const before = text.slice(0, selection.start), at = before.lastIndexOf("@");
  if (at < 0 || (at > 0 && /[a-z0-9_./]/i.test(before[at - 1]))) return null;
  if ((before.match(/```/g)?.length ?? 0) % 2 || (before.split("\n").at(-1)?.match(/`/g)?.length ?? 0) % 2) return null;
  const query = before.slice(at + 1);
  if (query.length > 100 || /[\r\n`[\]()<>/\\]/.test(query)) return null;
  return { start: at, end: selection.start, query };
}
export function mentionCandidates(bots: Bot[], botId: string | undefined, room: Room | undefined, query: string, everyone: string) {
  const available = room ? room.members.map(id => bots.find(bot => bot.id === id)).filter((bot): bot is Bot => !!bot) : bots.filter(bot => bot.id !== botId);
  const needle = query.trim().toLowerCase();
  if (query.endsWith(" ") && [...available.map(bot => bot.name), everyone].some(name => name.toLowerCase() === needle)) return [];
  const rows: { name: string; bot?: Bot }[] = available.filter(bot => bot.name.toLowerCase().includes(needle)).map(bot => ({ name: bot.name, bot }));
  if (room && available.length > 1 && [everyone, "all", "everyone", "所有人", "全体"].some(name => name.toLowerCase().startsWith(needle))) rows.push({ name: everyone, bot: undefined });
  return rows;
}
