import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyGoogleIdToken } from "./google.js";

const keys = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"]
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1", alg: "RS256" };
const getKeys = async () => [jwk];
const b64u = (x) => Buffer.from(typeof x === "string" ? x : new Uint8Array(x)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const good = { iss: "https://accounts.google.com", aud: "cid", sub: "123", email: "a@b.c", email_verified: true, name: "A", picture: "p", exp: now + 600, iat: now };

async function sign(claims, header = { alg: "RS256", kid: "k1", typ: "JWT" }) {
  const h = b64u(JSON.stringify(header));
  const b = b64u(JSON.stringify(claims));
  const s = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(`${h}.${b}`));
  return `${h}.${b}.${b64u(s)}`;
}
const check = (t) => verifyGoogleIdToken(t, "cid", { getKeys });

test("valid token returns the user", async () => {
  assert.deepEqual(await check(await sign(good)), { sub: "123", email: "a@b.c", name: "A", picture: "p" });
});

test('iss "accounts.google.com" also accepted', async () => {
  assert.equal((await check(await sign({ ...good, iss: "accounts.google.com" }))).sub, "123");
});

const bad = {
  "wrong aud": () => sign({ ...good, aud: "other" }),
  "wrong iss": () => sign({ ...good, iss: "https://evil.example" }),
  "expired": () => sign({ ...good, exp: now - 3600 }),
  "email not verified": () => sign({ ...good, email_verified: false }),
  "unknown kid": () => sign(good, { alg: "RS256", kid: "nope" }),
  "payload changed after signing": async () => {
    const [h, , s] = (await sign(good)).split(".");
    return `${h}.${b64u(JSON.stringify({ ...good, sub: "999" }))}.${s}`;
  },
  'alg "none"': async () => `${b64u(JSON.stringify({ alg: "none", kid: "k1" }))}.${b64u(JSON.stringify(good))}.`,
  "not three parts": async () => "abc.def",
  "not a string": async () => 42,
};
for (const [name, make] of Object.entries(bad)) {
  test(`rejects: ${name}`, async () => {
    await assert.rejects(check(await make()), /bad token/);
  });
}

test("unknown kid refetches keys once", async () => {
  let calls = 0;
  const keysLater = async (force) => {
    calls++;
    return force ? [jwk] : [{ ...jwk, kid: "old" }];
  };
  const user = await verifyGoogleIdToken(await sign(good), "cid", { getKeys: keysLater });
  assert.equal(user.sub, "123");
  assert.equal(calls, 2);
});
