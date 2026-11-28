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

test("long notes are cut to 100,000 letters; missing notes are null", () => {
  const big = { type: "doc", content: [para(txt("x".repeat(300_001)))] };
  assert.equal(withState({ notes: big }).state.notes.content[0].content[0].text.length, 100_000);
  assert.equal(cleanDoc(good()).state.notes, null);
  assert.equal(withState({ notes: { type: "nope" } }).state.notes, null);
});

test("alarms are cleaned", () => {
  const ok = { id: "a1", time: "07:05", label: "Gym", days: [5, 1, 1, 9], on: true };
  const list = [ok, { id: "b", time: "25:00", label: "", days: [], on: true }, { id: "c", time: "06:00", label: "x".repeat(60), days: "mon", on: "yes" }];
  for (let i = 0; i < 60; i++) list.push({ id: `n${i}`, time: "09:00", label: "", days: [], on: false });
  const c = withState({ alarms: list }).state.alarms;
  assert.deepEqual(c[0], { id: "a1", time: "07:05", label: "Gym", days: [1, 5], on: true });
  assert.deepEqual(c[1], { id: "c", time: "06:00", label: "x".repeat(40), days: [], on: false });
  assert.equal(c.length, 50);
  assert.deepEqual(cleanDoc(good()).state.alarms, []);
});

test("place is kept only when it is valid", () => {
  const place = { name: "Istanbul", region: "Istanbul", country: "Türkiye", cityId: 5041, km: 3 };
  assert.deepEqual(cleanDoc({ ...good(), settings: { place } }).settings.place, place);
  assert.equal(cleanDoc({ ...good(), settings: { place: { ...place, cityId: 0 } } }).settings.place, undefined);
  assert.equal(cleanDoc({ ...good(), settings: { place: { ...place, cityId: "5041" } } }).settings.place, undefined);
  assert.equal(cleanDoc({ ...good(), settings: { place: { ...place, name: "y".repeat(200) } } }).settings.place.name.length, 80);
});

test("muslim must be a boolean", () => {
  assert.equal(cleanDoc({ ...good(), settings: { muslim: false } }).settings.muslim, false);
  assert.equal(cleanDoc({ ...good(), settings: { muslim: "no" } }).settings.muslim, undefined);
});

test("place keeps no coordinates (privacy)", () => {
  const place = { name: "My location", region: "", country: "", lat: 41.0123, lon: 28.9765, cityId: 5041, km: 2 };
  assert.deepEqual(cleanDoc({ ...good(), settings: { place } }).settings.place, { name: "My location", region: "", country: "", cityId: 5041, km: 2 });
});

test("notes keep colour-menu colours only as exact #rrggbb", async () => {
  const { cleanNotes } = await import("./doc.js");
  const one = (marks) => cleanNotes({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks }] }] }).content[0].content[0].marks;
  assert.deepEqual(one([{ type: "textStyle", attrs: { color: "#1a2b3c" } }]), [{ type: "textStyle", attrs: { color: "#1a2b3c" } }]);
  assert.deepEqual(one([{ type: "highlight", attrs: { color: "#abcdef" } }]), [{ type: "highlight", attrs: { color: "#abcdef" } }]);
  for (const bad of ["#ABCDEF", "#abc", "#abcdef;x", "rgb(1,2,3)", "url(x)", 5]) {
    assert.equal(one([{ type: "textStyle", attrs: { color: bad } }]), undefined, String(bad));
    assert.equal(one([{ type: "highlight", attrs: { color: bad } }]), undefined, String(bad));
  }
});

test("notes stop at 100,000 letters; at most 50 things ring (alarms + timed reminders)", async () => {
  const { cleanNotes, ringingCount, MAX_ALARMS } = await import("./doc.js");
  const para = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
  const n = cleanNotes({ type: "doc", content: [para("a".repeat(95000)), para("b".repeat(8000)), para("c")] });
  assert.equal(n.content[0].content[0].text.length, 95000);
  assert.equal(n.content[1].content[0].text.length, 5000);
  assert.deepEqual(n.content[2], { type: "paragraph" });
  const alarms = Array.from({ length: 45 }, (_, i) => ({ id: `a${i}`, time: "07:00", label: "", days: [], on: true }));
  const reminders = { "2026-12-01": Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, name: `R${i}`, text: "", time: "09:00" })) };
  const doc = cleanDoc({ v: 1, state: { habits: [], checks: {}, logs: {}, salah: {}, startBalance: 0, alarms, reminders }, settings: {} });
  assert.equal(ringingCount(doc.state.alarms, doc.state.reminders), MAX_ALARMS);
  assert.equal(doc.state.reminders["2026-12-01"].length, 8, "reminders past the limit are kept, without a ring time");
  const many = Array.from({ length: 70 }, (_, i) => ({ id: `a${i}`, time: "07:00", label: "", days: [], on: true }));
  assert.equal(cleanDoc({ v: 1, state: { habits: [], checks: {}, logs: {}, salah: {}, startBalance: 0, alarms: many }, settings: {} }).state.alarms.length, 50);
});

test("sticky notes are cleaned", async () => {
  const { cleanStickies, MAX_STICKIES } = await import("./doc.js");
  const doc = { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Hi", marks: [{ type: "bold" }, { type: "link", attrs: { href: "javascript:x" } }, { type: "strike" }] }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "milk" }] }] }] },
    { type: "heading", content: [{ type: "text", text: "dropped" }] },
    { type: "image", attrs: { src: "x" } },
  ] };
  const [n] = cleanStickies([{ id: "s1", x: -50, y: 120.6, w: 5000, h: 10, color: "red", doc, extra: 1 }]);
  assert.deepEqual(n, { id: "s1", x: 0, y: 121, w: 900, h: 150, color: "yellow", doc: { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Hi", marks: [{ type: "bold" }, { type: "strike" }] }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "milk" }] }] }] },
  ] } });
  const long = cleanStickies([{ id: "a", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(9000) }] }] } }]);
  assert.equal(long[0].doc.content[0].content[0].text.length, 5000);
  assert.equal(cleanStickies(Array.from({ length: 60 }, (_, i) => ({ id: `n${i}` }))).length, MAX_STICKIES);
  assert.deepEqual(cleanStickies([{ id: "a" }, { id: "a" }, "junk"]).length, 1);
});

test("notepad tabs: at most 10, 100,000 letters for all tabs together", async () => {
  const { cleanNoteTabs, noteLetters, MAX_NOTE_TABS, NOTE_MAX_CHARS } = await import("./doc.js");
  const doc = (n, ch = "a") => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: ch.repeat(n) }] }] });
  const tabs = cleanNoteTabs([{ id: "a", name: "One", doc: doc(70000) }, { id: "b", name: "x".repeat(50), doc: doc(70000, "b") }, { id: "a", doc: doc(5) }]);
  assert.equal(tabs.length, 2, "duplicate id dropped");
  assert.equal(tabs[1].name.length, 30);
  assert.equal(noteLetters(tabs[0].doc) + noteLetters(tabs[1].doc), NOTE_MAX_CHARS);
  assert.equal(cleanNoteTabs(Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, doc: doc(1) }))).length, MAX_NOTE_TABS);
});
