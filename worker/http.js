// Small response helpers shared by every API route.

export function withSecurityHeaders(res) {
  const out = new Response(res.body, res);
  out.headers.set("X-Content-Type-Options", "nosniff");
  out.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!out.headers.has("Cache-Control")) out.headers.set("Cache-Control", "no-store");
  return out;
}

export function json(data, status = 200, headers = {}) {
  return withSecurityHeaders(
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } })
  );
}
