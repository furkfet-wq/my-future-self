import { test } from "node:test";
import assert from "node:assert/strict";
import { dueReminders, dayReminders, withDay } from "./reminders.js";
import { cleanReminders, cleanDoc } from "../../shared/doc.js";

const R = {
  "2026-12-05": [
    { id: "a", name: "Dentist", text: "", time: "09:30" },
    { id: "b", name: "No time", text: "", time: "" },
    { id: "c", name: "Early", text: "", time: "07:00" },
  ],
  "2026-12-06": [{ id: "d", name: "Late", text: "", time: "00:02" }],
};

test("a reminder rings once, when its minute arrives", () => {
  const at = (h, m, s = 0) => new Date(2026, 11, 5, h, m, s);
  assert.deepEqual(dueReminders(R, at(9, 29, 59), at(9, 30, 0)).map((x) => x.r.id), ["a"]);
  assert.deepEqual(dueReminders(R, at(9, 30, 0), at(9, 30, 1)), []);
  assert.deepEqual(dueReminders(R, at(9, 28), at(9, 29)), []);
});

test("missed in the last 10 minutes still rings, older does not, across midnight too", () => {
  assert.deepEqual(dueReminders(R, new Date(2026, 11, 5, 9, 0), new Date(2026, 11, 5, 9, 35)).map((x) => x.r.id), ["a"]);
  assert.deepEqual(dueReminders(R, new Date(2026, 11, 5, 9, 0), new Date(2026, 11, 5, 9, 45)), []);
  assert.deepEqual(dueReminders(R, new Date(2026, 11, 5, 23, 59), new Date(2026, 11, 6, 0, 3)).map((x) => x.r.id), ["d"]);
});

test("a day's list: timed first, earliest first", () => {
  assert.deepEqual(dayReminders(R, "2026-12-05").map((r) => r.id), ["c", "a", "b"]);
  assert.deepEqual(dayReminders(R, "2030-01-01"), []);
});

test("an emptied day is removed", () => {
  const next = withDay(R, "2026-12-06", []);
  assert.ok(!("2026-12-06" in next));
  assert.ok("2026-12-06" in R); // the old object is not changed
});

test("saved reminders are cleaned", () => {
  const c = cleanReminders({
    "2026-12-05": [{ id: "a", name: "x".repeat(99), text: "hi", time: "25:00", extra: 1 }, { name: "no id" }, "junk"],
    "not-a-day": [{ id: "z", name: "bad day" }],
    "2026-12-07": [],
  });
  assert.deepEqual(c, { "2026-12-05": [{ id: "a", name: "x".repeat(60), text: "hi", time: "" }] });
  assert.deepEqual(cleanReminders(null), {});
  const doc = { v: 1, state: { habits: [], checks: {}, logs: {}, salah: {}, startBalance: 0, reminders: R }, settings: {} };
  assert.equal(cleanDoc(doc).state.reminders["2026-12-05"].length, 3);
});
