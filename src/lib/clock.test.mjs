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
