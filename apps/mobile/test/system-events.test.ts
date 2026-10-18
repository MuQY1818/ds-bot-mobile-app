import test from "node:test";
import assert from "node:assert/strict";
import { systemEventLabel } from "../src/logic/system-events.ts";
import { translate } from "../src/logic/localization.ts";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import type { Message } from "@ds-bot/mobile-sdk";
const zh = JSON.parse(readFileSync(new NodeURL("../src/i18n.zh.json", import.meta.url), "utf8"));

test("new group events and restart notes use the current UI language", () => {
  const tr = (key: string, params?: Record<string, string | number>) => translate(key, zh, "zh", params);
  assert.equal(systemEventLabel({ kind: "working", name: "Chief" }, tr), "Chief 开始做了");
  for (const kind of ["approval", "resumed", "cut", "stopped"] as const) {
    const text = systemEventLabel({ kind, name: "Chief" }, tr);
    assert.ok(text?.includes("Chief"));
    assert.ok(/[\u4e00-\u9fff]/.test(text || ""));
  }
  assert.ok(/[\u4e00-\u9fff]/.test(systemEventLabel({ kind: "resumed" }, tr) || ""));
  assert.ok(/[\u4e00-\u9fff]/.test(systemEventLabel({ kind: "retry" }, tr) || ""));
});

test("ordinary content and unrecognized cached event metadata keep their original display path", () => {
  assert.equal(systemEventLabel(undefined, key => key), undefined);
  assert.equal(systemEventLabel({ kind: "constructor", name: "Chief" } as unknown as Message["systemEvent"], key => key), undefined);
});
