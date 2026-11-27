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
