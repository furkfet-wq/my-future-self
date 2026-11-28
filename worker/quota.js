// Daily limits per account (and per address before sign-in), so one person can never use up the free
// Cloudflare plan: 100,000 Worker requests and 100,000 D1 row writes a day for the whole account,
// shared with the Flame SMP store Worker. Days reset at 00:00 UTC, the same time Cloudflare's do.
//
// Budget at the default limits, everyone maxing out: 50 accounts x (800 calls + 600 saves) = 70,000 requests
// and at most 70,000 writes (each counted call is one write, each save is one write), leaving room for the store.
// Over the limit -> 429 with Retry-After = seconds to midnight UTC; refused calls write nothing.
import { json } from "./http.js";

const DEFAULTS = { user: 800, saves: 600, visitor: 200 };

// Wrangler vars DAILY_USER / DAILY_SAVES / DAILY_VISITOR can change them (the tests use small ones).
export function dailyLimits(env) {
  const pick = (v, d) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return { user: pick(env.DAILY_USER, DEFAULTS.user), saves: pick(env.DAILY_SAVES, DEFAULTS.saves), visitor: pick(env.DAILY_VISITOR, DEFAULTS.visitor) };
}

export const today = () => Math.floor(Date.now() / 86400000);
const secondsToReset = () => 86400 - (Math.floor(Date.now() / 1000) % 86400);

export const overDailyLimit = () => json({ error: "daily limit reached" }, 429, { "Retry-After": String(secondsToReset()) });

// Counts one call for `key` ("u:<account>" or "ip:<address>"). One statement: the count only goes up
// while it is under `max`, so a refused call changes no row.
export async function countCall(env, key, max) {
  const row = await env.DB.prepare(
    `INSERT INTO usage (key, day, n) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET n = CASE WHEN usage.day = excluded.day THEN usage.n + 1 ELSE 1 END, day = excluded.day
     WHERE usage.day <> excluded.day OR usage.n < ?
     RETURNING n`
  )
    .bind(key, today(), max)
    .first();
  return row ? null : overDailyLimit();
}
