// Sign-in sessions. The browser holds a random token in an HttpOnly cookie; D1 keeps only its SHA-256.
import { json } from "./http.js";
import { verifyGoogleIdToken, googleKeys } from "./google.js";

const COOKIE = "mfs_session";
const DAY = 86400;
const LIFE_S = 30 * DAY;
const RENEW_BELOW_S = 15 * DAY;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const nowS = () => Math.floor(Date.now() / 1000);

const cookieHeader = (token, maxAge) => `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
export const clearCookie = () => cookieHeader("", 0);

function readCookie(request) {
  const m = /(?:^|;\s*)mfs_session=([0-9a-f]{64})(?:;|$)/.exec(request.headers.get("Cookie") || "");
  return m ? m[1] : null;
}

// Every POST/PUT/DELETE must come from this site's own pages (stops other sites using a signed-in visitor's cookie).
export function requireSameOrigin(request, env) {
  if (request.method === "GET" || request.method === "HEAD") return null;
  const origin = request.headers.get("Origin");
  const allowed = [new URL(request.url).origin, ...String(env.EXTRA_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)];
  return origin && allowed.includes(origin) ? null : json({ error: "forbidden" }, 403);
}

// The signed-in user for this request, or null. Sessions with under 15 days left get 30 more days.
export async function getUser(request, env) {
  const token = readCookie(request);
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT u.id, u.email, u.name, u.picture, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?"
  ).bind(hash).first();
  if (!row || row.expires_at < nowS()) return null;
  const user = { id: row.id, email: row.email, name: row.name, picture: row.picture };
  if (row.expires_at - nowS() < RENEW_BELOW_S) {
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").bind(nowS() + LIFE_S, hash).run();
    user.renewCookie = cookieHeader(token, LIFE_S);
  }
  return user;
}

export const publicUser = ({ id, email, name, picture }) => ({ id, email, name, picture });

export async function login(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }
  let g;
  try {
    g = await verifyGoogleIdToken(body?.credential, env.GOOGLE_CLIENT_ID, { getKeys: googleKeys(env) });
  } catch {
    return json({ error: "sign-in failed" }, 401);
  }
  const t = nowS();
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO users (id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture"
    ).bind(g.sub, g.email, g.name, g.picture, t),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(t),
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), g.sub, t + LIFE_S),
  ]);
  return json({ user: { id: g.sub, email: g.email, name: g.name, picture: g.picture } }, 200, { "Set-Cookie": cookieHeader(token, LIFE_S) });
}

export async function logout(request, env) {
  const token = readCookie(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
}
