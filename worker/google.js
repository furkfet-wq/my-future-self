// Checks a Google sign-in ID token (a JWT signed by Google) with Web Crypto only.
// Any problem -> Error("bad token"); the caller never learns which check failed.

const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const SKEW_S = 60;
const enc = new TextEncoder();

function b64uBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
const b64uJson = (s) => JSON.parse(new TextDecoder().decode(b64uBytes(s)));

export async function verifyGoogleIdToken(token, clientId, { getKeys, now = Date.now() }) {
  try {
    if (typeof token !== "string" || !clientId) throw 0;
    const parts = token.split(".");
    if (parts.length !== 3) throw 0;
    const [h, b, s] = parts;
    const header = b64uJson(h);
    if (header.alg !== "RS256" || typeof header.kid !== "string") throw 0;
    // Google rotates its keys: an unknown key id gets one fresh download of the key set
    const jwk = (await getKeys()).find((k) => k.kid === header.kid) || (await getKeys(true)).find((k) => k.kid === header.kid);
    if (!jwk) throw 0;
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64uBytes(s), enc.encode(`${h}.${b}`));
    if (!ok) throw 0;
    const c = b64uJson(b);
    const t = Math.floor(now / 1000);
    if (!ISSUERS.has(c.iss) || c.aud !== clientId) throw 0;
    if (typeof c.exp !== "number" || c.exp + SKEW_S < t) throw 0;
    if (typeof c.iat === "number" && c.iat - SKEW_S > t) throw 0;
    if (c.email_verified !== true || typeof c.sub !== "string" || !c.sub) throw 0;
    return { sub: c.sub, email: String(c.email || ""), name: String(c.name || ""), picture: String(c.picture || "") };
  } catch {
    throw new Error("bad token");
  }
}

// Google's public keys, kept in memory until their Cache-Control max-age runs out.
let cached = { keys: null, until: 0 };
let lastForced = 0;
export function googleKeys(env) {
  const url = env.JWKS_URL || "https://www.googleapis.com/oauth2/v3/certs";
  return async (force = false) => {
    const fresh = cached.keys && Date.now() < cached.until && cached.url === url;
    if (fresh && !(force && Date.now() - lastForced > 60000)) return cached.keys;
    if (force) lastForced = Date.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error("keys unavailable");
    const { keys } = await res.json();
    const age = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1] || 3600);
    cached = { keys, url, until: Date.now() + Math.min(age, 86400) * 1000 };
    return keys;
  };
}
