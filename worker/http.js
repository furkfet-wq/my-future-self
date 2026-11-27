// Small response helpers shared by every API route.

export const PERMISSIONS = "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)";

export function withSecurityHeaders(res) {
  const out = new Response(res.body, res);
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  out.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  out.headers.set("Permissions-Policy", PERMISSIONS);
  out.headers.set("X-Frame-Options", "DENY");
  if (!out.headers.has("Cache-Control")) out.headers.set("Cache-Control", "no-store");
  return out;
}

export function json(data, status = 200, headers = {}) {
  return withSecurityHeaders(
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } })
  );
}

// Who is asking, for rate limits: the visitor's IP (tests may name a client, only when TEST_MODE is set locally).
export function clientKey(request, env) {
  if (env.TEST_MODE === "1" && request.headers.get("X-Test-Client")) return request.headers.get("X-Test-Client");
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

// Workers rate-limiting binding: over the limit -> 429. No binding configured -> no limit.
export async function limit(binding, key) {
  if (!binding) return null;
  const { success } = await binding.limit({ key });
  return success ? null : json({ error: "slow down" }, 429, { "Retry-After": "60" });
}
