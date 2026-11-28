// My Future Self Worker. Static files come from dist/ without running this code;
// only /api/* and /prayer-times.json reach fetch() below (see run_worker_first in wrangler.jsonc).
import { json, limit, clientKey } from "./http.js";
import { requireSameOrigin, getUser, publicUser, login, logout, logoutAll } from "./session.js";
import { getData, putData, deleteAccount } from "./data.js";
import { prayerTimes, prayerCity } from "./prayer.js";
import { dailyLimits, countCall } from "./quota.js";

// Per-minute limit (only blocks on a custom domain, not on workers.dev), then the daily limit (works everywhere).
// Signed in: counted per account (many people can share one school or phone-network address); otherwise per address.
// Saves are counted inside the save itself (data.js), so they skip the daily call count here.
async function gate(request, env, user, isSave = false) {
  const ip = clientKey(request, env);
  const tooMany = await limit(env.RL_API, user ? `user:${user.id}` : `api:${ip}`);
  if (tooMany || isSave) return tooMany;
  const max = dailyLimits(env);
  return countCall(env, user ? `u:${user.id}` : `ip:${ip}`, user ? max.user : max.visitor);
}

async function api(request, env, path) {
  const refused = requireSameOrigin(request, env);
  if (refused) return refused;
  const m = request.method;

  if (path === "/api/login" && m === "POST") {
    const ip = clientKey(request, env);
    return (await limit(env.RL_LOGIN, `login:${ip}`)) || (await countCall(env, `ip:${ip}`, dailyLimits(env).visitor)) || login(request, env);
  }

  const user = await getUser(request, env);
  const tooMany = await gate(request, env, user, !!user && path === "/api/data" && m === "PUT");
  if (tooMany) return tooMany;
  if (path === "/api/prayer-city" && m === "GET") return prayerCity(request);
  if (path === "/api/logout" && m === "POST") return logout(request, env);
  const renew = user?.renewCookie ? { "Set-Cookie": user.renewCookie } : {};
  if (path === "/api/me" && m === "GET") return json({ user: user ? publicUser(user) : null }, 200, renew);

  if (path !== "/api/data" && path !== "/api/account" && path !== "/api/logout-all") return json({ error: "not found" }, 404);
  if (!user) return json({ error: "sign in first" }, 401);
  if (path === "/api/data" && m === "GET") return json(await getData(env, user), 200, renew);
  if (path === "/api/data" && m === "PUT") return (await limit(env.RL_WRITE, `write:${user.id}`)) || putData(request, env, user, dailyLimits(env).saves);
  if (path === "/api/logout-all" && m === "POST") return logoutAll(request, env, user);
  if (path === "/api/account" && m === "DELETE") return deleteAccount(env, user);

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname.startsWith("/api/")) return await api(request, env, pathname);
      if (pathname === "/prayer-times.json") return (await gate(request, env, await getUser(request, env))) || (await prayerTimes(request, env, ctx));
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error("worker error:", e?.message); // never log tokens, emails, notes or cookies
      return json({ error: "server error" }, 500);
    }
  },
};
