import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownNodes, safeLink } from "../src/logic/markdown.ts";

test("markdown retains nested emphasis, lists, tables, and literal fenced code", () => {
  const nodes = markdownNodes("# Heading\n\n1. **strong _nested_**\n2. next\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\n<b>literal</b>\n```\n");
  assert.equal(nodes[0].type, "heading");
  assert.equal(nodes[1].type, "ordered_list");
  const inline = nodes[1].children[0].children[0].children[0];
  assert.equal(inline.children.find(node => node.type === "strong")?.children[1].type, "em");
  assert.equal(nodes[2].type, "table");
  assert.equal(nodes[3].text, "<b>literal</b>\n");
});

test("markdown does not turn raw HTML or script links into executable content", () => {
  const nodes = markdownNodes('<script>alert(1)</script>\n\n[x](javascript:alert(1))');
  assert.ok(!JSON.stringify(nodes).includes('"type":"html_block"'));
  assert.ok(!JSON.stringify(nodes).includes('"type":"link"'));
  for (const value of ["javascript:alert(1)", "data:text/html,test", "file:///etc/passwd", "https://user:password@example.org/", "/private"]) assert.equal(safeLink(value), null);
  assert.equal(safeLink("https://example.org/a?q=1"), "https://example.org/a?q=1");
});

test("mentions match complete team names without changing code, email, existing links, or the speaker", () => {
  const nodes = markdownNodes("@Mi @Mini @新 Bot 2 a@Mi @MiniMax `@Mi` [@Mi](https://example.org) **@Mi**\n\n```txt\n@Mi\n```", [
    { id: "mi", name: "Mi" }, { id: "mini", name: "Mini" }, { id: "short", name: "新 Bot" }, { id: "self", name: "新 Bot 2" },
  ], "self");
  const links: string[] = [];
  const walk = (items: typeof nodes) => { for (const node of items) { if (node.type === "link") links.push(node.attrs.href); walk(node.children); } };
  walk(nodes);
  assert.deepEqual(links, ["https://bots.local/mi", "https://bots.local/mini", "https://example.org", "https://bots.local/mi"]);
  assert.equal(nodes.at(-1)?.text, "@Mi\n");
});

test("file references and web addresses never turn into callable Bot mentions",()=>{
  const nodes=markdownNodes('@Docs/file.md @Docs\\file.md @Docs.txt https://example.org/@Docs [literal](/x "@Docs") @Docs.',[{id:"docs",name:"Docs"}]);
  const links:string[]=[];const walk=(items:typeof nodes)=>{for(const node of items){if(node.type==="link" && node.attrs.href.startsWith("https://bots.local/"))links.push(node.attrs.href);walk(node.children);}};
  walk(nodes);assert.deepEqual(links,["https://bots.local/docs"]);
});
