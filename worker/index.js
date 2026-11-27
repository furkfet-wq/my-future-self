// My Future Self Worker. Static files come from dist/ without running this code;
// only /api/* and /prayer-times.json reach fetch() below (see run_worker_first in wrangler.jsonc).
import { json } from "./http.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return json({ error: "server error" }, 500);
    }
  },
};
