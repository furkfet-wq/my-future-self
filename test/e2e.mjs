// End-to-end tests for the Worker: `npm run build && npm run test:e2e`.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { W, startWorker, stopWorker, googleToken, req, cookieOf, signIn } from "./harness.mjs";

before(() => startWorker()); // default (small) daily limits
after(stopWorker);

// ---- Task 1 ----
test("unknown api path is 404 json", async () => {
  const res = await req("/api/nope");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not found" });
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

// ---- Task 3: sign-in sessions ----
test("login sets an HttpOnly session cookie", async () => {
  const res = await req("/api/login", { method: "POST", body: { credential: await googleToken("u1") } });
  assert.equal(res.status, 200);
  const set = res.headers.get("set-cookie");
  for (const part of ["mfs_session=", "HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=2592000"]) assert.ok(set.includes(part), `cookie has ${part}`);
  const body = await res.json();
  assert.equal(body.user.id, "u1");
  assert.equal(body.user.email, "u1@example.com");
  const me = await (await req("/api/me", { cookie: cookieOf(res) })).json();
  assert.equal(me.user.id, "u1");
});

test("me without cookie is null", async () => {
  assert.deepEqual(await (await req("/api/me")).json(), { user: null });
  assert.deepEqual(await (await req("/api/me", { cookie: "mfs_session=deadbeef" })).json(), { user: null });
});

test("bad credential is 401", async () => {
  assert.equal((await req("/api/login", { method: "POST", body: { credential: "x.y.z" } })).status, 401);
  assert.equal((await req("/api/login", { method: "POST", body: { credential: await googleToken("u1", { aud: "other" }) } })).status, 401);
  assert.equal((await req("/api/login", { method: "POST", body: "not json" })).status, 400);
});

test("foreign origin is refused", async () => {
  const credential = await googleToken("u1");
  assert.equal((await req("/api/login", { method: "POST", body: { credential }, origin: "https://evil.example" })).status, 403);
  assert.equal((await req("/api/login", { method: "POST", body: { credential }, origin: "" })).status, 403);
});

test("logout ends the session", async () => {
  const cookie = await signIn((USER = "u2"));
  const out = await req("/api/logout", { method: "POST", cookie });
  assert.equal(out.status, 200);
  assert.ok(out.headers.get("set-cookie").includes("Max-Age=0"));
  assert.deepEqual(await (await req("/api/me", { cookie })).json(), { user: null });
});

// ---- Task 4: saved data ----
let USER; // the account each test is signed in as
const doc = (n) => ({ v: 1, state: { habits: [{ id: "h", name: `Habit ${n}` }], checks: {}, logs: {}, salah: {}, startBalance: n, notes: null, alarms: [], reminders: {} }, settings: {} });

test("new account has no data", async () => {
  const cookie = await signIn((USER = "d1"));
  assert.deepEqual(await (await req("/api/data", { cookie })).json(), { data: null, version: 0 });
});

test("put then get round-trips", async () => {
  const cookie = await signIn((USER = "d2"));
  const put = await req("/api/data", { method: "PUT", cookie, body: { data: doc(1), version: 0, user: USER } });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { version: 1 });
  assert.deepEqual(await (await req("/api/data", { cookie })).json(), { data: doc(1), version: 1 });
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: doc(2), version: 1, user: USER } })).status, 200);
  assert.deepEqual(await (await req("/api/data", { cookie })).json(), { data: doc(2), version: 2 });
});

test("stale version gets 409", async () => {
  const cookie = await signIn((USER = "d3"));
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: doc(1), version: 0, user: USER } })).status, 200);
  const second = await req("/api/data", { method: "PUT", cookie, body: { data: doc(2), version: 0, user: USER } });
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), { data: doc(1), version: 1 });
});

test("too big is 413", async () => {
  const cookie = await signIn((USER = "d4"));
  const big = doc(1);
  big.settings.pad = "x".repeat(1_100_000); // over the limit as sent (the server would drop this field anyway)
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: big, version: 0, user: USER } })).status, 413);
});

test("invalid doc is 400", async () => {
  const cookie = await signIn((USER = "d5"));
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: { v: 1 }, version: 0, user: USER } })).status, 400);
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: doc(1), version: "0", user: USER } })).status, 400);
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: "{" })).status, 400);
});

test("data needs sign-in", async () => {
  assert.equal((await req("/api/data")).status, 401);
  assert.equal((await req("/api/data", { method: "PUT", body: { data: doc(1), version: 0, user: USER } })).status, 401);
  assert.equal((await req("/api/account", { method: "DELETE" })).status, 401);
});

test("one account cannot read another's data", async () => {
  const a = await signIn("pa");
  const b = await signIn("pb");
  USER = "pa";
  await req("/api/data", { method: "PUT", cookie: a, body: { data: doc(7), version: 0, user: USER } });
  assert.deepEqual(await (await req("/api/data", { cookie: b })).json(), { data: null, version: 0 });
});

test("delete account removes everything", async () => {
  const cookie = await signIn((USER = "gone"));
  await req("/api/data", { method: "PUT", cookie, body: { data: doc(3), version: 0, user: USER } });
  const del = await req("/api/account", { method: "DELETE", cookie });
  assert.equal(del.status, 200);
  assert.ok(del.headers.get("set-cookie").includes("Max-Age=0"));
  assert.deepEqual(await (await req("/api/me", { cookie })).json(), { user: null });
  const again = await signIn("gone");
  assert.deepEqual(await (await req("/api/data", { cookie: again })).json(), { data: null, version: 0 });
});

// ---- Task 5: prayer times + page headers ----
test("prayer times answer rows (fallback when the site fails)", async () => {
  const res = await req("/prayer-times.json");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.rows) && body.rows.length >= 7);
  assert.ok(body.rows[0].date && body.rows[0].imsak);
});

test("pages carry the CSP header", async () => {
  const res = await req("/");
  assert.equal(res.status, 200);
  const csp = res.headers.get("content-security-policy") || "";
  assert.ok(csp.includes("default-src 'self'") && csp.includes("https://accounts.google.com/gsi/client"));
  assert.equal(res.headers.get("cross-origin-opener-policy"), "same-origin-allow-popups");
});

// ---- final review fixes ----
test("a save naming another account is refused", async () => {
  const cookie = await signIn((USER = "own"));
  const res = await req("/api/data", { method: "PUT", cookie, body: { data: doc(1), version: 0, user: "someone-else" } });
  assert.equal(res.status, 403);
  assert.deepEqual(await (await req("/api/data", { cookie })).json(), { data: null, version: 0 });
});

test("the server keeps only a cleaned copy", async () => {
  const cookie = await signIn((USER = "clean"));
  const d = doc(1);
  d.state.logs = { "2026-11-27": { feel: 4, junk: "x" }, "2000-01-01": null };
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: d, version: 0, user: USER } })).status, 200);
  assert.deepEqual((await (await req("/api/data", { cookie })).json()).data.state.logs, { "2026-11-27": { feel: 4 } });
});

// ---- security pass ----
test("cookie uses the __Host- prefix", async () => {
  const res = await req("/api/login", { method: "POST", body: { credential: await googleToken("hp") } });
  const set = res.headers.get("set-cookie");
  assert.ok(set.startsWith("__Host-mfs_session="), set);
  assert.ok(!/Domain=/i.test(set));
});

test("sign out everywhere ends other sessions", async () => {
  const one = await signIn("everywhere");
  const two = await signIn("everywhere");
  const res = await req("/api/logout-all", { method: "POST", cookie: one });
  assert.equal(res.status, 200);
  assert.deepEqual(await (await req("/api/me", { cookie: two })).json(), { user: null });
  assert.deepEqual(await (await req("/api/me", { cookie: one })).json(), { user: null });
});

test("login is rate limited", async () => {
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await req("/api/login", { method: "POST", body: { credential: "x.y.z" }, client: "flood" })).status);
  assert.ok(statuses.includes(429), statuses.join(","));
  // someone else is not affected
  assert.equal((await req("/api/login", { method: "POST", body: { credential: "x.y.z" }, client: "other-person" })).status, 401);
});

test("security headers are on pages and API", async () => {
  for (const path of ["/", "/api/me"]) {
    const h = (await req(path)).headers;
    assert.match(h.get("strict-transport-security") || "", /max-age=31536000/, path);
    assert.match(h.get("permissions-policy") || "", /camera=\(\)/, path);
    assert.equal(h.get("x-frame-options"), "DENY", path);
  }
});

// ---- prayer place ----
test("nearest prayer city for coordinates", async () => {
  const res = await req("/api/prayer-city?lat=41.01&lon=28.98");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).id, 5041);
});

test("bad coordinates are 400", async () => {
  for (const q of ["lat=95&lon=0", "lat=abc&lon=1", "lat=1", ""]) assert.equal((await req(`/api/prayer-city?${q}`)).status, 400, q);
});

test("signed-in calls are limited per account, not per shared address", async () => {
  const a = await signIn("shared-a");
  const b = await signIn("shared-b");
  const statuses = [];
  for (let i = 0; i < 70; i++) {
    statuses.push((await req("/api/data", { cookie: a, client: "school-wifi" })).status);
    statuses.push((await req("/api/data", { cookie: b, client: "school-wifi" })).status);
  }
  assert.ok(statuses.every((s) => s === 200), `got ${[...new Set(statuses)].join(",")}`);
});

// ---- daily limits (tests run with DAILY_USER 100, DAILY_SAVES 5, DAILY_VISITOR 30) ----
test("saves stop at the daily limit, without changing the data", async () => {
  const cookie = await signIn((USER = "quota-saves"));
  let v = 0;
  for (let i = 1; i <= 5; i++) {
    const r = await req("/api/data", { method: "PUT", cookie, body: { data: doc(i), version: v, user: USER } });
    assert.equal(r.status, 200, `save ${i}`);
    v = (await r.json()).version;
  }
  const over = await req("/api/data", { method: "PUT", cookie, body: { data: doc(99), version: v, user: USER } });
  assert.equal(over.status, 429);
  const wait = Number(over.headers.get("retry-after"));
  assert.ok(wait > 0 && wait <= 86400, `retry-after ${wait}`);
  assert.deepEqual(await (await req("/api/data", { cookie })).json(), { data: doc(5), version: 5 });
  // a stale save is still a conflict, not a limit
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: doc(98), version: 1, user: USER } })).status, 409);
});

test("calls stop at the daily limit per account; others are not affected", async () => {
  const a = await signIn("quota-calls-a");
  const b = await signIn("quota-calls-b");
  const statuses = [];
  for (let i = 0; i < 105; i++) statuses.push((await req("/api/me", { cookie: a, client: "same-wifi" })).status);
  assert.equal(statuses.filter((s) => s === 200).length, 100, `got ${[...new Set(statuses)].join(",")}`);
  assert.equal(statuses.at(-1), 429);
  assert.equal((await req("/api/me", { cookie: b, client: "same-wifi" })).status, 200);
  // saves have their own count
  assert.equal((await req("/api/data", { method: "PUT", cookie: a, body: { data: doc(1), version: 0, user: "quota-calls-a" } })).status, 200);
});

test("visitors (not signed in) stop at the daily limit per address", async () => {
  const statuses = [];
  for (let i = 0; i < 32; i++) statuses.push((await req("/prayer-times.json", { client: "visitor-x" })).status);
  assert.ok(statuses.slice(0, 30).every((s) => s !== 429), statuses.join(","));
  assert.equal(statuses.at(-1), 429);
  assert.equal((await req("/api/login", { method: "POST", body: { credential: "x.y.z" }, client: "visitor-x" })).status, 429);
  assert.equal((await req("/api/me", { client: "visitor-y" })).status, 200);
});
