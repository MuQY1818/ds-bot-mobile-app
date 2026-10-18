import test from "node:test";
import assert from "node:assert/strict";
import {
  activityDays,
  compact,
  customRange,
  ranges,
  summarizeUsage,
} from "../src/features/usage-model.ts";
import type { UsageView } from "../src/features/usage-model.ts";
import {
  initialSchedule,
  schedulePayload,
} from "../src/features/schedule-model.ts";

const usage: UsageView = {
  now: "2026-10-11 12",
  owners: [
    { key: "chief", id: "chief", kind: "bot", name: "Chief" },
    { key: "room:team", id: "team", kind: "room", name: "Team" },
  ],
  models: [
    { key: "a/one", name: "One" },
    { key: "b/two", name: "Two" },
  ],
  kinds: ["chat", "memory"],
  rows: [
    ["2026-09-28 13", 0, 0, 0, 50, 0, 0, 0, 1],
    ["2026-10-04 09", 0, 0, 0, 100, 0, 0, 0, 1],
    ["2026-10-05 00", 0, 0, 0, 10, 20, 30, 40, 2],
    ["2026-10-11 10", 1, 1, 1, 1, 2, 3, 4, 1],
    ["2026-10-11 13", 0, 0, 0, 999, 0, 0, 0, 1],
  ],
};
test("usage follows the host hourly tuple, bills cache writes as input, and excludes future rows", () => {
  const result = summarizeUsage(usage, ranges[1]);
  assert.deepEqual(result.total, {
    input: 44,
    cacheRead: 22,
    output: 44,
    calls: 3,
    total: 110,
  });
  assert.equal(result.previous, 150);
  assert.equal(result.buckets.length, 7);
  assert.equal(result.buckets[0].key, "2026-10-05");
  assert.equal(result.models.get(1)?.total, 10);
});
test("Bot and model filters intersect without changing dictionary indices", () => {
  assert.equal(summarizeUsage(usage, ranges[1], "chief").total.total, 100);
  assert.equal(
    summarizeUsage(usage, ranges[1], "chief", "b/two").total.total,
    0,
  );
  const room = summarizeUsage(usage, ranges[1], "room:team", "b/two");
  assert.equal(room.kinds.get(1)?.calls, 1);
  assert.deepEqual([...room.owners.keys()], [1]);
});
test("custom calendar ranges are inclusive, reversible and reject impossible dates", () => {
  const custom = customRange("2026-10-11", "2026-10-05");
  assert.equal(custom.days, 7);
  const result = summarizeUsage(usage, custom);
  assert.equal(result.total.total, 1109);
  assert.equal(result.buckets.length, 7);
  assert.throws(() => customRange("2026-02-30", "2026-03-01"), /valid dates/);
  assert.throws(() => customRange("2000-01-01", "2026-10-11"), /10 years/);
});
test("weekly and monthly charts use wall-clock calendar boundaries rather than elapsed local hours", () => {
  const weeks = summarizeUsage(usage, ranges[3]);
  assert.equal(weeks.buckets.at(-1)?.key, "2026-10-05");
  assert.equal(weeks.buckets.at(-1)?.sum.total, 110);
  const months = summarizeUsage(usage, ranges[4]);
  assert.equal(months.buckets.at(-1)?.key, "2026-10");
  assert.equal(months.buckets.at(-1)?.sum.total, 210);
  assert.equal(compact(999999), "1M");
});
test("activity history applies the same owner and model selection", () => {
  const summary = summarizeUsage(usage, ranges[1], "room:team");
  const days = activityDays(usage, summary.keep);
  assert.equal(days.find((day) => day.day === "2026-10-11")?.tokens, 10);
  assert.equal(days.filter((day) => day.tokens > 0).length, 1);
});
test("schedule creation validates recurring time, weekdays and repeat bounds before mutation", () => {
  const form = {
    ...initialSchedule("chief"),
    title: "Briefing",
    prompt: "Summarize the day.",
    timeZone: "Asia/Shanghai",
  };
  assert.deepEqual(schedulePayload(form).when, {
    kind: "daily",
    time: "09:00",
    timeZone: "Asia/Shanghai",
  });
  assert.deepEqual(
    schedulePayload({ ...form, kind: "weekly", weekdays: [5, 1, 5] }).when,
    {
      kind: "weekly",
      time: "09:00",
      timeZone: "Asia/Shanghai",
      weekdays: [1, 5],
    },
  );
  assert.throws(
    () => schedulePayload({ ...form, kind: "weekly", weekdays: [] }),
    /at least one day/,
  );
  assert.throws(() => schedulePayload({ ...form, time: "25:00" }), /HH:MM/);
  assert.throws(
    () => schedulePayload({ ...form, timeZone: "not-a-zone" }),
    /time zone/,
  );
  assert.equal(
    schedulePayload({ ...form, kind: "every", count: "7", unit: "days" }).when
      .minutes,
    10080,
  );
  assert.throws(
    () => schedulePayload({ ...form, kind: "every", count: "8", unit: "days" }),
    /7 days/,
  );
});
test("one-time schedules cannot silently normalize invalid dates or accept a past target", () => {
  const form = {
    ...initialSchedule("chief"),
    title: "Briefing",
    prompt: "Summarize.",
    kind: "at",
    date: "2027-02-28",
    time: "09:00",
  };
  assert.equal(schedulePayload(form, 0).when.kind, "at");
  assert.throws(
    () => schedulePayload({ ...form, date: "2027-02-30" }, 0),
    /valid local date/,
  );
  assert.throws(() => schedulePayload(form, Date.UTC(2028, 0, 1)), /future/);
});
