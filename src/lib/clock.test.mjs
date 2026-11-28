import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRing, dueAlarms, fmtIn, fmtClock, timerLeft, stopwatchElapsed } from "./clock.js";

// Friday 27 Nov 2026, 10:00 local time
const at = (d, h, m = 0, s = 0) => new Date(2026, 10, d, h, m, s);
const NOW = at(27, 10);
const alarm = (o) => ({ id: "a", time: "07:00", label: "", days: [], on: true, ...o });

test("next ring later today", () => {
  assert.deepEqual(nextRing(alarm({ time: "11:30" }), NOW), at(27, 11, 30));
});
test("next ring tomorrow when the time has passed", () => {
  assert.deepEqual(nextRing(alarm({ time: "07:00" }), NOW), at(28, 7));
  assert.deepEqual(nextRing(alarm({ time: "10:00" }), NOW), at(28, 10)); // exactly now counts as passed
});
test("repeat days skip to the next listed day", () => {
  // Friday now; Mondays only (1) -> Monday 30 Nov
  assert.deepEqual(nextRing(alarm({ time: "07:00", days: [1] }), NOW), at(30, 7));
  // Friday (5) later today
  assert.deepEqual(nextRing(alarm({ time: "12:00", days: [5] }), NOW), at(27, 12));
  // Friday only but passed -> next Friday
  assert.deepEqual(nextRing(alarm({ time: "09:00", days: [5] }), NOW), new Date(2026, 11, 4, 9));
});
test("off alarm never rings", () => {
  assert.equal(nextRing(alarm({ on: false }), NOW), null);
});

test("due alarms catches a missed minute", () => {
  const list = [alarm({ id: "x", time: "09:58" }), alarm({ id: "y", time: "10:05" }), alarm({ id: "z", time: "09:58", on: false })];
  // the tab slept from 09:55 to 10:00
  assert.deepEqual(dueAlarms(list, at(27, 9, 55), NOW).map((a) => a.id), ["x"]);
});
test("due alarms ignores rings older than 10 minutes", () => {
  assert.deepEqual(dueAlarms([alarm({ time: "09:30" })], at(27, 9, 0), NOW), []);
});
test("due alarms respects repeat days", () => {
  assert.deepEqual(dueAlarms([alarm({ time: "09:59", days: [1] })], at(27, 9, 58), NOW), []);
  assert.equal(dueAlarms([alarm({ time: "09:59", days: [5] })], at(27, 9, 58), NOW).length, 1);
});

test("fmtIn wording", () => {
  assert.equal(fmtIn((7 * 60 + 12) * 60000 + 5000), "Rings in 7 h 12 min");
  assert.equal(fmtIn(3 * 60000 + 1000), "Rings in 3 min");
  assert.equal(fmtIn(30000), "Rings in less than a minute");
  assert.equal(fmtIn(26 * 3600000), "Rings in 1 day 2 h");
});
test("fmtClock", () => {
  assert.equal(fmtClock((3600 + 2 * 60 + 3) * 1000 + 450, true), "1:02:03.45");
  assert.equal(fmtClock(123000, false), "02:03");
  assert.equal(fmtClock(5 * 3600000 + 1000, false), "5:00:01");
  assert.equal(fmtClock(-5, false), "00:00");
});

test("timer maths: running, paused, finished", () => {
  const t0 = 1_000_000;
  assert.equal(timerLeft({ endsAt: t0 + 90000, pausedLeft: null }, t0), 90000);
  assert.equal(timerLeft({ endsAt: null, pausedLeft: 42000 }, t0 + 999999), 42000);
  assert.equal(timerLeft({ endsAt: t0 + 1000, pausedLeft: null }, t0 + 5000), 0);
});
test("stopwatch maths", () => {
  assert.equal(stopwatchElapsed({ startedAt: 1000, banked: 500 }, 3000), 2500);
  assert.equal(stopwatchElapsed({ startedAt: null, banked: 4200 }, 99999), 4200);
});

import { splitDHMS, fmtDHMS } from "./clock.js";
test("stopwatch time in days, hours, minutes, seconds", () => {
  assert.deepEqual(splitDHMS(0), { d: 0, h: 0, m: 0, s: 0 });
  assert.deepEqual(splitDHMS(999), { d: 0, h: 0, m: 0, s: 0 });
  assert.deepEqual(splitDHMS(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000 + 700), { d: 2, h: 3, m: 4, s: 5 });
  assert.equal(fmtDHMS(65000), "01:05");
  assert.equal(fmtDHMS(3_725_000), "01:02:05");
  assert.equal(fmtDHMS(90_061_000), "1d 01:01:01");
});

import { habitsFor } from "./habits.js";
import { dayStats, streak } from "./week.js";
test("a habit added in December is not in November", () => {
  const habits = [{ id: "old", name: "Old" }, { id: "dec", name: "New", since: "2026-12" }];
  assert.deepEqual(habitsFor(habits, "2026-11-30").map((h) => h.id), ["old"]);
  assert.deepEqual(habitsFor(habits, "2026-12-01").map((h) => h.id), ["old", "dec"]);
  assert.deepEqual(habitsFor(habits, "2027-03").map((h) => h.id), ["old", "dec"]);
  const state = { habits, checks: { "2026-11-30": { old: true } }, logs: {}, salah: {} };
  const nov = dayStats(state, "2026-11-30");
  assert.deepEqual([nov.done, nov.total, nov.pct], [1, 1, 100], "November: 1 of 1");
  assert.equal(dayStats(state, "2026-12-01").total, 2);
  assert.equal(streak(state, "2026-11-30"), 1);
});
