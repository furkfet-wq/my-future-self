// End-to-end tests for the Worker: `npm run build && npm run test:e2e`.
// Starts `wrangler dev --local` on :8787 (local D1, nothing touches Cloudflare) and a fake Google key server on :8790.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, execSync } from "node:child_process";
import { rmSync } from "node:fs";

export const W = "http://127.0.0.1:8787";
const CLIENT_ID = "test-client";
let wrangler;
let keyServer;

// ---- fake Google: one RSA key, served as JWKS, used to sign test ID tokens ----
const KID = "test-kid";
const keys = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"]
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: KID, alg: "RS256", use: "sig" };
const b64u = (buf) => Buffer.from(buf).toString("base64url");
export async function googleToken(sub, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT" }));
  const body = b64u(
    JSON.stringify({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub, email: `${sub}@example.com`, email_verified: true, name: `User ${sub}`, picture: "https://lh3.googleusercontent.com/x", iat: now, exp: now + 600, ...extra })
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(sig)}`;
}

// ---- helpers ----
export const req = (path, { method = "GET", body, cookie, origin = method === "GET" ? undefined : W } = {}) =>
  fetch(W + path, {
    method,
    redirect: "manual",
    headers: { ...(body !== undefined && { "content-type": "application/json" }), ...(cookie && { cookie }), ...(origin && { origin }) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
export const cookieOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0];
export async function signIn(sub) {
  const res = await req("/api/login", { method: "POST", body: { credential: await googleToken(sub) } });
  assert.equal(res.status, 200);
  return cookieOf(res);
}

before(async () => {
  keyServer = http.createServer((q, r) => {
    r.setHeader("content-type", "application/json");
    r.setHeader("cache-control", "public, max-age=3600");
    r.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((ok) => keyServer.listen(8790, "127.0.0.1", ok));
  rmSync(".wrangler/state", { recursive: true, force: true });
  execSync("npx wrangler d1 execute my-future-self --local --file worker/schema.sql", { stdio: "ignore" });
  wrangler = spawn(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--port", "8787", "--ip", "127.0.0.1", "--show-interactive-dev-session=false",
      "--var", `GOOGLE_CLIENT_ID:${CLIENT_ID}`, "--var", "JWKS_URL:http://127.0.0.1:8790/certs", "--var", "PRAYER_URL:http://127.0.0.1:9/"],
    { stdio: "ignore" }
  );
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(W + "/api/me");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("wrangler dev did not start");
});

after(() => {
  keyServer?.close();
  if (wrangler) {
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${wrangler.pid} /t /f`, { stdio: "ignore" });
      else wrangler.kill();
    } catch {
      /* already stopped */
    }
  }
});

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
  const cookie = await signIn("u2");
  const out = await req("/api/logout", { method: "POST", cookie });
  assert.equal(out.status, 200);
  assert.ok(out.headers.get("set-cookie").includes("Max-Age=0"));
  assert.deepEqual(await (await req("/api/me", { cookie })).json(), { user: null });
});

// ---- Task 4: saved data ----
const doc = (n) => ({ v: 1, state: { habits: [{ id: "h", name: `Habit ${n}` }], checks: {}, logs: {}, salah: {}, startBalance: n }, settings: {} });

test("new account has no data", async () => {
  const cookie = await signIn("d1");
  assert.deepEqual(await (await req("/api/data", { cookie })).json(), { data: null, version: 0 });
});

test("put then get round-trips", async () => {
  const cookie = await signIn("d2");
  const put = await req("/api/data", { method: "PUT", cookie, body: { data: doc(1), version: 0 } });
  assert.equal(put.status, 200);
  assert.deepEqual(await put.json(), { version: 1 });
  assert.deepEqual(await (await req("/api/data", { cookie })).json(), { data: doc(1), version: 1 });
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: doc(2), version: 1 } })).status, 200);
  assert.deepEqual(await (await req("/api/data", { cookie })).json(), { data: doc(2), version: 2 });
});

test("stale version gets 409", async () => {
  const cookie = await signIn("d3");
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: doc(1), version: 0 } })).status, 200);
  const second = await req("/api/data", { method: "PUT", cookie, body: { data: doc(2), version: 0 } });
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), { data: doc(1), version: 1 });
});

test("too big is 413", async () => {
  const cookie = await signIn("d4");
  const big = doc(1);
  big.settings.pad = "x".repeat(1_000_001);
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: big, version: 0 } })).status, 413);
});

test("invalid doc is 400", async () => {
  const cookie = await signIn("d5");
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: { v: 1 }, version: 0 } })).status, 400);
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: { data: doc(1), version: "0" } })).status, 400);
  assert.equal((await req("/api/data", { method: "PUT", cookie, body: "{" })).status, 400);
});

test("data needs sign-in", async () => {
  assert.equal((await req("/api/data")).status, 401);
  assert.equal((await req("/api/data", { method: "PUT", body: { data: doc(1), version: 0 } })).status, 401);
  assert.equal((await req("/api/account", { method: "DELETE" })).status, 401);
});

test("one account cannot read another's data", async () => {
  const a = await signIn("pa");
  const b = await signIn("pb");
  await req("/api/data", { method: "PUT", cookie: a, body: { data: doc(7), version: 0 } });
  assert.deepEqual(await (await req("/api/data", { cookie: b })).json(), { data: null, version: 0 });
});

test("delete account removes everything", async () => {
  const cookie = await signIn("gone");
  await req("/api/data", { method: "PUT", cookie, body: { data: doc(3), version: 0 } });
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
