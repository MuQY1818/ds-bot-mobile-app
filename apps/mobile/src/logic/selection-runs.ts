import type { MarkdownNode } from "./markdown";

export interface SelectionRun {
  text: string;
  color: string;
  fontSize: number;
  fontWeight?: string;
  italic?: boolean;
  strikethrough?: boolean;
  fontFamily?: string;
  backgroundColor?: string;
  url?: string;
}

export function selectionRuns(nodes: MarkdownNode[], base: Omit<SelectionRun, "text">, options: { linkColor: string; codeColor: string; mono: string; imageLabel: string }): SelectionRun[] {
  const result: SelectionRun[] = [];
  function visit(items: MarkdownNode[], inherited: Omit<SelectionRun, "text">) {
    for (const node of items) {
      const style = { ...inherited };
      if (node.type === "strong") style.fontWeight = "700";
      if (node.type === "em") style.italic = true;
      if (node.type === "s") style.strikethrough = true;
      if (node.type === "code_inline") Object.assign(style, { fontFamily: options.mono, backgroundColor: options.codeColor, fontSize: base.fontSize - 1 });
      if (node.type === "link" || node.type === "image") Object.assign(style, { color: options.linkColor, url: node.attrs[node.type === "link" ? "href" : "src"] });
      if (node.type === "softbreak" || node.type === "hardbreak") result.push({ ...style, text: "\n" });
      else if (node.children.length) visit(node.children, style);
      else if (node.text || node.type === "image") result.push({ ...style, text: node.text || options.imageLabel });
    }
  }
  visit(nodes, base);
  return result;
}
