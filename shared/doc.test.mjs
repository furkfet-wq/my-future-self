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

// ---- notes, alarms, Muslim mode, place ----
const withState = (extra, settings = {}) => cleanDoc({ ...good(), state: { ...good().state, ...extra }, settings });
const para = (...content) => ({ type: "paragraph", content });
const txt = (text, marks) => (marks ? { type: "text", text, marks } : { type: "text", text });

test("notes keep only allowed nodes and marks", () => {
  const notes = {
    type: "doc",
    content: [
      para(
        txt("ok", [{ type: "bold" }, { type: "textStyle", attrs: { color: "#ff5c5c", fontSize: "32px", fontFamily: "Georgia, serif" } }]),
        txt("bad", [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "textStyle", attrs: { color: "red; background:url(x)", fontSize: "999px", fontFamily: "Comic" } }]),
        { type: "hardBreak" },
        txt("hl", [{ type: "highlight", attrs: { color: "#ffd84c" } }, { type: "highlight", attrs: { color: "#123456" } }])
      ),
      { type: "script", content: [txt("x")] },
      { type: "heading", attrs: { level: 1 }, content: [txt("h")] },
      para(txt("s", [{ type: "italic" }, { type: "underline" }]), { type: "text", text: 5 }),
    ],
  };
  const c = withState({ notes }).state.notes;
  assert.deepEqual(c, {
    type: "doc",
    content: [
      para(
        txt("ok", [{ type: "bold" }, { type: "textStyle", attrs: { color: "#ff5c5c", fontSize: "32px", fontFamily: "Georgia, serif" } }]),
        txt("bad"),
        { type: "hardBreak" },
        txt("hl", [{ type: "highlight", attrs: { color: "#ffd84c" } }])
      ),
      para(txt("s", [{ type: "italic" }, { type: "underline" }])),
    ],
  });
});

test("notes over 300 KB are dropped to null; missing notes are null", () => {
  const big = { type: "doc", content: [para(txt("x".repeat(300_001)))] };
  assert.equal(withState({ notes: big }).state.notes, null);
  assert.equal(cleanDoc(good()).state.notes, null);
  assert.equal(withState({ notes: { type: "nope" } }).state.notes, null);
});

test("alarms are cleaned", () => {
  const ok = { id: "a1", time: "07:05", label: "Gym", days: [5, 1, 1, 9], on: true };
  const list = [ok, { id: "b", time: "25:00", label: "", days: [], on: true }, { id: "c", time: "06:00", label: "x".repeat(60), days: "mon", on: "yes" }];
  for (let i = 0; i < 40; i++) list.push({ id: `n${i}`, time: "09:00", label: "", days: [], on: false });
  const c = withState({ alarms: list }).state.alarms;
  assert.deepEqual(c[0], { id: "a1", time: "07:05", label: "Gym", days: [1, 5], on: true });
  assert.deepEqual(c[1], { id: "c", time: "06:00", label: "x".repeat(40), days: [], on: false });
  assert.equal(c.length, 30);
  assert.deepEqual(cleanDoc(good()).state.alarms, []);
});

test("place is kept only when it is valid", () => {
  const place = { name: "Istanbul", region: "Istanbul", country: "Türkiye", lat: 41.01, lon: 28.98, cityId: 5041, km: 3 };
  assert.deepEqual(cleanDoc({ ...good(), settings: { place } }).settings.place, place);
  assert.equal(cleanDoc({ ...good(), settings: { place: { ...place, lat: 200 } } }).settings.place, undefined);
  assert.equal(cleanDoc({ ...good(), settings: { place: { ...place, cityId: "5041" } } }).settings.place, undefined);
  assert.equal(cleanDoc({ ...good(), settings: { place: { ...place, name: "y".repeat(200) } } }).settings.place.name.length, 80);
});

test("muslim must be a boolean", () => {
  assert.equal(cleanDoc({ ...good(), settings: { muslim: false } }).settings.muslim, false);
  assert.equal(cleanDoc({ ...good(), settings: { muslim: "no" } }).settings.muslim, undefined);
});
