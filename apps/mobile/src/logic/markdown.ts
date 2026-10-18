import MarkdownIt from "markdown-it";
import { mentionSpans } from "@ds-bot/mobile-sdk";

const parser = new MarkdownIt({ html: false, linkify: true, breaks: true });

export interface MarkdownNode {
  type: string;
  tag: string;
  text: string;
  info: string;
  attrs: Record<string, string>;
  children: MarkdownNode[];
}

export interface MentionBot { id: string; name: string }

function linkMentions(nodes: MarkdownNode[], bots: MentionBot[], selfId?: string): MarkdownNode[] {
  const names = bots.filter(bot => bot.name).sort((a, b) => b.name.length - a.name.length);
  if (!names.length) return nodes;
  function visit(items: MarkdownNode[]): MarkdownNode[] {
    return items.flatMap(node => {
      if (["link", "code_inline", "fence", "code_block", "image"].includes(node.type)) return [node];
      if (node.children.length) return [{ ...node, children: visit(node.children) }];
      if (node.type !== "text" || !node.text.includes("@")) return [node];
      const parts: MarkdownNode[] = [];
      let offset = 0;
      for (const span of mentionSpans(node.text, names)) {
        const bot = span.bot;
        if (!bot || bot.id === selfId) continue;
        if (span.start > offset) parts.push({ ...node, text: node.text.slice(offset, span.start) });
        parts.push({ ...node, type: "link", text: "", attrs: { href: "https://bots.local/" + encodeURIComponent(bot.id) }, children: [{ ...node, text: bot.name }] });
        offset = span.end;
      }
      if (!offset) return [node];
      if (offset < node.text.length) parts.push({ ...node, text: node.text.slice(offset) });
      return parts;
    });
  }
  return visit(nodes);
}

export function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["https:", "http:", "mailto:"].includes(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function markdownNodes(text: string, bots: MentionBot[] = [], selfId?: string): MarkdownNode[] {
  const roots: MarkdownNode[] = [];
  const stack = [roots];
  for (const token of parser.parse(text, {})) {
    if (token.nesting === -1) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node: MarkdownNode = {
      type: token.type.replace(/_open$/, ""),
      tag: token.tag,
      text: token.content,
      info: token.info,
      attrs: Object.fromEntries(token.attrs || []),
      children: [],
    };
    if (token.children) {
      const inlineStack = [node.children];
      for (const child of token.children) {
        if (child.nesting === -1) {
          if (inlineStack.length > 1) inlineStack.pop();
          continue;
        }
        const item: MarkdownNode = {
          type: child.type.replace(/_open$/, ""),
          tag: child.tag,
          text: child.content,
          info: child.info,
          attrs: Object.fromEntries(child.attrs || []),
          children: [],
        };
        inlineStack[inlineStack.length - 1].push(item);
        if (child.nesting === 1) inlineStack.push(item.children);
      }
    }
    stack[stack.length - 1].push(node);
    if (token.nesting === 1) stack.push(node.children);
  }
  return linkMentions(roots, bots, selfId);
}
