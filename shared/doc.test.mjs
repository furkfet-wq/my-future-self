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
