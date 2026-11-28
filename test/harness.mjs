// Test harness: starts `wrangler dev --local` on :8787 (local D1, nothing touches Cloudflare) and a fake Google key server on :8790.
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, execSync } from "node:child_process";
import { rmSync } from "node:fs";

export const W = "http://127.0.0.1:8787";
const CLIENT_ID = "test-client";
let wrangler;
let keyServer;
let nvServer;

// fake namazvakitleri city page: same shape as the real one, times for the next 40 days
export const FAKE_TIMES = { imsak: "06:28", gunes: "07:58", ogle: "12:57", ikindi: "15:23", aksam: "17:45", yatsi: "19:10" };
function fakeCityPage(id) {
  const rows = [];
  for (let i = -2; i < 40; i++) {
    const d = new Date(Date.now() + i * 86400000);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    rows.push({ date, ...FAKE_TIMES });
  }
  const city = { id: Number(id), name: id === "5041" ? "İstanbul" : `City ${id}`, country: { name: "Türkiye" } };
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { city, data: { PrayerTimes: rows } } } })}</script>`;
}

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
export const req = (path, { method = "GET", body, cookie, client = Math.random().toString(36).slice(2), origin = method === "GET" ? undefined : W } = {}) =>
  fetch(W + path, {
    method,
    redirect: "manual",
    headers: { "x-test-client": client, ...(body !== undefined && { "content-type": "application/json" }), ...(cookie && { cookie }), ...(origin && { origin }) },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
export const cookieOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0];
export async function signIn(sub) {
  const res = await req("/api/login", { method: "POST", body: { credential: await googleToken(sub) } });
  assert.equal(res.status, 200);
  return cookieOf(res);
}

// limits: daily caps for this run (the e2e tests use small ones to reach them; the browser tests make many calls)
export async function startWorker(limits = { DAILY_USER: 100, DAILY_SAVES: 5, DAILY_VISITOR: 30 }) {
  keyServer = http.createServer((q, r) => {
    r.setHeader("content-type", "application/json");
    r.setHeader("cache-control", "public, max-age=3600");
    r.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((ok) => keyServer.listen(8790, "127.0.0.1", ok));
  nvServer = http.createServer((q, r) => {
    const m = /\/city\/(\d+)\//.exec(q.url);
    r.setHeader("content-type", "text/html");
    r.end(m ? fakeCityPage(m[1]) : "");
  });
  await new Promise((ok) => nvServer.listen(8792, "127.0.0.1", ok));
  rmSync(".wrangler/state", { recursive: true, force: true });
  execSync("npx wrangler d1 execute my-future-self --local --file worker/schema.sql", { stdio: "ignore" });
  wrangler = spawn(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--port", "8787", "--ip", "127.0.0.1", "--show-interactive-dev-session=false",
      "--var", `GOOGLE_CLIENT_ID:${CLIENT_ID}`, "--var", "JWKS_URL:http://127.0.0.1:8790/certs", "--var", "PRAYER_URL:http://127.0.0.1:9/", "--var", "TEST_MODE:1", "--var", "PRAYER_BASE:http://127.0.0.1:8792",
      // small daily limits so the tests can reach them (live: 800 calls, 600 saves, 200 before sign-in)
      ...Object.entries(limits).flatMap(([k, v]) => ["--var", `${k}:${v}`])],
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
}

export function stopWorker() {
  keyServer?.close();
  nvServer?.close();
  if (wrangler) {
    try {
      if (process.platform === "win32") execSync(`taskkill /pid ${wrangler.pid} /t /f`, { stdio: "ignore" });
      else wrangler.kill();
    } catch {
      /* already stopped */
    }
  }
}
