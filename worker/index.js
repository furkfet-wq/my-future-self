// My Future Self Worker. Static files come from dist/ without running this code;
// only /api/* and /prayer-times.json reach fetch() below (see run_worker_first in wrangler.jsonc).
import { json, limit, clientKey } from "./http.js";
import { requireSameOrigin, getUser, publicUser, login, logout, logoutAll } from "./session.js";
import { getData, putData, deleteAccount } from "./data.js";
import { prayerTimes } from "./prayer.js";

async function api(request, env, path) {
  const refused = requireSameOrigin(request, env);
  if (refused) return refused;
  const m = request.method;
  const ip = clientKey(request, env);
  const tooMany = await limit(env.RL_API, `api:${ip}`);
  if (tooMany) return tooMany;

  if (path === "/api/login" && m === "POST") return (await limit(env.RL_LOGIN, `login:${ip}`)) || login(request, env);
  if (path === "/api/logout" && m === "POST") return logout(request, env);

  const user = await getUser(request, env);
  const renew = user?.renewCookie ? { "Set-Cookie": user.renewCookie } : {};
  if (path === "/api/me" && m === "GET") return json({ user: user ? publicUser(user) : null }, 200, renew);

  if (path !== "/api/data" && path !== "/api/account" && path !== "/api/logout-all") return json({ error: "not found" }, 404);
  if (!user) return json({ error: "sign in first" }, 401);
  if (path === "/api/data" && m === "GET") return json(await getData(env, user), 200, renew);
  if (path === "/api/data" && m === "PUT") return (await limit(env.RL_WRITE, `write:${user.id}`)) || putData(request, env, user);
  if (path === "/api/logout-all" && m === "POST") return logoutAll(request, env, user);
  if (path === "/api/account" && m === "DELETE") return deleteAccount(env, user);

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname.startsWith("/api/")) return await api(request, env, pathname);
      if (pathname === "/prayer-times.json") return (await limit(env.RL_API, `api:${clientKey(request, env)}`)) || (await prayerTimes(request, env, ctx));
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error("worker error:", e?.message); // never log tokens, emails, notes or cookies
      return json({ error: "server error" }, 500);
    }
  },
};
