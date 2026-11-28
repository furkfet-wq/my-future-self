import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// tiny localStorage stand-in for node
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { decideStart, hasEntries, readLocalDoc, writeLocalDoc, clearLocal, OWNER_KEY, DIRTY_KEY, STORAGE_KEY, SETTINGS_KEY } = await import("./startup.js");

const empty = { habits: [{ id: "a", name: "Workout" }], checks: {}, logs: {}, salah: {}, startBalance: 0 };
const full = { ...empty, checks: { "2026-11-27": { a: true } } };
const remote = { v: 1, state: full, settings: {} };
const d = (o) => decideStart({ userId: "A", localOwner: null, localState: null, localDirty: false, remote: null, ...o });

test("other owner's local copy is dropped", () => {
  assert.equal(d({ localOwner: "B", localState: full, localDirty: true }), "fresh");
  assert.equal(d({ localOwner: "B", localState: full, localDirty: true, remote }), "remote");
});
test("unowned local entries, empty account -> upload", () => assert.equal(d({ localState: full }), "upload"));
test("unowned local entries, account has data -> ask", () => assert.equal(d({ localState: full, remote }), "ask"));
test("unowned local copy without entries -> remote or fresh", () => {
  assert.equal(d({ localState: empty, remote }), "remote");
  assert.equal(d({ localState: empty }), "fresh");
});
test("own copy, not dirty -> remote", () => assert.equal(d({ localOwner: "A", localState: full, remote }), "remote"));
test("dirty own copy is uploaded", () => {
  assert.equal(d({ localOwner: "A", localState: full, localDirty: true, remote }), "upload");
  assert.equal(d({ localOwner: "A", localState: full, localDirty: true }), "upload");
});
test("own copy, not dirty, account empty -> upload", () => assert.equal(d({ localOwner: "A", localState: full }), "upload"));
test("no local, no remote -> fresh", () => assert.equal(d({}), "fresh"));

test("hasEntries", () => {
  assert.equal(hasEntries(empty), false);
  assert.equal(hasEntries(full), true);
  assert.equal(hasEntries({ ...empty, startBalance: 236 }), true);
  assert.equal(hasEntries({ ...empty, logs: { x: { feel: 5 } } }), true);
  assert.equal(hasEntries(null), false);
});

beforeEach(() => mem.clear());
test("write, read and clear the local copy", async () => {
  writeLocalDoc(remote, "A");
  assert.equal(localStorage.getItem(OWNER_KEY), "A");
  const { DEFAULT_SETTINGS } = await import("./startup.js");
  assert.deepEqual(readLocalDoc(), { v: 1, state: { ...full, notes: null, alarms: [], reminders: {} }, settings: DEFAULT_SETTINGS });
  localStorage.setItem(DIRTY_KEY, "1");
  clearLocal();
  for (const k of [STORAGE_KEY, SETTINGS_KEY, OWNER_KEY, DIRTY_KEY]) assert.equal(localStorage.getItem(k), null);
  assert.equal(readLocalDoc(), null);
});
test("unowned import keeps no owner tag", () => {
  localStorage.setItem(OWNER_KEY, "B");
  writeLocalDoc(remote, null);
  assert.equal(localStorage.getItem(OWNER_KEY), null);
});

// ---- final review fixes ----
test("own copy of an account deleted on another device starts fresh", () => {
  assert.equal(d({ localOwner: "A", localState: full, localVersion: 3 }), "fresh");
  assert.equal(d({ localOwner: "A", localState: full, localVersion: 0 }), "upload"); // never saved online yet
});
test("the saved version travels with the local copy", async () => {
  const { VERSION_KEY, localVersion } = await import("./startup.js");
  writeLocalDoc(remote, "A", 4);
  assert.equal(localStorage.getItem(VERSION_KEY), "4");
  assert.equal(localVersion(), 4);
  clearLocal();
  assert.equal(localVersion(), 0);
});
test("readLocalDoc cleans broken entries", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...full, logs: { "2026-11-01": null } }));
  assert.deepEqual(readLocalDoc().state.logs, {});
});

test("a browser copy without saved settings counts as the default settings", async () => {
  const { DEFAULT_SETTINGS } = await import("./startup.js");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  localStorage.removeItem(SETTINGS_KEY);
  assert.deepEqual(readLocalDoc().settings, DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.muslim, true);
});
