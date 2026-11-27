// My Future Self Worker. Static files come from dist/ without running this code;
// only /api/* and /prayer-times.json reach fetch() below (see run_worker_first in wrangler.jsonc).
import { json } from "./http.js";
import { requireSameOrigin, getUser, publicUser, login, logout } from "./session.js";

async function api(request, env, path) {
  const refused = requireSameOrigin(request, env);
  if (refused) return refused;
  const m = request.method;

  if (path === "/api/login" && m === "POST") return login(request, env);
  if (path === "/api/logout" && m === "POST") return logout(request, env);

  const user = await getUser(request, env);
  const renew = user?.renewCookie ? { "Set-Cookie": user.renewCookie } : {};
  if (path === "/api/me" && m === "GET") return json({ user: user ? publicUser(user) : null }, 200, renew);

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname.startsWith("/api/")) return await api(request, env, pathname);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return json({ error: "server error" }, 500);
    }
  },
};
