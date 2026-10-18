import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "@ds-bot/mobile-sdk";
import { chatTailVersion, createChatScrollController, hasVisibleChatContent } from "../src/logic/chat-scroll.ts";

function harness() {
  const frames = new Set<() => void>();
  const delays = new Set<() => void>();
  const calls: boolean[] = [];
  const notices: boolean[] = [];
  const away: boolean[] = [];
  const following: boolean[] = [];
  const schedule = (queue: Set<() => void>, callback: () => void) => { queue.add(callback); return () => { queue.delete(callback); }; };
  const flush = (queue: Set<() => void>) => { const batch = [...queue]; queue.clear(); batch.forEach(callback => callback()); };
  const controller = createChatScrollController({
    scrollToEnd: animated => calls.push(animated), unreadChanged: value => notices.push(value),
    awayFromBottomChanged: value => away.push(value), followingChanged: value => following.push(value),
    frame: callback => schedule(frames, callback), delay: callback => schedule(delays, callback),
  });
  return { controller, calls, notices, away, following, frame: () => flush(frames), settle: () => flush(delays) };
}
const message = (seq: number, text = `Long history ${seq}\n${"Synthetic QA text. ".repeat(20)}`): Message => ({ id: `m-${seq}`, sessionId: "scroll-qa", seq, role: "assistant", text, createdAt: seq + 1 });
const history = Array.from({ length: 500 }, (_, index) => message(index + 100));
function ready() {
  const h = harness();
  h.controller.tailChanged(chatTailVersion(history));
  h.controller.resize("viewport", 390, 700);
  h.controller.resize("content", 390, 60000);
  h.frame();
  assert.deepEqual(h.calls, [false]);
  h.calls.length = 0;
  return h;
}
function readOlder(h: ReturnType<typeof harness>) {
  h.controller.touchStart(); h.controller.beginDrag();
  h.controller.scroll(2000, 60000, 700);
  h.controller.touchEnd(); h.controller.endDrag(); h.settle();
}

test("500-message history: dock/viewport resize without a new tail never signals unread or loops", () => {
  const h = ready(); readOlder(h);
  for (let i = 0; i < 40; i++) {
    h.controller.resize("viewport", 390, 700 - i);
    h.controller.resize("content", 390, 60000 + i * 10);
    h.controller.tailChanged(chatTailVersion([...history]));
    h.frame();
  }
  assert.deepEqual(h.calls, []); assert.deepEqual(h.notices, []);
});

test("drag immediately cancels queued follow before first scroll event and blocks initial timer/layout/stream", () => {
  const h = ready();
  h.controller.resize("content", 390, 60010);
  h.controller.touchStart(); h.controller.beginDrag();
  h.controller.initialPosition();
  h.controller.resize("viewport", 390, 500);
  h.controller.tailChanged(chatTailVersion([...history, message(600)]));
  h.frame();
  assert.deepEqual(h.calls, []); assert.deepEqual(h.notices, [true]);
});

test("an explicit send reveals the outgoing bubble while a history gesture is still settling", () => {
  const h = ready();
  h.controller.touchStart(); h.controller.beginDrag(); h.controller.scroll(2000, 60000, 700);
  h.controller.touchEnd(); h.controller.endDrag();
  h.controller.sent(); h.controller.tailChanged(chatTailVersion([...history, message(600, 'Outgoing')])); h.frame();
  assert.deepEqual(h.calls, [false]);
  for (let i = 0; i < 30; i++) { h.controller.resize('content', 390, 61000 + (i % 2 ? 40 : -40)); h.frame(); }
  assert.ok(h.calls.length <= 3, 'explicit send retains a bounded correction budget');
});

test("momentum and end-drag handoff suppress scroll commands until settling at bottom", () => {
  const h = ready();
  h.controller.beginDrag(); h.controller.scroll(2000, 60000, 700);
  h.controller.endDrag();
  h.controller.resize("content", 390, 60010); h.frame();
  h.controller.momentumStart(); h.settle();
  h.controller.tailChanged(chatTailVersion([...history, message(600)]));
  h.controller.resize("content", 390, 60100); h.frame();
  assert.deepEqual(h.calls, []);
  h.controller.scroll(59400, 60100, 700); h.controller.momentumEnd(); h.frame();
  assert.deepEqual(h.calls, [false]); assert.deepEqual(h.notices, [true, false]);
});

test("reading history: only new tail or streaming tail content signals unread; jump restores real follow", () => {
  const h = ready(); readOlder(h);
  const added = [...history, message(600, "First chunk")];
  h.controller.tailChanged(chatTailVersion(added)); h.frame();
  assert.deepEqual(h.notices, [true]); assert.deepEqual(h.calls, []);
  h.controller.jumpToBottom(); h.frame();
  assert.deepEqual(h.calls, [true]); assert.deepEqual(h.notices, [true, false]);
  h.controller.tailChanged(chatTailVersion([...history, message(600, "First chunk, second chunk")]));
  h.controller.resize("content", 390, 60300); h.frame();
  assert.deepEqual(h.calls, [true, false]);
  for (let i = 0; i < 20; i++) { h.controller.resize("content", 390, 60300); h.frame(); }
  assert.deepEqual(h.calls, [true, false]);
});

test("load older leaves anchoring to native list and does not notify even with cloned metadata", () => {
  const h = ready(); h.controller.loadOlder();
  const older = [...Array.from({ length: 100 }, (_, i) => message(i)), ...history];
  h.controller.tailChanged(chatTailVersion(older));
  h.controller.tailChanged(chatTailVersion(older.map(item => ({ ...item, pending: false, updatedSeq: 1000 }))));
  h.controller.resize("content", 390, 80000); h.frame();
  assert.deepEqual(h.calls, []); assert.deepEqual(h.notices, []);
  h.controller.tailChanged(chatTailVersion([...older.slice(0, -1), message(599, "Actual streamed text")]));
  assert.deepEqual(h.notices, [true]);
});

test("a tail change without height growth still follows; dispose cancels outstanding callbacks", () => {
  const h = ready();
  h.controller.tailChanged(chatTailVersion([...history, message(600, "chunk")])); h.frame();
  assert.deepEqual(h.calls, [false]);
  h.controller.resize("content", 390, 60010); h.controller.dispose(); h.frame(); h.settle();
  assert.deepEqual(h.calls, [false]);
});

test("pure resize while following issues one correction per changed size, never recursive scroll correction", () => {
  const h = ready();
  h.controller.resize("viewport", 390, 500); h.frame();
  for (let i = 0; i < 50; i++) {
    h.controller.scroll(59300, 60000, 500);
    h.controller.resize("viewport", 390, 500); h.controller.resize("content", 390, 60000); h.frame();
  }
  assert.deepEqual(h.calls, [false]); assert.deepEqual(h.notices, []);
});

test("bottom idle: alternating virtualized height estimates cannot keep moving the viewport", () => {
  for (const delta of [0.5, 1, 40, 400]) {
    const h = ready();
    for (let i = 0; i < 40; i++) {
      h.controller.resize("content", 390, 60000 + (i % 2 ? delta : -delta));
      h.controller.tailChanged(chatTailVersion([...history]));
      h.frame();
    }
    assert.ok(h.calls.length <= 2, `height oscillation ${delta}: ${h.calls.length} scroll commands`);
    assert.deepEqual(h.notices, []);
    for (let i = 0; i < 40; i++) { h.controller.resize("content", 390, 60000 + (i % 2 ? 80 : -80)); h.frame(); }
    assert.ok(h.calls.length <= 2);
    const settled = h.calls.length;
    for (let i = 0; i < 40; i++) { h.controller.resize("content", 390, 60000 + (i % 2 ? 160 : -160)); h.frame(); }
    assert.equal(h.calls.length, settled);
  }
});

test("user reaching bottom grants no scroll or measurement loop without a changed tail", () => {
  const h = ready();
  h.controller.touchStart(); h.controller.beginDrag();
  h.controller.scroll(59400, 60000, 700);
  h.controller.touchEnd(); h.controller.endDrag(); h.controller.momentumStart();
  h.controller.momentumEnd(); h.settle(); h.frame();
  for (let i = 0; i < 30; i++) { h.controller.resize("content", 390, 60000 + (i % 2 ? 40 : -40)); h.frame(); }
  assert.deepEqual(h.calls, []);
  h.controller.tailChanged(chatTailVersion([...history, message(600, 'Actual new reply')])); h.frame();
  assert.deepEqual(h.calls, [false]);
});

test("keyboard viewport and explicit send grant bounded corrections while historical reading remains anchored", () => {
  const h = ready();
  h.controller.resize("viewport", 390, 440); h.frame();
  for (let i = 0; i < 30; i++) { h.controller.resize("content", 390, 60000 + (i % 2 ? 40 : -40)); h.frame(); }
  assert.ok(h.calls.length <= 2);
  readOlder(h); const before = h.calls.length;
  h.controller.resize("viewport", 390, 700); h.controller.resize("content", 390, 61000); h.frame();
  assert.equal(h.calls.length, before);
  h.controller.sent(); h.frame(); assert.equal(h.calls.length, before + 1);
  for (let i = 0; i < 30; i++) { h.controller.resize("content", 390, 61000 + (i % 2 ? 40 : -40)); h.frame(); }
  assert.ok(h.calls.length <= before + 3);
});

test("back-to-bottom is based on actual distance even without new messages and hides for an explicit jump", () => {
  const h = ready();
  h.controller.touchStart(); h.controller.beginDrag(); h.controller.scroll(59300, 60000, 700);
  assert.deepEqual(h.following, [false]); assert.deepEqual(h.away, [], 'a bottom touch does not show the button');
  h.controller.scroll(2000, 60000, 700); h.controller.touchEnd(); h.controller.endDrag(); h.settle();
  assert.deepEqual(h.away, [true]); assert.deepEqual(h.notices, [], 'history alone is enough to show the button');
  h.controller.jumpToBottom(); h.frame(); assert.deepEqual(h.away, [true, false]); assert.deepEqual(h.calls, [true]);
  h.controller.scroll(20000, 60000, 700); assert.deepEqual(h.away, [true, false], 'animated jump does not flash its button');
  h.controller.scroll(59300, 60000, 700);
  for (let i = 0; i < 40; i++) { h.controller.resize('content', 390, 60000 + (i % 2 ? 40 : -40)); h.frame(); }
  assert.ok(h.calls.length <= 3); assert.deepEqual(h.away, [true, false]);
});

test("a jump finishing before revised content reaches bottom restores its button without a scroll loop", () => {
  const h = ready(); readOlder(h);
  h.controller.jumpToBottom(); h.frame(); h.controller.momentumStart();
  h.controller.resize('content', 390, 61000);
  h.controller.scroll(59300, 61000, 700); h.controller.momentumEnd(); h.frame();
  assert.deepEqual(h.away, [true, false, true]);
  assert.deepEqual(h.calls, [true]);
  for (let i = 0; i < 30; i++) { h.controller.resize('content', 390, 61000 + (i % 2 ? 40 : -40)); h.frame(); }
  assert.deepEqual(h.calls, [true]);
});

test("repeated bottom overscroll and reversal never issue a programmatic scroll without a new tail", () => {
  const h = ready();
  for (let i = 0; i < 40; i++) {
    h.controller.touchStart(); h.controller.beginDrag();
    h.controller.scroll(59300 + (i % 2 ? 80 : 0), 60000, 700);
    h.controller.resize('content', 390, 60000 + (i % 2 ? 40 : -40));
    h.controller.touchEnd(); h.controller.endDrag(); h.controller.momentumStart();
    h.controller.scroll(59300, 60000, 700); h.controller.momentumEnd(); h.settle(); h.frame();
  }
  assert.deepEqual(h.calls, []); assert.deepEqual(h.away, []); assert.deepEqual(h.notices, []);
  readOlder(h); assert.equal(h.away.at(-1), true);
  h.controller.beginDrag(); h.controller.scroll(59300, 60000, 700); h.controller.endDrag(); h.settle(); h.frame();
  assert.equal(h.away.at(-1), false); assert.deepEqual(h.calls, []);
});

test("inverted native offset zero starts at the newest item without initial scroll commands", () => {
  const calls: boolean[] = [], away: boolean[] = [];
  const frames: Array<() => void> = [];
  const controller = createChatScrollController({ inverted:true,scrollToEnd:value=>calls.push(value),unreadChanged:()=>{},awayFromBottomChanged:value=>away.push(value),
    frame: callback=>{frames.push(callback);return()=>{const i=frames.indexOf(callback);if(i>=0)frames.splice(i,1);};},delay:()=>()=>{} });
  controller.tailChanged('cached-newest');
  for(const height of [7000,14000,21000,60000]) { controller.resize('content',390,height);controller.resize('viewport',390,700);controller.scroll(0,height,700);while(frames.length)frames.shift()!(); }
  assert.deepEqual(calls,[]);assert.deepEqual(away,[]);
  controller.beginDrag();controller.scroll(5000,60000,700);controller.endDrag();
  assert.deepEqual(away,[true]);
  controller.jumpToBottom();while(frames.length)frames.shift()!();controller.scroll(0,60000,700);
  assert.deepEqual(calls,[true]);assert.deepEqual(away,[true,false]);
  assert.equal(hasVisibleChatContent({...message(1),text:''}),false);
});

test("inverted history is stable while a genuinely new tail follows only at native zero", () => {
  const calls:boolean[]=[];const frames=new Set<()=>void>();const delays=new Set<()=>void>();
  const schedule=(queue:Set<()=>void>,callback:()=>void)=>{queue.add(callback);return()=>{queue.delete(callback);};};
  const flush=(queue:Set<()=>void>)=>{const batch=[...queue];queue.clear();batch.forEach(callback=>callback());};
  const controller=createChatScrollController({inverted:true,scrollToEnd:value=>calls.push(value),unreadChanged:()=>{},frame:callback=>schedule(frames,callback),delay:callback=>schedule(delays,callback)});
  controller.tailChanged('newest');controller.scroll(0,60000,700);
  for(let i=0;i<40;i++){controller.touchStart();controller.beginDrag();controller.scroll(i%2?-50:0,60000,700);controller.touchEnd();controller.endDrag();controller.momentumEnd();flush(delays);controller.resize('content',390,60000+(i%2?40:-40));flush(frames);}
  assert.deepEqual(calls,[]);
  controller.tailChanged('actual-new-reply');flush(frames);assert.deepEqual(calls,[false]);
  controller.touchStart();controller.beginDrag();controller.scroll(5000,60000,700);controller.touchEnd();controller.endDrag();flush(delays);
  controller.tailChanged('another-new-reply');controller.resize('content',390,62000);flush(frames);assert.deepEqual(calls,[false]);
  controller.pause();controller.resume();flush(frames);assert.deepEqual(calls,[false]);
});
