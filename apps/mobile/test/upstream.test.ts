import assert from "node:assert/strict";
import { test } from "node:test";
import { composeReferenceDraft, mentionCandidates, mentionQuery, referenceDraft, sessionMention } from "../src/logic/composer.ts";
import { combineTurnReasoning } from "../src/logic/reasoning.ts";
import type { Message } from "@ds-bot/mobile-sdk";

test("chat reference drafts preserve Unicode, escaped labels and user indentation through caching",()=>{
  const sessionId="会话/🪄",label="资料 ] 与 \\ notes";
  const ref={sessionId,label,mention:sessionMention(sessionId,label)};
  const text="    code stays indented\n\nMore text";
  const draft=composeReferenceDraft(text,[ref]);
  assert.deepEqual(referenceDraft(draft),{text,references:[ref]});
  assert.equal(composeReferenceDraft(referenceDraft(draft).text,referenceDraft(draft).references),draft);
  assert.equal(composeReferenceDraft(text,[]),text);
});
test("broken reference drafts stay editable instead of silently dropping text",()=>{
  const text="@[broken](dsh-session:not-valid)\n\nkeep me";
  assert.deepEqual(referenceDraft(text),{text,references:[]});
});
test("mention completion follows the caret and ignores email, URLs, paths, selections and code",()=>{
  assert.deepEqual(mentionQuery("hello @Ma later",{start:9,end:9}),{start:6,end:9,query:"Ma"});
  for(const text of ["a@Ma","example.com/@Ma","@docs/file","@docs\\file","`@Ma","```js\n@Ma"])
    assert.equal(mentionQuery(text,{start:text.length,end:text.length}),null,text);
  assert.equal(mentionQuery("@Ma",{start:1,end:3}),null);
});
test("Bot mentions exclude self, group mentions follow members and Everyone stays separate from references",()=>{
  const bots=[{id:"a",name:"Alpha"},{id:"b",name:"Beta"},{id:"c",name:"New Bot"}];
  assert.deepEqual(mentionCandidates(bots,"a",undefined,"", "Everyone").map(row=>row.name),["Beta","New Bot"]);
  assert.deepEqual(mentionCandidates(bots,undefined,{id:"g",name:"Group",members:["c","a"]},"", "所有人").map(row=>row.name),["New Bot","Alpha","所有人"]);
  assert.equal(mentionCandidates(bots,"a",undefined,"New Bot ","Everyone").length,0);
  assert.equal(mentionCandidates(bots,"a",undefined,"New ","Everyone").length,1);
});
test("reasoning combines once per turn without changing transcripts, sessions or later turns",()=>{
  const messages=[{id:"1",sessionId:"a",seq:1,turn:1,step:1,role:"assistant",text:"first",reasoning:"one"},{id:"2",sessionId:"a",seq:2,turn:1,step:2,role:"assistant",text:"second",reasoning:"two"},{id:"3",sessionId:"b",seq:3,turn:1,role:"assistant",text:"other",reasoning:"three"},{id:"4",sessionId:"a",seq:4,turn:2,role:"assistant",text:"next",reasoning:"four"}] as Message[];
  const view=combineTurnReasoning(messages);
  assert.equal(view[0].reasoning,"one\n\ntwo");assert.equal(view[1].reasoning,undefined);
  assert.equal(view[2].reasoning,"three");assert.equal(view[3].reasoning,"four");
  assert.equal(messages[0].reasoning,"one");assert.equal(messages[1].reasoning,"two");
});
