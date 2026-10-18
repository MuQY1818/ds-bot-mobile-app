import test from "node:test";
import assert from "node:assert/strict";
import type { Conversation, Message } from "@ds-bot/mobile-sdk";
import { conversationTime, conversationTimestamp, orderConversations } from "../src/logic/conversation-order.ts";

const row = (id: string, kind: string, updatedAt: number, pinned = false): Conversation => ({id, kind, sessionId: id, name: id, updatedAt, pinned});
test("a new Bot, group or Agent message moves ahead of Chief while pins stay first", () => {
  const chief = {...row("chief", "bot", 100), main:true};
  const bot = row("peer", "bot", 90), group = row("group", "room", 80), agent = row("agent", "agent", 70), pin = row("pinned", "bot", 10, true);
  const list = [chief, bot, group, agent, pin];
  for (const target of [bot, group, agent]) {
    const updated = list.map(item => item.id === target.id ? {...item, updatedAt:200} : item);
    assert.deepEqual(orderConversations(updated, {}, item => !!item.pinned).slice(0,2).map(item=>item.id), ["pinned", target.id]);
  }
  assert.deepEqual(list.map(item=>item.id), ["chief","peer","group","agent","pinned"]);
});
test("cached message timestamps preserve recent ordering on older hosts and ISO times compare correctly", () => {
  const old = {...row("old", "bot", 0), createdAt:10}, newer = {...row("new", "room", 0), createdAt:20};
  const preview = {id:"m",sessionId:"old",seq:1,role:"assistant",text:"New reply",createdAt:30} as Message;
  assert.deepEqual(orderConversations([newer,old], {old:preview}, () => false).map(item=>item.id), ["old","new"]);
  assert.equal(conversationTimestamp("2026-10-14T08:00:00Z"), Date.parse("2026-10-14T08:00:00Z"));
  assert.equal(conversationTimestamp("1720000000000"), 1720000000000);
  for(const value of [undefined,null,"", "bad",NaN,Infinity,-1]) assert.equal(conversationTimestamp(value),0);
  assert.equal(conversationTime({...old, updatedAt:40}, preview),40);
});
