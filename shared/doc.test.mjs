import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDoc, DOC_VERSION } from "./doc.js";

const good = () => ({
  v: 1,
  state: { habits: [{ id: "a1", name: "Workout" }], checks: { "2026-11-27": { a1: true } }, logs: {}, salah: {}, startBalance: 236 },
  settings: { alarm: true },
});

test("valid doc passes", () => {
  assert.equal(DOC_VERSION, 1);
  assert.equal(validateDoc(good()), true);
});

const broken = {
  "v 2": (d) => (d.v = 2),
  "habits not an array": (d) => (d.state.habits = {}),
  "habit without string name": (d) => (d.state.habits = [{ id: "a1", name: 5 }]),
  "checks is an array": (d) => (d.state.checks = []),
  "startBalance a string": (d) => (d.state.startBalance = "236"),
  "startBalance not finite": (d) => (d.state.startBalance = Infinity),
  "missing settings": (d) => delete d.settings,
  "logs null": (d) => (d.state.logs = null),
};
for (const [name, breakIt] of Object.entries(broken)) {
  test(`fails: ${name}`, () => {
    const d = good();
    breakIt(d);
    assert.equal(validateDoc(d), false);
  });
}
test("fails: null and non-objects", () => {
  for (const x of [null, undefined, 1, "doc", []]) assert.equal(validateDoc(x), false);
});

// ---- final review fixes ----
import { cleanDoc, sameDoc } from "./doc.js";

test("cleanDoc drops broken entries instead of crashing the app", () => {
  const d = good();
  d.state.logs = { "2026-11-27": { feel: 5, money: "9", evil: 1 }, "2000-01-01": null, bad: { feel: 1 } };
  d.state.checks = { "2026-11-27": { a1: true, b: "x" }, "2026-11-28": null, nope: { a1: true } };
  d.state.salah = { "2026-11-27": { fajr: true }, "2026-11-28": 7 };
  d.state.habits = [{ id: "a1", name: "  Workout  " }, { id: 5, name: "x" }, { id: "b", name: "y".repeat(80) }];
  d.settings = { alarm: false, verse: "yes", hiddenGraphs: { "wk-dots": true, x: "no" }, junk: 1 };
  const c = cleanDoc(d);
  assert.deepEqual(c.state.logs, { "2026-11-27": { feel: 5 } });
  assert.deepEqual(c.state.checks, { "2026-11-27": { a1: true } });
  assert.deepEqual(c.state.salah, { "2026-11-27": { fajr: true } });
  assert.deepEqual(c.state.habits, [{ id: "a1", name: "Workout" }, { id: "b", name: "y".repeat(60) }]);
  assert.deepEqual(c.settings, { alarm: false, hiddenGraphs: { "wk-dots": true } });
  assert.equal(validateDoc(c), true);
});

test("cleanDoc returns null for something that is not a document", () => {
  assert.equal(cleanDoc({ v: 1, state: null, settings: {} }), null);
  assert.equal(cleanDoc("x"), null);
});

test("sameDoc ignores key order", () => {
  const a = good();
  const b = { settings: { alarm: true }, state: { startBalance: 236, salah: {}, logs: {}, checks: { "2026-11-27": { a1: true } }, habits: [{ name: "Workout", id: "a1" }] }, v: 1 };
  assert.equal(sameDoc(a, b), true);
  b.state.startBalance = 1;
  assert.equal(sameDoc(a, b), false);
});
