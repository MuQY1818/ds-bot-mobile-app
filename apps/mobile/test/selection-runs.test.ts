import assert from "node:assert/strict";
import test from "node:test";
import { markdownNodes } from "../src/logic/markdown.ts";
import { selectionRuns } from "../src/logic/selection-runs.ts";

const base = { color: "#222222", fontSize: 17 };
const options = { linkColor: "#123456", codeColor: "#eeeeee", mono: "Menlo", imageLabel: "Open image" };
test("native selection retains nested Markdown styling and the exact visible Unicode text", () => {
  const nodes = markdownNodes("Hello **bold _italic_** ~~gone~~ `x`\n中文👩🏽‍💻 café");
  const runs = selectionRuns(nodes, base, options);
  assert.equal(runs.map(run => run.text).join(""), "Hello bold italic gone x\n中文👩🏽‍💻 café");
  const emphasis = runs.find(run => run.text === "italic")!;
  assert.equal(emphasis.fontWeight, "700");assert.equal(emphasis.italic, true);
  assert.equal(runs.find(run => run.text === "gone")!.strikethrough, true);
  const code = runs.find(run => run.text === "x")!;
  assert.equal(code.fontFamily, "Menlo");assert.equal(code.backgroundColor, "#eeeeee");
  assert.equal(code.fontSize, 16);
});

test("Bot mention and link ranges preserve visible labels and route targets", () => {
  const nodes = markdownNodes("@Docs [site](https://example.com) ![diagram](https://example.com/p.png)", [{ id: "docs", name: "Docs" }]);
  const runs = selectionRuns(nodes, base, options);
  assert.equal(runs.map(run => run.text).join(""), "Docs site diagram");
  assert.deepEqual(runs.filter(run => run.url).map(run => [run.text, run.url]), [
    ["Docs", "https://bots.local/docs"], ["site", "https://example.com"], ["diagram", "https://example.com/p.png"],
  ]);
  assert.ok(runs.filter(run => run.url).every(run => run.color === options.linkColor));
});

test("table cells and headings can be selected independently without exposing Markdown syntax", () => {
  const nodes = markdownNodes("# A **heading**\n\n| A | B |\n|---|---|\n| **one** | two |");
  const heading = selectionRuns(nodes[0].children, { ...base, fontSize: 23, fontWeight: "700" }, options);
  assert.equal(heading.map(run => run.text).join(""), "A heading");
  assert.ok(heading.every(run => run.fontSize === 23 && run.fontWeight === "700"));
  const rows = nodes[1].children.flatMap(section => section.children);
  const cells = rows.flatMap(row => row.children.map(cell => selectionRuns(cell.children, base, options).map(run => run.text).join("")));
  assert.deepEqual(cells, ["A", "B", "one", "two"]);
});

test("CJK punctuation emphasis reaches native selection as bold runs and exact plain text", () => {
  const nodes = markdownNodes("这是**重要：**后文，**括号（内容）**继续。");
  const runs = selectionRuns(nodes, base, options);
  assert.equal(runs.map(run => run.text).join(""), "这是重要：后文，括号（内容）继续。");
  assert.deepEqual(runs.filter(run => run.fontWeight === "700").map(run => run.text), ["重要：", "括号（内容）"]);
});
