// Browser test of sign-in and online saving: `npm run build && npm run test:browser`.
// Runs the real app in Edge against `wrangler dev --local`. Google's sign-in script is swapped for a stand-in
// button that hands the app a token signed by the test key (the Worker checks it exactly like a real one).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { W, startWorker, stopWorker, googleToken } from "./harness.mjs";

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
async function serverDoc(ctx) {
  const cookie = (await ctx.cookies()).find((c) => c.name === "mfs_session");
  const res = await fetch(W + "/api/data", { headers: { cookie: `mfs_session=${cookie.value}` } });
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
  await signInAs(page, "b5");
  assert.deepEqual((await serverDoc(ctx)).data, doc);

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
