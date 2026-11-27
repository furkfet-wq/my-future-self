// Browser test of sign-in and online saving: `npm run build && npm run test:browser`.
// Runs the real app in Edge against `wrangler dev --local`. Google's sign-in script is swapped for a stand-in
// button that hands the app a token signed by the test key (the Worker checks it exactly like a real one).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import http from "node:http";
import { readFileSync } from "node:fs";
import { W, startWorker, stopWorker, googleToken, FAKE_TIMES } from "./harness.mjs";
import { cleanDoc } from "../shared/doc.js";

const extDir = join(homedir(), ".vscode", "extensions");
const pwDir = process.env.PLAYWRIGHT_CORE || join(extDir, readdirSync(extDir).find((d) => d.startsWith("vscjava.migrate-java-to-azure")), "node_modules", "playwright-core");
const { chromium } = createRequire(import.meta.url)(pwDir);

const FAKE_GIS = `window.google = { accounts: { id: {
  initialize(o) { window.__gis = o; },
  renderButton(el) { const b = document.createElement("button"); b.id = "fake-google"; b.textContent = "Sign in with Google";
    b.onclick = () => window.__gis.callback({ credential: window.__nextToken }); el.appendChild(b); },
  disableAutoSelect() {} } } };`;

let browser;
before(async () => {
  await startWorker();
  browser = await chromium.launch({ channel: "msedge", headless: true });
});
after(async () => {
  await browser?.close();
  stopWorker();
});

async function open(ctx, path = "/") {
  const page = await ctx.newPage();
  await page.route("https://accounts.google.com/gsi/client", (r) => r.fulfill({ contentType: "text/javascript", body: FAKE_GIS }));
  await page.route(/api\.alquran\.cloud|quotable|fonts\.(googleapis|gstatic)/, (r) => r.abort());
  page.errors = [];
  page.on("console", (m) => m.type() === "error" && /Content Security Policy/i.test(m.text()) && page.errors.push(m.text()));
  await page.goto(W + path);
  return page;
}
async function signInAs(page, sub) {
  await page.locator("#fake-google").waitFor();
  await page.evaluate((t) => (window.__nextToken = t), await googleToken(sub));
  await page.click("#fake-google");
  await page.locator("main.app").waitFor({ timeout: 20000 });
}
// clicks the stand-in Google button without waiting for the app (for screens shown after sign-in)
async function signInFor(page, sub) {
  await page.locator("#fake-google").waitFor();
  await page.evaluate((t) => (window.__nextToken = t), await googleToken(sub));
  await page.click("#fake-google");
}
async function serverDoc(ctx) {
  const cookie = (await ctx.cookies()).find((c) => c.name === "__Host-mfs_session");
  const res = await fetch(W + "/api/data", { headers: { cookie: `__Host-mfs_session=${cookie.value}` } });
  return res.json();
}
const local = (page, k = "habit-tracker-v1") => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), k);
const checksCount = (state) => Object.values(state?.checks || {}).reduce((n, d) => n + Object.keys(d).length, 0);
const tickOne = async (page) => {
  await page.locator(".hg-box:not(.done)").first().click();
  await page.waitForTimeout(3000); // saves 2 s after the last change
};

test("sign-in screen first, then the app; a tick is saved online", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await page.locator(".lk h1").waitFor();
  assert.equal(await page.locator("main.app").count(), 0);
  await signInAs(page, "b1");
  const acc = await page.locator(".acc-btn").boundingBox();
  const gear = await page.locator(".gear").boundingBox();
  assert.ok(acc.x + acc.width <= gear.x && Math.abs(acc.y - gear.y) < 2, "account button sits just left of the gear");
  await tickOne(page);
  assert.equal(checksCount((await serverDoc(ctx)).data.state), 1);
  assert.deepEqual(page.errors, []);
  await ctx.close();
});

test("another device signed in to the same account sees the same data", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await signInAs(page, "b1");
  assert.equal(checksCount(await local(page)), 1);
  await ctx.close();
});

test("old browser data is uploaded on the first sign-in", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await page.evaluate(() =>
    localStorage.setItem("habit-tracker-v1", JSON.stringify({ habits: [{ id: "x", name: "Old habit" }], checks: { "2026-11-20": { x: true } }, logs: {}, salah: {}, startBalance: 236 }))
  );
  await page.reload();
  await signInAs(page, "b3");
  const { data } = await serverDoc(ctx);
  assert.equal(data.state.habits[0].name, "Old habit");
  assert.equal(data.state.startBalance, 236);

  // sign out: this browser's copy is cleared, and the next account starts empty
  await page.click(".acc-btn");
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.locator("#fake-google").waitFor();
  assert.equal(await local(page), null);
  await signInAs(page, "b4");
  assert.equal(checksCount(await local(page)), 0);
  assert.notEqual((await local(page)).habits[0].name, "Old habit");
  assert.equal(await page.evaluate(() => localStorage.getItem("mfs-owner-v1")), "b4");
  await ctx.close();
});

test("a #move link from the old address imports the data", async () => {
  const doc = { v: 1, state: { habits: [{ id: "m", name: "Moved habit" }], checks: { "2026-11-21": { m: true } }, logs: {}, salah: {}, startBalance: 5 }, settings: { verse: false } };
  const ctx = await browser.newContext();
  const page = await open(ctx, "/#move=" + Buffer.from(JSON.stringify(doc)).toString("base64url"));
  await page.getByText("Your data from the old address is ready").waitFor();
  assert.equal(new URL(page.url()).hash, "");
  await signInFor(page, "b5");
  await page.getByText("Import data from the old address?").waitFor();
  await page.getByRole("button", { name: "Import it" }).click();
  await page.locator("main.app").waitFor({ timeout: 20000 });
  assert.deepEqual((await serverDoc(ctx)).data, cleanDoc(doc));

  // delete account: asks twice, then everything is gone
  await page.click(".acc-btn");
  await page.getByRole("menuitem", { name: "Delete my account" }).click();
  await page.getByRole("button", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Delete forever" }).click();
  await page.locator("#fake-google").waitFor();
  await signInAs(page, "b5");
  assert.equal((await serverDoc(ctx)).data, null);
  await ctx.close();
});

test("a stale device gets the newer copy instead of overwriting it", async () => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await open(a);
  await signInAs(pa, "b7");
  const pb = await open(b);
  await signInAs(pb, "b7");
  await tickOne(pa); // device A saves first
  await pb.locator(".hg-box:not(.done)").nth(3).click(); // device B still has the old version
  await pb.getByText("Updated from another device").waitFor({ timeout: 6000 });
  assert.equal(checksCount((await serverDoc(a)).data.state), 1);
  assert.equal(checksCount(await local(pb)), 1);
  await a.close();
  await b.close();
});

test("old address page carries the data to the new site", async () => {
  // serve moved/ like GitHub Pages does, at /my-future-self/
  const srv = http.createServer((q, r) => {
    const f = q.url.endsWith("move.js") ? "moved/move.js" : "moved/index.html";
    r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : "text/html");
    r.end(readFileSync(f));
  });
  await new Promise((ok) => srv.listen(8791, "127.0.0.1", ok));
  try {
    const old = await browser.newContext();
    const page = await old.newPage();
    await page.route("https://my-future-self.flamesmp.workers.dev/**", (r) => r.fulfill({ contentType: "text/html", body: "new site" }));
    await page.goto("http://127.0.0.1:8791/my-future-self/");
    const state = { habits: [{ id: "o", name: "Habit from old site £" }], checks: { "2026-11-22": { o: true } }, logs: {}, salah: {}, startBalance: 236 };
    await page.evaluate((s) => {
      localStorage.setItem("habit-tracker-v1", JSON.stringify(s));
      localStorage.setItem("mfs-settings-v1", JSON.stringify({ quote: false }));
    }, state);
    await page.reload();
    await page.click("#move");
    await page.waitForURL(/^https:\/\/my-future-self\.flamesmp\.workers\.dev\/#move=/);
    const hash = new URL(page.url()).hash;
    await old.close();

    const ctx = await browser.newContext();
    const app = await open(ctx, "/" + hash);
    await signInFor(app, "b8");
    await app.getByRole("button", { name: "Import it" }).click();
    await app.locator("main.app").waitFor({ timeout: 20000 });
    assert.deepEqual((await serverDoc(ctx)).data, cleanDoc({ v: 1, state, settings: { quote: false } }));
    await ctx.close();
  } finally {
    srv.close();
  }
});

// ---- final review fixes ----
test("a device coming back with an old unsaved change asks instead of overwriting newer data", async () => {
  const a = await browser.newContext();
  const pa = await open(a);
  await signInAs(pa, "c1");
  await tickOne(pa); // version 1
  const b = await browser.newContext();
  const pb = await open(b);
  await signInAs(pb, "c1");
  await pb.locator(".hg-box:not(.done)").nth(2).click();
  await pb.locator(".hg-box:not(.done)").nth(4).click();
  await pb.waitForTimeout(3000); // version 2, three ticks
  // device A ticks again and the tab is closed before it saved
  await pa.locator(".hg-box:not(.done)").nth(6).click();
  await pa.evaluate(() => localStorage.setItem("mfs-dirty-v1", "1"));
  await pa.close();
  const pa2 = await a.newPage();
  await pa2.route(/api\.alquran\.cloud|quotable|fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await pa2.goto(W);
  await pa2.getByText("Which data do you want?").waitFor({ timeout: 15000 });
  assert.equal(checksCount((await serverDoc(b)).data.state), 3, "newer data is still online");
  await a.close();
  await b.close();
});

test("signing in to another account in one tab reloads the other tabs", async () => {
  const ctx = await browser.newContext();
  const p1 = await open(ctx);
  await signInAs(p1, "c2");
  await p1.evaluate(() => (window.__stale = 1));
  const p2 = await open(ctx);
  await p2.locator("main.app").waitFor({ timeout: 20000 });
  await p2.click(".acc-btn");
  await p2.getByRole("menuitem", { name: "Sign out" }).click();
  await signInAs(p2, "c3");
  await p1.waitForFunction(() => window.__stale === undefined, null, { timeout: 10000 });
  await ctx.close();
});

test("Forgot PIN signs out instead of opening the app", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await signInAs(page, "c4");
  await page.evaluate(() => localStorage.setItem("mfs-lock-v1", JSON.stringify({ v: 1, salt: "00".repeat(16), hash: "11".repeat(32) })));
  await page.reload();
  await page.getByText("Forgot PIN?").click();
  await page.locator(".lk-danger").click();
  await page.locator("#fake-google").waitFor({ timeout: 15000 });
  assert.equal(await page.locator("main.app").count(), 0);
  await ctx.close();
});

test("Move my data still works when already signed in on the new site", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await signInAs(page, "c5");
  await tickOne(page);
  const doc = { v: 1, state: { habits: [{ id: "q", name: "Old site habit" }], checks: {}, logs: { "2026-11-20": { feel: 7 }, "1999-01-01": null }, salah: {}, startBalance: 9 }, settings: {} };
  // the old page opens the link fresh (it comes from another site), so use a new tab
  const p2 = await open(ctx, "/#move=" + Buffer.from(JSON.stringify(doc)).toString("base64url"));
  await p2.getByText("Import data from the old address?").waitFor({ timeout: 15000 });
  await p2.getByRole("button", { name: "Replace my online data with it" }).click();
  await p2.locator("main.app").waitFor({ timeout: 20000 });
  const saved = (await serverDoc(ctx)).data;
  assert.equal(saved.state.habits[0].name, "Old site habit");
  assert.deepEqual(saved.state.logs, { "2026-11-20": { feel: 7 } }, "broken entries are dropped, not imported");
  await ctx.close();
});

test("a deleted account's data does not come back from another device", async () => {
  const a = await browser.newContext();
  const pa = await open(a);
  await signInAs(pa, "c6");
  await tickOne(pa);
  const b = await browser.newContext();
  const pb = await open(b);
  await signInAs(pb, "c6");
  await pb.click(".acc-btn");
  await pb.getByRole("menuitem", { name: "Delete my account" }).click();
  await pb.getByRole("button", { name: "Yes" }).click();
  await pb.getByRole("button", { name: "Delete forever" }).click();
  await pb.locator("#fake-google").waitFor();
  await pa.reload(); // device A still has its copy and its cookie is gone
  await signInAs(pa, "c6");
  assert.equal((await serverDoc(a)).data, null);
  assert.equal(checksCount(await local(pa)), 0);
  await a.close();
  await b.close();
});

// ---- prayer location ----
const GEO = { results: [{ name: "Istanbul", admin1: "Istanbul", country: "Türkiye", latitude: 41.01384, longitude: 28.94966 }] };

test("picking a place changes the prayer times", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await page.route(/geocoding-api\.open-meteo\.com/, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(GEO) }));
  await signInAs(page, "p1");
  const card = page.locator("#prayer-times");
  await card.getByRole("button", { name: "Change" }).click();
  await page.getByPlaceholder("Search a town or city").fill("Ista");
  await page.getByRole("button", { name: /Istanbul, Istanbul, Türkiye/ }).click();
  await card.getByText("İstanbul").first().waitFor({ timeout: 10000 });
  await card.getByText(FAKE_TIMES.ogle).first().waitFor();
  await page.waitForTimeout(3000);
  const place = (await serverDoc(ctx)).data.settings.place;
  assert.equal(place.cityId, 5041);
  assert.equal(place.name, "Istanbul");
  await ctx.close();
});

test("search failure keeps the place", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await page.route(/geocoding-api\.open-meteo\.com/, (r) => r.abort());
  await signInAs(page, "p2");
  const card = page.locator("#prayer-times");
  await card.getByRole("button", { name: "Change" }).click();
  await page.getByPlaceholder("Search a town or city").fill("Ista");
  await page.getByText("Could not search right now").waitFor({ timeout: 10000 });
  await page.keyboard.press("Escape");
  await card.getByText("Coventry").first().waitFor();
  await ctx.close();
});

// ---- Muslim mode ----
test("Muslim mode off hides every Islamic part and on brings it back", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await signInAs(page, "m1");
  await page.locator("#salah .hg-box:not(.done)").first().click(); // a salah tick that must survive
  const islamic = {
    verse: page.locator(".hx-verse"),
    salahTable: page.locator("#salah"),
    prayerTimes: page.locator("#prayer-times"),
    salahMonth: page.getByRole("heading", { name: "Salah this month" }),
    todaySalah: page.getByText("Today's salah"),
    salahStreak: page.getByText("all 5 salah"),
    allDaysSalah: page.getByText("Main salah prayed"),
  };
  for (const [k, l] of Object.entries(islamic)) assert.ok((await l.count()) > 0, `${k} shown when on`);

  const toggle = async () => {
    await page.click(".gear");
    await page.getByRole("switch", { name: "Muslim mode" }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  };
  await toggle();
  for (const [k, l] of Object.entries(islamic)) assert.equal(await l.count(), 0, `${k} hidden when off`);
  await page.click(".gear");
  for (const name of ["Prayer alarm", "Prayer times", "Salah table", "Quran verse"]) assert.equal(await page.getByRole("switch", { name }).count(), 0, `${name} switch hidden`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3000);
  const saved = (await serverDoc(ctx)).data;
  assert.equal(saved.settings.muslim, false);
  assert.ok(Object.keys(saved.state.salah).length > 0, "salah ticks are kept");

  await toggle();
  for (const [k, l] of Object.entries(islamic)) assert.ok((await l.count()) > 0, `${k} back when on`);
  await ctx.close();
});

// ---- Clock ----
async function openClock(page) {
  await page.locator(".clk-btn").click();
  await page.getByRole("dialog", { name: "Clock" }).waitFor();
}

test("clock button opens the full-screen clock with three tabs", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await open(ctx);
  await signInAs(page, "k1");
  await openClock(page);
  const box = await page.getByRole("dialog", { name: "Clock" }).boundingBox();
  assert.ok(box.width >= 1270 && box.height >= 750, "full screen");
  for (const name of ["Alarms", "Timer", "Stopwatch"]) await page.getByRole("tab", { name }).waitFor();
  await page.getByRole("button", { name: "Close clock" }).click();
  assert.equal(await page.getByRole("dialog", { name: "Clock" }).count(), 0);
  await ctx.close();
});

test("an alarm rings at its time and Stop silences it", async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const t = new Date();
  t.setHours(6, 59, 30, 0);
  await page.clock.install({ time: t });
  await page.route("https://accounts.google.com/gsi/client", (r) => r.fulfill({ contentType: "text/javascript", body: FAKE_GIS }));
  await page.route(/api\.alquran\.cloud|quotable|fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(W);
  await signInAs(page, "k2");
  await openClock(page);
  await page.getByRole("button", { name: "Add alarm" }).click();
  await page.getByLabel("Alarm time").fill("07:00");
  await page.getByLabel("Alarm name").fill("Gym");
  await page.getByRole("button", { name: "Save alarm" }).click();
  await page.getByText("Rings in less than a minute").first().waitFor();
  await page.getByRole("button", { name: "Close clock" }).click();
  await page.clock.fastForward(45000);
  await page.getByRole("alertdialog", { name: "Alarm" }).waitFor({ timeout: 10000 });
  await page.getByRole("alertdialog").getByText("Gym").waitFor();
  await page.getByRole("alertdialog").getByRole("button", { name: "Stop" }).click();
  assert.equal(await page.getByRole("alertdialog").count(), 0);
  await openClock(page);
  assert.equal(await page.getByRole("switch", { name: /Gym/ }).getAttribute("aria-checked"), "false", "a once-only alarm turns itself off");
  await ctx.close();
});

test("own timer of 1 min 30 s rings at the end", async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date() });
  await page.route("https://accounts.google.com/gsi/client", (r) => r.fulfill({ contentType: "text/javascript", body: FAKE_GIS }));
  await page.route(/api\.alquran\.cloud|quotable|fonts\.(googleapis|gstatic)/, (r) => r.abort());
  await page.goto(W);
  await signInAs(page, "k3");
  await openClock(page);
  await page.getByRole("tab", { name: "Timer" }).click();
  const dlg = page.getByRole("dialog", { name: "Clock" });
  await dlg.getByLabel("Minutes").fill("1");
  await dlg.getByLabel("Seconds").fill("30");
  await dlg.getByRole("button", { name: "Start" }).click();
  await page.getByText("01:30").first().waitFor();
  await page.clock.fastForward(92000);
  await page.getByRole("alertdialog", { name: "Time's up" }).waitFor({ timeout: 10000 });
  await page.getByRole("alertdialog").getByRole("button", { name: "Stop" }).click();
  await ctx.close();
});

test("stopwatch counts and records laps", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await signInAs(page, "k4");
  await openClock(page);
  await page.getByRole("tab", { name: "Stopwatch" }).click();
  const dlg = page.getByRole("dialog", { name: "Clock" });
  await dlg.getByRole("button", { name: "Start" }).click();
  await page.waitForTimeout(1200);
  await dlg.getByRole("button", { name: "Lap" }).click();
  await page.waitForTimeout(600);
  await dlg.getByRole("button", { name: "Stop" }).click();
  const shown = await page.locator(".sw-time").textContent();
  assert.notEqual(shown.trim(), "00:00.00");
  assert.equal(await page.locator(".sw-laps li").count(), 1);
  await dlg.getByRole("button", { name: "Reset" }).click();
  assert.equal((await page.locator(".sw-time").textContent()).trim(), "00:00.00");
  await ctx.close();
});

// ---- Notepad ----
async function openNotepad(page) {
  await page.locator(".np-btn").click();
  const win = page.getByRole("dialog", { name: "Notepad" });
  await win.waitFor();
  return win;
}
const editorOf = (page) => page.locator(".np-editor .ProseMirror");
function walk(node, out = []) {
  if (!node) return out;
  out.push(node);
  for (const c of node.content || []) walk(c, out);
  return out;
}

test("notepad opens as a window with the site visible behind", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await open(ctx);
  await signInAs(page, "n1");
  const win = await openNotepad(page);
  const b = await win.boundingBox();
  assert.ok(b.width > 1280 * 0.7 && b.width < 1280 * 0.9, `width ${b.width}`);
  assert.ok(b.height > 800 * 0.7 && b.height < 800 * 0.9, `height ${b.height}`);
  assert.ok(await page.locator("main.app").isVisible());
  await ctx.close();
});

test("typing in the notepad plays the key sound", async () => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    window.__sounds = 0;
    const AC = window.AudioContext;
    const orig = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () {
      window.__sounds++;
      return orig.call(this);
    };
    const origB = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function () {
      window.__sounds++;
      return origB.call(this);
    };
  });
  const page = await open(ctx);
  await signInAs(page, "n2");
  await openNotepad(page);
  await editorOf(page).click();
  const before = await page.evaluate(() => window.__sounds);
  await page.keyboard.type("hello");
  const after = await page.evaluate(() => window.__sounds);
  assert.ok(after - before >= 5, `${after - before} sounds`);
  await ctx.close();
});

test("formatting applies to the selection", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await signInAs(page, "n3");
  const win = await openNotepad(page);
  await editorOf(page).click();
  await page.keyboard.type("hello world");
  await editorOf(page).getByText("hello world").dblclick({ position: { x: 60, y: 8 } }); // selects "world"
  await win.getByRole("button", { name: "Text colour red" }).click();
  await win.getByLabel("Text size").selectOption("32px");
  await win.getByRole("button", { name: "Highlight yellow" }).click();
  await win.getByLabel("Font").selectOption("Georgia, serif");
  await page.waitForTimeout(3000);
  const nodes = walk((await serverDoc(ctx)).data.state.notes);
  const world = nodes.find((n) => n.type === "text" && n.text.includes("world"));
  assert.ok(world, "world saved");
  const ts = world.marks.find((m) => m.type === "textStyle");
  assert.deepEqual(ts.attrs, { color: "#ff5c5c", fontSize: "32px", fontFamily: "Georgia, serif" });
  assert.deepEqual(world.marks.find((m) => m.type === "highlight").attrs, { color: "#ffd84c" });
  const hello = nodes.find((n) => n.type === "text" && n.text.startsWith("hello"));
  assert.ok(!hello.marks, "the rest is not formatted");
  await ctx.close();
});

test("note survives a quick close", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await signInAs(page, "n4");
  await openNotepad(page);
  await editorOf(page).click();
  await page.keyboard.type("quick note");
  await page.waitForTimeout(300);
  await page.reload();
  await page.locator("main.app").waitFor({ timeout: 20000 });
  await openNotepad(page);
  await editorOf(page).getByText("quick note").waitFor();
  await ctx.close();
});

test("note shows on another device", async () => {
  const a = await browser.newContext();
  const pa = await open(a);
  await signInAs(pa, "n5");
  await openNotepad(pa);
  await editorOf(pa).click();
  await pa.keyboard.type("from device A");
  await pa.waitForTimeout(3000);
  const b = await browser.newContext();
  const pb = await open(b);
  await signInAs(pb, "n5");
  await openNotepad(pb);
  await editorOf(pb).getByText("from device A").waitFor();
  await a.close();
  await b.close();
});

test("paste keeps only allowed styles", async () => {
  const ctx = await browser.newContext();
  const page = await open(ctx);
  await signInAs(page, "n6");
  await openNotepad(page);
  await editorOf(page).click();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/html", '<h1>Title</h1><p><a href="javascript:alert(1)">link</a> <span style="font-size:99px;color:red">big</span> <b>bold</b><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1"></p>');
    dt.setData("text/plain", "Title link big bold");
    document.querySelector(".np-editor .ProseMirror").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(3000);
  const ed = editorOf(page);
  assert.equal(await ed.locator("a, h1, script, img, [style*='99px']").count(), 0);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  const nodes = walk((await serverDoc(ctx)).data.state.notes);
  const text = nodes.filter((n) => n.type === "text").map((n) => n.text).join("");
  assert.match(text, /Title/);
  assert.match(text, /big/);
  assert.ok(nodes.some((n) => n.marks?.some((m) => m.type === "bold")), "bold is allowed");
  assert.ok(!JSON.stringify(nodes).includes("99px") && !JSON.stringify(nodes).includes('"red"'));
  await ctx.close();
});

test("resize and full size work", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await open(ctx);
  await signInAs(page, "n7");
  const win = await openNotepad(page);
  const b0 = await win.boundingBox();
  const h = await page.locator(".np-resize").boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x - 200, h.y - 150, { steps: 8 });
  await page.mouse.up();
  const b1 = await win.boundingBox();
  assert.ok(b1.width < b0.width - 150 && b1.height < b0.height - 100, "smaller");
  await win.getByRole("button", { name: "Full size" }).click();
  const b2 = await win.boundingBox();
  assert.ok(b2.width >= 1270 && b2.height >= 790, "full size");
  await win.getByRole("button", { name: "Normal size" }).click();
  await win.getByRole("button", { name: "Close notepad" }).click();
  assert.equal(await page.getByRole("dialog", { name: "Notepad" }).count(), 0);
  await ctx.close();
});
